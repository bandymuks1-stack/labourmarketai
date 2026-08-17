import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECT_LIFECYCLE_STAGES,
  ENDED_REASONS,
  LIFECYCLE_EVENT_ACTIONS,
  LIFECYCLE_NOTICES,
  LIFECYCLE_STAGES,
  OFFBOARDING_ITEM_KINDS,
  ONBOARDING_ITEM_KINDS,
  RUN_ITEM_STATUSES,
  RUN_STATUSES,
  WORKER_CONFIRMABLE_KINDS,
  deriveLifecycleStage,
} from "@/lib/lifecycle/lifecycle-model";

/**
 * EMPLOYEE LIFECYCLE guards (EC-canonical lifecycle v1).
 *
 * The lifecycle engine builds ON the canonical employment record
 * `engagement_contexts` (lead decision, duplication-consolidation plan v1)
 * and around the EXISTING canonical end path. These pins keep the TS↔SQL
 * contract and the doctrine honest:
 *
 *   - exactly ONE human-gated migration owns the lifecycle names, with a
 *     paired rollback (rollback itself unmarked);
 *   - the end command CALLS end_org_membership_v1 — it never forks or
 *     redefines it, and never flips engagement status directly;
 *   - writes are RPC-only at BOTH layers (SQL revoke + zero write
 *     policies; app-side no .insert/.update/.delete in lib/lifecycle);
 *   - the lifecycle history ledger is append-only for every role;
 *   - reference links are VERIFIED against the real rows (work_tasks /
 *     document_acknowledgements / asset_assignments), never trusted;
 *   - honest degradation while unapplied (42P01/42703/42883/PGRST202 →
 *     calm "not enabled yet", nothing faked);
 *   - NO new dashboard route: the areas expand INSIDE /dashboard/company
 *     and /dashboard/start (approvals-on-network precedent);
 *   - NO notification-constraint touch (the train scope forbids it).
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(join(REPO, rel), "utf8");

const ENGINE = "20260817190000_employee_lifecycle_v1";
const MIGRATION = readRepo(`supabase/migrations/${ENGINE}.sql`);
const ROLLBACK = readRepo(`supabase/rollbacks/${ENGINE}.down.sql`);

const MODEL = read("lib/lifecycle/lifecycle-model.ts");
const READS = read("lib/lifecycle/lifecycle.ts");
const ACTIONS = read("lib/lifecycle/lifecycle-actions.ts");
const SECTION = read("app/[locale]/dashboard/company/lifecycle-section.tsx");
const COMPANY_PAGE = read("app/[locale]/dashboard/company/page.tsx");
const WORKER_SECTION = read(
  "app/[locale]/dashboard/start/my-onboarding-section.tsx",
);
const START_PAGE = read("app/[locale]/dashboard/start/page.tsx");

const COMMANDS = [
  "create_onboarding_template_v1",
  "start_onboarding_run_v1",
  "assign_onboarding_item_v1",
  "set_onboarding_item_status_v1",
  "complete_onboarding_run_v1",
  "cancel_onboarding_run_v1",
  "start_offboarding_run_v1",
  "set_offboarding_item_status_v1",
  "complete_offboarding_run_v1",
  "cancel_offboarding_run_v1",
  "set_engagement_lifecycle_stage_v1",
  "end_engagement_lifecycle_v1",
] as const;

const TABLES = [
  "engagement_lifecycle_events",
  "onboarding_templates",
  "onboarding_template_items",
  "onboarding_runs",
  "onboarding_run_items",
  "offboarding_runs",
  "offboarding_run_items",
] as const;

describe("employee lifecycle v1 — migration contract", () => {
  it("the migration is human-gated with the mandate citation and a paired rollback", () => {
    expect(MIGRATION).toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/);
    expect(MIGRATION).toContain("owner mandate 2026-08-17");
    expect(MIGRATION).toContain("DRAFT — needs-human-gate");
    expect(MIGRATION).toContain(
      "docs/human-gates/employee-lifecycle-gate.md",
    );
    expect(
      existsSync(join(REPO, `supabase/rollbacks/${ENGINE}.down.sql`)),
    ).toBe(true);
    // The rollback carries no marker — there is nothing to approve in undoing.
    expect(ROLLBACK).not.toMatch(
      /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i,
    );
  });

  it("declares all seven tables and all twelve commands, every function locked to authenticated", () => {
    for (const t of TABLES) {
      expect(MIGRATION).toContain(`create table if not exists public.${t}`);
      expect(MIGRATION).toContain(
        `alter table public.${t} enable row level security`,
      );
    }
    for (const fn of COMMANDS) {
      expect(MIGRATION).toContain(`create or replace function public.${fn}(`);
      expect(MIGRATION).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`),
      );
      expect(MIGRATION).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`),
      );
      expect(MIGRATION).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`,
        ),
      );
    }
    // Every command + helper is SECURITY DEFINER with a pinned search_path.
    const definerCount = (MIGRATION.match(/security definer/g) ?? []).length;
    const pinnedCount = (MIGRATION.match(/set search_path = public/g) ?? [])
      .length;
    expect(definerCount).toBeGreaterThanOrEqual(15);
    // The trigger guard is not SECURITY DEFINER but IS search_path-pinned.
    expect(pinnedCount).toBeGreaterThanOrEqual(definerCount);
  });

  it("writes are RPC-only: explicit revoke, SELECT-only grant, zero write policies", () => {
    expect(MIGRATION).toMatch(/revoke all on public\.engagement_lifecycle_events,/);
    expect(MIGRATION).toMatch(/grant select on public\.engagement_lifecycle_events,/);
    // No insert/update/delete policy on any lifecycle table.
    expect(MIGRATION).not.toMatch(/create policy \w+ on public\.\w+\s+for (insert|update|delete)/i);
    // anon appears only in REVOKE lines — never granted anything.
    for (const line of MIGRATION.split(/\r?\n/)) {
      if (line.trim().startsWith("--")) continue;
      if (/\banon\b/.test(line) && /\bgrant\b/i.test(line)) {
        throw new Error(`anon grant found in migration: ${line.trim()}`);
      }
    }
  });

  it("the lifecycle ledger is append-only via trigger, like the workflow transitions precedent", () => {
    expect(MIGRATION).toContain(
      "create trigger engagement_lifecycle_events_append_only",
    );
    expect(MIGRATION).toMatch(
      /before update or delete on public\.engagement_lifecycle_events/,
    );
    expect(MIGRATION).toContain("engagement_lifecycle_events is append-only");
  });

  it("EC columns are additive and NULLABLE — no backfill DML, no NOT NULL, no defaults", () => {
    for (const col of [
      "lifecycle_stage",
      "probation_until",
      "ended_reason",
      "ended_note",
    ]) {
      expect(MIGRATION).toContain(`add column if not exists ${col}`);
    }
    // No statement-level backfill of engagement_contexts outside function
    // bodies: the only `update public.engagement_contexts` occurrences must
    // sit inside plpgsql bodies (heuristic: every occurrence is preceded by
    // significant indentation, never at column 0).
    for (const line of MIGRATION.split(/\r?\n/)) {
      if (/^update public\.engagement_contexts/i.test(line)) {
        throw new Error(`top-level EC backfill found: ${line.trim()}`);
      }
    }
    expect(MIGRATION).not.toMatch(/alter table public\.engagement_contexts[^;]*set not null/i);
  });

  it("end_engagement_lifecycle_v1 wraps the canonical end path — never forks it", () => {
    expect(MIGRATION).toContain("public.end_org_membership_v1(v_ec_id");
    expect(MIGRATION).not.toMatch(
      /create or replace function public\.end_org_membership_v1/i,
    );
    // The wrapper never flips engagement status itself — status changes
    // belong to the canonical RPC alone.
    expect(MIGRATION).not.toMatch(
      /update public\.engagement_contexts\s+set[^;]*\bstatus\s*=/i,
    );
    expect(MIGRATION).toContain("'offboarding_open'");
  });

  it("reference links are verified against the real rows, never trusted", () => {
    expect(MIGRATION).toContain("from public.work_tasks wt");
    expect(MIGRATION).toMatch(/wt\.status = 'done'/);
    expect(MIGRATION).toContain("from public.document_acknowledgements a");
    expect(MIGRATION).toMatch(/a\.acknowledged_at is not null/);
    expect(MIGRATION).toMatch(/aa\.status = 'returned'/);
    expect(MIGRATION).toContain("'asset_not_returned'");
    // Offboarding asset items come from the ORG-SCOPED open assignments.
    expect(MIGRATION).toMatch(/a\.organization_id = v_ec\.organization_id/);
  });

  it("SQL vocabularies match the TS model exactly", () => {
    // Stages (CHECK on engagement_contexts.lifecycle_stage).
    expect(MIGRATION).toContain(
      "('onboarding','active','probation','change_pending','offboarding','ended')",
    );
    expect([...LIFECYCLE_STAGES].join(",")).toBe(
      "onboarding,active,probation,change_pending,offboarding,ended",
    );
    // Ended reasons.
    expect(MIGRATION).toContain(
      "('resignation','termination','contract_end','mutual_agreement','retirement','other')",
    );
    expect([...ENDED_REASONS].join(",")).toBe(
      "resignation,termination,contract_end,mutual_agreement,retirement,other",
    );
    // Item kinds.
    expect(MIGRATION).toContain(
      "('task','document_ack','asset_issue','training_note','custom')",
    );
    expect([...ONBOARDING_ITEM_KINDS].join(",")).toBe(
      "task,document_ack,asset_issue,training_note,custom",
    );
    expect(MIGRATION).toContain(
      "('asset_return','document_ack','access_removal','final_evidence','custom')",
    );
    expect([...OFFBOARDING_ITEM_KINDS].join(",")).toBe(
      "asset_return,document_ack,access_removal,final_evidence,custom",
    );
    // Run + item statuses.
    expect(MIGRATION).toContain("('in_progress','completed','cancelled')");
    expect([...RUN_STATUSES].join(",")).toBe("in_progress,completed,cancelled");
    expect(MIGRATION).toContain("('pending','done','skipped')");
    expect([...RUN_ITEM_STATUSES].join(",")).toBe("pending,done,skipped");
    // Ledger actions.
    for (const action of LIFECYCLE_EVENT_ACTIONS) {
      expect(MIGRATION).toContain(`'${action}'`);
    }
    // Direct stages are the probation/change subset — never onboarding/
    // offboarding/ended (those belong to the run/end commands).
    expect([...DIRECT_LIFECYCLE_STAGES].join(",")).toBe(
      "active,probation,change_pending",
    );
    expect(MIGRATION).toContain(
      "v_stage not in ('active','probation','change_pending')",
    );
  });

  it("touches NOTHING owned by sibling trains", () => {
    // Object references only (comments may NAME what is out of scope).
    const objectRef = (name: string) =>
      new RegExp(
        `(from|join|update|insert into|alter table|references|drop table)\\s+public\\.${name}\\b`,
        "i",
      );
    for (const forbidden of [
      "notification_events",
      "company_worker_engagements",
      "company_workers",
      "agency_workers",
      "invitations",
      "worker_documents",
      "org_documents",
      "workflow_\\w+",
    ]) {
      expect(MIGRATION).not.toMatch(objectRef(forbidden));
    }
    expect(MIGRATION).not.toMatch(/create or replace function public\.(manages_organization|caller_manages_worker|is_admin|end_org_membership_v1)\b/);
    expect(MIGRATION).not.toMatch(/alter table public\.(work_tasks|assets|asset_assignments|document_acknowledgements|org_documents|workflow_\w+)/);
  });
});

describe("employee lifecycle v1 — app layer contract", () => {
  it("the derived-stage read rule mirrors the SQL COALESCE guards", () => {
    expect(deriveLifecycleStage("active", null)).toBe("active");
    expect(deriveLifecycleStage("ended", null)).toBe("ended");
    expect(deriveLifecycleStage("active", "probation")).toBe("probation");
    expect(deriveLifecycleStage("paused", null)).toBe("active");
    expect(deriveLifecycleStage("active", "nonsense")).toBe("active");
    expect(MIGRATION).toContain("coalesce(ec.lifecycle_stage,");
  });

  it("actions call exactly the twelve gated commands and never write tables directly", () => {
    for (const fn of COMMANDS) {
      expect(ACTIONS).toContain(`"${fn}"`);
    }
    for (const file of [ACTIONS, READS]) {
      expect(file).not.toMatch(/\.insert\(/);
      expect(file).not.toMatch(/\.update\(/);
      expect(file).not.toMatch(/\.delete\(/);
      expect(file).not.toMatch(/\.upsert\(/);
      // Caller-scoped client only — never the service-role admin client.
      expect(file).not.toContain("createAdminClient");
    }
    expect(ACTIONS).toContain('"use server"');
    expect(ACTIONS).toContain('import "server-only"');
  });

  it("honest degradation while unapplied, on every layer", () => {
    expect(MODEL).toContain('"42P01"');
    expect(MODEL).toContain('"42883"');
    expect(MODEL).toContain('"PGRST202"');
    expect(READS).toContain('{ status: "needs-migration" }');
    expect(ACTIONS).toContain('return "needs_migration"');
    expect(SECTION).toContain('t("unavailable")');
    // Nothing sends anything anywhere (code paths; doc comments may state
    // the doctrine in words).
    for (const file of [ACTIONS, READS, SECTION, WORKER_SECTION]) {
      expect(file).not.toMatch(/sendgrid|nodemailer|twilio|fetch\(/i);
    }
  });

  it("the notices vocabulary is closed and every SQL outcome maps into it", () => {
    for (const outcome of [
      "already_running",
      "items_open",
      "run_closed",
      "link_invalid",
      "asset_not_returned",
      "offboarding_open",
      "onboarding_open",
      "invalid_responsible",
      "template_not_found",
      "not_org_scoped",
      "not_active",
    ]) {
      expect(MIGRATION).toContain(`'${outcome}'`);
      expect((LIFECYCLE_NOTICES as readonly string[]).includes(outcome)).toBe(
        true,
      );
    }
    // last_owner / already_ended pass THROUGH from the canonical
    // end_org_membership_v1 outcome — the notice vocabulary must carry them
    // even though this migration never returns the literal itself.
    expect((LIFECYCLE_NOTICES as readonly string[]).includes("last_owner")).toBe(true);
    expect((LIFECYCLE_NOTICES as readonly string[]).includes("already_ended")).toBe(true);
  });

  it("worker self-confirmation is limited to the honest kinds at BOTH layers", () => {
    expect([...WORKER_CONFIRMABLE_KINDS].join(",")).toBe(
      "document_ack,training_note,custom",
    );
    expect(MIGRATION).toContain(
      "v_row.kind not in ('document_ack','training_note','custom')",
    );
    expect(WORKER_SECTION).toContain("WORKER_CONFIRMABLE_KINDS");
  });

  it("NO new dashboard route — the areas live inside existing declared pages", () => {
    expect(
      existsSync(join(ROOT, "app/[locale]/dashboard/lifecycle")),
    ).toBe(false);
    expect(COMPANY_PAGE).toContain("<LifecycleSection");
    expect(COMPANY_PAGE).toContain("isLifecycleNotice");
    expect(START_PAGE).toContain("<MyOnboardingSection");
    expect(SECTION).toContain('id="lifecycle"');
  });

  it("all 11 locales carry the lifecycle namespace with EN key parity", () => {
    const locales = [
      "en",
      "lt",
      "lv",
      "et",
      "nl",
      "de",
      "da",
      "no",
      "sv",
      "pl",
      "ru",
    ];
    const flat = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : [`${p}${k}`],
      );
    const en = JSON.parse(read("messages/en.json")).lifecycle;
    expect(en).toBeTruthy();
    const enKeys = flat(en).sort().join("|");
    for (const locale of locales) {
      const ns = JSON.parse(read(`messages/${locale}.json`)).lifecycle;
      expect(ns, `messages/${locale}.json lifecycle namespace`).toBeTruthy();
      expect(flat(ns).sort().join("|"), `${locale} key parity`).toBe(enKeys);
      // Real translations, no debt markers in this namespace.
      for (const key of flat(ns)) {
        const value = key
          .split(".")
          .reduce((acc: unknown, part) => (acc as Record<string, unknown>)[part], ns);
        expect(String(value).startsWith("[EN]"), `${locale}:${key} carries [EN]`).toBe(false);
      }
    }
  });
});
