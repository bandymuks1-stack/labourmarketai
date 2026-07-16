import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Company Architecture Completion v1 guards (Sprint v2 §5).
 *
 * Pins the four load-bearing decisions of the slice so a future patch cannot
 * silently regress them:
 *
 *  1. Multi-company switching EXTENDS the existing membership model
 *     (organizations + engagement_contexts + relationship_types) — the
 *     migration adds a pointer + validation, it does NOT create a parallel
 *     `company_memberships` truth.
 *  2. Both owner-gated migrations are default-closed (no anon grants, RLS
 *     enabled where a table is created), carry a -- DOWN section, a paired
 *     rollback file and a Deferred APPLIED_LEDGER entry.
 *  3. The header switcher renders ONLY for a real multi-company profile
 *     (shared pure helper) and the active org pointer is membership-
 *     validated server-side.
 *  4. Dashboard card preferences are SERVER-side per (profile, context) with
 *     an honest device-local fallback while the migration is unapplied.
 */

const WEB = resolve(__dirname, "..", "..");
const REPO = resolve(WEB, "..", "..");

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const MEMBERSHIPS_MIG =
  "supabase/migrations/20260714210000_company_memberships_v1.sql";
const PREFS_MIG =
  "supabase/migrations/20260714211000_dashboard_preferences_v1.sql";

/** Executable SQL only — headers explain forbidden things by name. */
function sqlOnly(src: string): string {
  return src
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

// ── 1. memberships migration: extend, don't duplicate ─────────────────────

describe("company memberships v1 migration (20260714210000)", () => {
  const raw = readRepo(MEMBERSHIPS_MIG);
  const sql = sqlOnly(raw);

  it("does NOT create a parallel company_memberships table — the existing model is extended", () => {
    expect(sql).not.toMatch(/create\s+table[^;]*company_memberships/);
    // The pointer lives on profiles, validated against the EXISTING spine.
    expect(sql).toMatch(/alter\s+table\s+public\.profiles[\s\S]*active_organization_id/);
    expect(sql).toMatch(/engagement_contexts/);
    expect(sql).toMatch(/relationship_types/);
  });

  it("membership slugs come from the existing §10 registry (viewer seeded idempotently)", () => {
    expect(sql).toMatch(
      /insert\s+into\s+public\.relationship_types[\s\S]*'viewer'[\s\S]*on\s+conflict\s*\(slug\)\s*do\s+nothing/,
    );
  });

  it("pointer is default-closed: validation trigger rejects non-membership orgs", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.validate_active_organization/);
    expect(sql).toMatch(/raise\s+exception\s+'active_organization_not_member'/);
    expect(sql).toMatch(/errcode\s*=\s*'42501'/);
    expect(sql).toMatch(/before\s+update\s+of\s+active_organization_id\s+on\s+public\.profiles/);
    expect(sql).toMatch(/before\s+insert\s+on\s+public\.profiles/);
  });

  it("backfill is idempotent and defaults to the OLDEST owned org", () => {
    expect(sql).toMatch(/where\s+p\.active_organization_id\s+is\s+null/);
    expect(sql).toMatch(/order\s+by\s+o\.created_at\s+asc/);
  });

  it("no anon access, no RLS/policy widening, marked DRAFT + human-gated", () => {
    expect(sql).not.toMatch(/to\s+anon\b/);
    expect(sql).not.toMatch(/create\s+policy/);
    expect(sql).not.toMatch(/drop\s+policy/);
    expect(raw).toMatch(/DRAFT — needs-human-gate/);
    expect(raw).toMatch(/@human-gate-approved/);
  });

  it("carries a -- DOWN section + paired rollback file", () => {
    expect(raw).toMatch(/-- DOWN/);
    expect(
      readRepo("supabase/rollbacks/20260714210000_company_memberships_v1.down.sql"),
    ).toMatch(/drop\s+column\s+if\s+exists\s+active_organization_id/i);
  });
});

// ── 2. dashboard preferences migration ─────────────────────────────────────

describe("dashboard preferences v1 migration (20260714211000)", () => {
  const raw = readRepo(PREFS_MIG);
  const sql = sqlOnly(raw);

  it("creates the (profile_id, context) table with the CLOSED context slug set", () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.dashboard_preferences/);
    expect(sql).toMatch(/context\s+in\s*\('person',\s*'company'\)/);
    expect(sql).toMatch(/primary\s+key\s*\(profile_id,\s*context\)/);
  });

  it("bounds preferences to 8 KB at the DB layer", () => {
    expect(sql).toMatch(/pg_column_size\(preferences\)\s*<=\s*8192/);
  });

  it("RLS enabled + owner-only CRUD policies (auth.uid()) — default-closed", () => {
    expect(sql).toMatch(/alter\s+table\s+public\.dashboard_preferences\s+enable\s+row\s+level\s+security/);
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(sql).toMatch(
        new RegExp(`create\\s+policy\\s+dashboard_preferences_${op}`),
      );
    }
    expect(sql).toMatch(/profile_id\s*=\s*auth\.uid\(\)/);
  });

  it("grants to authenticated only — anon gets nothing", () => {
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete[\s\S]*to\s+authenticated/);
    expect(sql).not.toMatch(/to\s+anon\b/);
    expect(sql).not.toMatch(/grant[^;]*to\s+public\b/);
  });

  it("marked DRAFT + human-gated, carries -- DOWN + paired rollback", () => {
    expect(raw).toMatch(/DRAFT — needs-human-gate/);
    expect(raw).toMatch(/@human-gate-approved/);
    expect(raw).toMatch(/-- DOWN/);
    expect(
      readRepo("supabase/rollbacks/20260714211000_dashboard_preferences_v1.down.sql"),
    ).toMatch(/drop\s+table\s+if\s+exists\s+public\.dashboard_preferences/i);
  });
});

