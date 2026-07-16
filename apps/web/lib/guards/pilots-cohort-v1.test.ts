import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNNEL_EVENT_NAMES } from "@/lib/telemetry/funnel-events";

/**
 * Pinning tests for WAGON 5 — Pilot Onboarding and Measurement v1.
 *
 * Contract (encoded here so future edits can't silently regress):
 *   - The pilots_cohort_v1 migration is DRAFT-GATED (needs-human-gate
 *     header), additive-only, RLS-enabled with admin-only SELECT and
 *     RPC-only writes; pilot_outcomes is an append-only ledger whose ONLY
 *     free text is the 500-char-bounded note; a rollback file exists.
 *   - Every write RPC is SECURITY DEFINER, re-checks public.is_admin()
 *     and appends an audit_logs row.
 *   - The admin pilots pages are superadmin-gated, use no service_role,
 *     degrade honestly while the migration is unapplied, and label
 *     outcomes as owner-recorded — never platform-verified.
 *   - The new onboarding step events are bounded snake_case names that
 *     carry no PII-shaped metadata.
 *   - Time-to-value stays honest: preview traffic excluded, global-only
 *     (no fake cohort slicing), no unique-visitor claims.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const APP_ROOT = process.cwd();

const MIGRATION_REL =
  "supabase/migrations/20260716140000_pilots_cohort_v1.sql";
const ROLLBACK_REL =
  "supabase/rollbacks/20260716140000_pilots_cohort_v1.down.sql";

function readRepo(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8");
}
function readApp(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf-8");
}

const migration = readRepo(MIGRATION_REL);
const listPage = readApp("app/[locale]/dashboard/admin/pilots/page.tsx");
const detailPage = readApp(
  "app/[locale]/dashboard/admin/pilots/[id]/page.tsx",
);
const actions = readApp("lib/admin/pilot-actions.ts");
const reads = readApp("lib/admin/pilots.ts");
const metrics = readApp("lib/admin/pilot-metrics.ts");
const registry = readApp("lib/telemetry/funnel-events.ts");
const enMessages = JSON.parse(
  readFileSync(join(APP_ROOT, "messages", "en.json"), "utf-8"),
) as { adminPilots: Record<string, unknown> };

describe("pilots_cohort_v1 migration — draft gate + rollback", () => {
  it("carries the needs-human-gate DRAFT header", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
  });

  it("ships a rollback file that drops exactly the three feature tables", () => {
    expect(existsSync(join(REPO_ROOT, ROLLBACK_REL))).toBe(true);
    const rollback = readRepo(ROLLBACK_REL);
    for (const table of ["pilots", "pilot_participants", "pilot_outcomes"]) {
      expect(rollback).toMatch(
        new RegExp(`drop table if exists public\\.${table}`, "i"),
      );
    }
  });

  it("is additive — no DROP / no ALTER drop / no DELETE FROM in the forward file", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|function|policy)\b/i);
    expect(migration).not.toMatch(/\balter\s+table[\s\S]*\bdrop\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("pilots_cohort_v1 migration — tables, bounds, no PII", () => {
  it("creates the three tables", () => {
    for (const table of ["pilots", "pilot_participants", "pilot_outcomes"]) {
      expect(migration).toMatch(
        new RegExp(`create table if not exists public\\.${table}`, "i"),
      );
    }
  });

  it("pilots: bounded name, company_type vocabulary + mixed, status ladder, window check", () => {
    expect(migration).toMatch(/char_length\(name\) between 2 and 120/i);
    for (const kind of [
      "construction",
      "staffing_agency",
      "subcontractor",
      "manufacturing",
      "services",
      "client_customer",
      "other",
      "mixed",
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
    expect(migration).toMatch(
      /status in \('draft','active','closed'\)/i,
    );
    expect(migration).toMatch(/ends_on >= starts_on/i);
  });

  it("pilot_participants: joined_via enum + unique(pilot_id, profile_id)", () => {
    expect(migration).toMatch(/joined_via in \('invitation','manual'\)/i);
    expect(migration).toMatch(/unique \(pilot_id, profile_id\)/i);
  });

  it("pilot_outcomes: 5-value outcome enum, note bounded at 500, no contact columns", () => {
    expect(migration).toMatch(
      /outcome in \(\s*'contact_made','enquiry_made','booking_accepted',\s*'hire_reported','no_outcome'\)/i,
    );
    expect(migration).toMatch(/char_length\(note\) <= 500/i);
    // The cohort model must never grow contact / free-text PII columns.
    for (const forbidden of ["email", "phone", "address", "contact_"]) {
      expect(migration).not.toMatch(
        new RegExp(`^\\s*${forbidden}\\w*\\s+text`, "im"),
      );
    }
  });
});

describe("pilots_cohort_v1 migration — RLS + RPC-only writes", () => {
  it("enables RLS on all three tables", () => {
    for (const table of ["pilots", "pilot_participants", "pilot_outcomes"]) {
      expect(migration).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i",
        ),
      );
    }
  });

  it("SELECT policies are admin-only via public.is_admin()", () => {
    for (const table of ["pilots", "pilot_participants", "pilot_outcomes"]) {
      expect(migration).toMatch(
        new RegExp(
          `create policy ${table}_select on public\\.${table} for select\\s+using \\(public\\.is_admin\\(\\)\\)`,
          "i",
        ),
      );
    }
  });

  it("declares NO INSERT / UPDATE / DELETE policies (writes are RPC-only)", () => {
    expect(migration).not.toMatch(/create policy[\s\S]{0,120}for insert/i);
    expect(migration).not.toMatch(/create policy[\s\S]{0,120}for update/i);
    expect(migration).not.toMatch(/create policy[\s\S]{0,120}for delete/i);
  });

  it("grants select only to authenticated (no anon / public / write grants)", () => {
    for (const table of ["pilots", "pilot_participants", "pilot_outcomes"]) {
      expect(migration).toMatch(
        new RegExp(`grant select on public\\.${table} to authenticated`, "i"),
      );
    }
    expect(migration).not.toMatch(/grant[^;]*\b(insert|update|delete)\b[^;]*on public\.pilot/i);
    expect(migration).not.toMatch(/grant[^;]*to\s+anon\b/i);
    expect(migration).not.toMatch(/grant[^;]*to\s+public\b/i);
  });

  const RPCS = [
    "create_pilot_v1",
    "set_pilot_status_v1",
    "add_pilot_participant_v1",
    "remove_pilot_participant_v1",
    "record_pilot_outcome_v1",
  ] as const;

  for (const fn of RPCS) {
    it(`${fn} is SECURITY DEFINER, admin-checked and audited`, () => {
      const start = migration.indexOf(`create or replace function public.${fn}(`);
      expect(start, `${fn} missing`).toBeGreaterThanOrEqual(0);
      const body = migration.slice(start, migration.indexOf("$$;", start) + 3);
      expect(body).toMatch(/security definer/i);
      expect(body).toMatch(/set search_path = public/i);
      expect(body).toMatch(/public\.is_admin\(\)/);
      expect(body).toMatch(/insert into public\.audit_logs/i);
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\(`, "i"),
      );
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`,
          "i",
        ),
      );
    });
  }

  it("no RPC ever UPDATEs or DELETEs pilot_outcomes (append-only ledger)", () => {
    expect(migration).not.toMatch(/update public\.pilot_outcomes/i);
    expect(migration).not.toMatch(/delete from public\.pilot_outcomes/i);
  });
});

describe("admin pilots surface — gates, degradation, honesty", () => {
  it("both pages require superadmin server-side and never use service_role", () => {
    for (const page of [listPage, detailPage]) {
      expect(page).toMatch(/from\s+["']@\/lib\/auth\/superadmin["']/);
      expect(page).toMatch(/await\s+requireSuperadmin\(\s*locale\s*\)/);
      expect(page).not.toMatch(/service[_-]?role/i);
      expect(page).not.toMatch(/createAdminClient/);
    }
  });

  it("both pages render the honest needs-migration state (no fake surface)", () => {
    for (const page of [listPage, detailPage]) {
      expect(page).toContain("pilots-needs-migration");
      expect(page).toContain('t("needsMigration")');
    }
  });

  it("reads probe 42P01/42883 (team-brigades pattern) instead of erroring", () => {
    expect(reads).toContain("42P01");
    expect(reads).toContain("42883");
    expect(reads).toMatch(/isNeedsMigrationCode/);
  });

  it("server actions are double-gated and write ONLY through the definer RPCs", () => {
    expect(actions).toMatch(/requireSuperadmin\(/);
    expect(actions).not.toMatch(/service[_-]?role/i);
    // No direct table writes from the app layer.
    expect(actions).not.toMatch(/\.from\(\s*["']pilot/);
    for (const fn of [
      "create_pilot_v1",
      "set_pilot_status_v1",
      "add_pilot_participant_v1",
      "remove_pilot_participant_v1",
      "record_pilot_outcome_v1",
    ]) {
      expect(actions).toContain(`"${fn}"`);
    }
  });

  it("the outcome form carries the owner-recorded honesty label", () => {
    const forms = readApp("components/app/admin-pilots-forms.tsx");
    expect(forms).toContain('t("outcomes.honesty")');
    const honesty = (enMessages.adminPilots as { outcomes: { honesty: string } })
      .outcomes.honesty;
    expect(honesty).toMatch(/owner-recorded/i);
    expect(honesty).toMatch(/not platform-verified/i);
  });
});

describe("W5 onboarding step events — bounded, no PII", () => {
  it("registers both step events", () => {
    expect(FUNNEL_EVENT_NAMES).toContain("onboarding_step_role_completed");
    expect(FUNNEL_EVENT_NAMES).toContain("onboarding_step_profile_completed");
  });

  it("every funnel event name is bounded snake_case (fits pilot_events.event_name)", () => {
    for (const name of FUNNEL_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });

  it("the wizard passes only allowlisted, non-identifying metadata with the step events", () => {
    const wizard = readApp("components/app/onboarding-wizard.tsx");
    expect(wizard).toContain("onboardingStepRoleCompleted");
    expect(wizard).toContain("onboardingStepProfileCompleted");
    // No PII-shaped metadata keys anywhere in the wizard's telemetry calls.
    for (const forbidden of [
      "display_name:",
      "email:",
      "country:",
      "full_name:",
    ]) {
      const telemetryCalls = wizard
        .split("trackFunnel(")
        .slice(1)
        .map((s) => s.slice(0, s.indexOf(");") + 1));
      for (const call of telemetryCalls) {
        expect(call).not.toContain(forbidden);
      }
    }
  });

  it("the registry still carries no PII-shaped metadata keys", () => {
    for (const forbidden of ["email", "phone", "full_name", "display_name"]) {
      expect(registry.toLowerCase()).not.toContain(`${forbidden}?:`);
    }
  });
});

describe("time-to-value — honest limits", () => {
  it("excludes preview/non-production traffic like the acquisition funnel", () => {
    expect(metrics).toContain("preview_host");
    expect(metrics).toMatch(/excludedPreview/);
  });

  it("claims sessions, never unique visitors", () => {
    expect(metrics).toContain("no unique-visitor claims");
  });

  it("is global-only — no fake cohort slicing without the participants linkage", () => {
    // The module must not join pilot participants to telemetry sessions.
    expect(metrics).not.toMatch(/pilot_participants/);
    // And the detail page must state the limitation honestly.
    expect(detailPage).toContain("pilot-ttv-cohort-limitation");
    expect(detailPage).toContain('t("ttv.cohortLimitation")');
  });

  it("reads only bounded, non-PII columns from pilot_events", () => {
    expect(metrics).toContain(
      '"event_name, session_id, created_at, metadata"',
    );
    expect(metrics).not.toMatch(/profile_id/);
  });

  it("is rendered on the admin telemetry page as a folded section", () => {
    const telemetryPage = readApp(
      "app/[locale]/dashboard/admin/telemetry/page.tsx",
    );
    expect(telemetryPage).toContain("telemetry-time-to-value");
    expect(telemetryPage).toMatch(/<details/);
  });
});