// ── 3. ledger honesty ───────────────────────────────────────────────────────

describe("APPLIED_LEDGER carries both deferred entries", () => {
  const ledger = readRepo("docs/APPLIED_LEDGER.md");

  it("company_memberships_v1 is listed as Deferred (NOT applied)", () => {
    expect(ledger).toContain("20260714210000_company_memberships_v1.sql");
    expect(ledger).toContain(
      "supabase/rollbacks/20260714210000_company_memberships_v1.down.sql",
    );
  });

  it("dashboard_preferences_v1 is listed as Deferred (NOT applied)", () => {
    expect(ledger).toContain("20260714211000_dashboard_preferences_v1.sql");
    expect(ledger).toContain(
      "supabase/rollbacks/20260714211000_dashboard_preferences_v1.down.sql",
    );
  });
});

// ── 4. switcher honesty (source pins) ───────────────────────────────────────

describe("company switcher wiring", () => {
  it("visibility comes from the ONE pure helper (multi-company only)", () => {
    const sw = read("components/app/role-switcher.tsx");
    expect(sw).toMatch(/shouldOfferOrganizationSwitch/);
    expect(sw).toMatch(/data-testid="org-switcher-list"/);
    const helper = read("lib/company/organization-switch.ts");
    expect(helper).toMatch(/organizations\.length\s*>\s*1/);
  });

  it("active org resolution is membership-validated and 42703-degrading (server-side, never localStorage)", () => {
    const src = read("lib/company/active-organization.ts");
    expect(src).toMatch(/resolveActiveOrganizationId/);
    expect(src).toMatch(/42703/);
    expect(src).not.toMatch(/localStorage/);
  });

  it("switch action validates membership BEFORE writing and degrades on 42703", () => {
    const src = read("lib/company/organization-actions.ts");
    expect(src).toMatch(/getOwnedOrganizations/);
    expect(src).toMatch(/needs-migration/);
    expect(src).toMatch(/active_organization_id/);
  });

  it("the dashboard layout feeds the provider from the active-organization context", () => {
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/getActiveOrganizationContext/);
    expect(layout).toMatch(/organizations,/);
    expect(layout).toMatch(/activeOrganizationId,/);
  });
});

// ── 5. server-side dashboard preferences wiring ─────────────────────────────

describe("server-side dashboard card preferences", () => {
  it("read + write both feature-detect the unapplied migration (42P01) and fall back honestly", () => {
    const reader = read("lib/dashboard/preferences.ts");
    expect(reader).toMatch(/42P01/);
    expect(reader).toMatch(/unavailable/);
    const action = read("lib/dashboard/preferences-actions.ts");
    expect(action).toMatch(/42P01/);
    expect(action).toMatch(/sanitizeCardPrefs/);
    expect(action).toMatch(/fitsPreferencesByteBudget/);
  });

  it("the grid keeps the device-local fallback ONLY when the server store is unavailable", () => {
    const grid = read("components/app/dashboard/dashboard-module-grid.tsx");
    expect(grid).toMatch(/serverPrefs/);
    expect(grid).toMatch(/saveDashboardCardPreferences/);
    expect(grid).toMatch(/CARD_PREFS_STORAGE_KEY/); // fallback still exists
    expect(grid).toMatch(/if \(serverMode\) return/); // no local read in server mode
  });

  it("the overview passes per-context server prefs to BOTH grid render sites", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    // Wagon 2: the prefs read is kicked off BEFORE the main batch (overlapped
    // promise chained off the request-cached session profile) — still strictly
    // per-(profile, context): worker → person, everything else → company.
    expect(page).toMatch(
      /getDashboardCardPreferences\(\s*prefsRole === "worker" \? "person" : "company",?\s*\)/,
    );
    expect(page).toMatch(/await cardPrefsPromise/);
    expect(
      (page.match(/serverPrefs=\{serverCardPrefs\}/g) ?? []).length,
    ).toBe(2);
  });
});

// ── 6. decision-first company overview ──────────────────────────────────────

describe("company overview decisions strip", () => {
  const page = read("app/[locale]/dashboard/company/page.tsx");

  it("renders a count-gated decisions strip from ALREADY-fetched reads", () => {
    expect(page).toMatch(/data-testid="company-decisions-strip"/);
    expect(page).toMatch(/reviewPendingCount/);
    // Count-gated: zero pending renders nothing (no fake urgency).
    expect(page).toMatch(/\.filter\(\(e\) => e\.count > 0\)/);
    expect(page).toMatch(/decisionEntries\.length === 0\) return null/);
  });

  it("every decision chip links a real destination", () => {
    expect(page).toMatch(/dashboard\/inbox/);
    expect(page).toMatch(/#company-invitations/);
    expect(page).toMatch(/#company-claims/);
    expect(page).toMatch(/id="company-claims"/);
  });
});

// ── 7. i18n keys exist in every active locale ───────────────────────────────

describe("company/account i18n keys (lt/en/ru/nl/de)", () => {
  const locales = ["lt", "en", "ru", "nl", "de"] as const;
  for (const locale of locales) {
    it(`${locale}: companySwitcher + roleDashboards.company.decisions keys exist and are translated`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      expect(m.companySwitcher?.heading, `${locale} companySwitcher.heading`).toBeTypeOf("string");
      expect(m.companySwitcher?.note, `${locale} companySwitcher.note`).toBeTypeOf("string");
      const d = m.roleDashboards?.company?.decisions;
      for (const key of ["title", "review", "invitations", "claims"]) {
        expect(d?.[key], `${locale} decisions.${key}`).toBeTypeOf("string");
        expect(d?.[key]).not.toMatch(/^\[EN\]/);
      }
    });
  }
});
