import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EMPLOYEE_REQUEST_DEFAULT_DEFINITION_SLUG,
  EMPLOYEE_REQUEST_NOTICES,
  EMPLOYEE_REQUEST_STATUSES,
  EMPLOYEE_REQUEST_TYPES,
  SCHEDULE_AFFECTING_REQUEST_TYPES,
  employeeRequestDefinitionSlug,
  resolveDisplayStatus,
} from "@/lib/requests/requests-model";
import { WORKFLOW_INSTANCE_STATUSES } from "@/lib/approvals/approvals-model";
import { ABSENCE_TYPES } from "@/lib/leave/absences-model";

/**
 * TYPED EMPLOYEE REQUESTS + LEAVE BALANCES guards (v1).
 *
 * The two hard rules this module lives by, pinned so they cannot drift:
 *
 *   1. NO per-type approval tables and NO engine forks — the lifecycle runs
 *      ONLY on the canonical Workflow & Approval Engine, consumed strictly
 *      through the engine's own public commands (no triggers on engine
 *      tables, no direct engine-table writes);
 *   2. the PROVEN absence path stays canonical and untouched — absence/
 *      leave is NOT in the request vocabulary, worker_absences DDL is not
 *      touched, and balances are a DERIVED, ADVISORY read-model with NO
 *      statutory defaults and NO stored balance anywhere.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(join(REPO, rel), "utf8");

const REQUESTS_MIG = "20260817180000_employee_requests_v1";
const POLICIES_MIG = "20260817181000_leave_balance_policies_v1";

const MIGRATION_REQ = readRepo(`supabase/migrations/${REQUESTS_MIG}.sql`);
const MIGRATION_POL = readRepo(`supabase/migrations/${POLICIES_MIG}.sql`);
const ROLLBACK_REQ = readRepo(`supabase/rollbacks/${REQUESTS_MIG}.down.sql`);
const ROLLBACK_POL = readRepo(`supabase/rollbacks/${POLICIES_MIG}.down.sql`);

const MODEL = read("lib/requests/requests-model.ts");
const READS = read("lib/requests/requests.ts");
const ACTIONS = read("lib/requests/requests-actions.ts");
const SECTION = read("app/[locale]/dashboard/network/requests-section.tsx");
const NETWORK_PAGE = read("app/[locale]/dashboard/network/page.tsx");
const BALANCES_MODEL = read("lib/leave/balances-model.ts");
const BALANCES = read("lib/leave/balances.ts");
const BALANCE_PANEL = read("app/[locale]/dashboard/absences/balance-panel.tsx");
const ABSENCES_PAGE = read("app/[locale]/dashboard/absences/page.tsx");

const REQUESTS_LAYER = [MODEL, READS, ACTIONS, SECTION];
const BALANCES_LAYER = [BALANCES_MODEL, BALANCES, BALANCE_PANEL];

const LOCALES = [
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
] as const;

describe("employee requests — migration pair shape", () => {
  it("both migrations ship gated DRAFT with the owner-mandate annotation and paired rollbacks", () => {
    for (const m of [MIGRATION_REQ, MIGRATION_POL]) {
      expect(m).toContain("DRAFT — needs-human-gate");
      expect(m).toContain("@human-gate-approved");
      expect(m).toContain("owner mandate 2026-08-17");
      expect(m).toMatch(/-- ROLLBACK/i);
    }
    expect(ROLLBACK_REQ).toContain("drop table if exists public.employee_requests");
    expect(ROLLBACK_POL).toContain(
      "drop table if exists public.leave_balance_policies",
    );
  });

  it("the requests migration asserts its engine prerequisites before creating anything", () => {
    for (const dep of [
      "workflow_instances",
      "start_workflow_instance_v1",
      "withdraw_workflow_instance_v1",
      "belongs_to_organization",
      "has_org_demand_access",
    ]) {
      expect(MIGRATION_REQ).toContain(dep);
    }
  });

  it("the ledger carries a PENDING APPLY BY LEAD entry for both files", () => {
    const ledger = readRepo("docs/APPLIED_LEDGER.md");
    for (const name of [REQUESTS_MIG, POLICIES_MIG]) {
      expect(ledger).toContain(`${name}.sql`);
      const entry = ledger.split(`${name}.sql`)[1]?.slice(0, 400) ?? "";
      expect(entry).toContain("PENDING APPLY BY LEAD");
    }
  });
});

describe("employee requests — ONE engine, no forks (hard rule)", () => {
  it("the SQL consumes the engine ONLY through its public commands", () => {
    expect(MIGRATION_REQ).toContain("public.start_workflow_instance_v1(");
    expect(MIGRATION_REQ).toContain("public.withdraw_workflow_instance_v1(");
    // No per-type approval tables: exactly ONE create table, the register.
    const creates = MIGRATION_REQ.match(/create table if not exists/g) ?? [];
    expect(creates).toHaveLength(1);
    expect(MIGRATION_REQ).toContain(
      "create table if not exists public.employee_requests",
    );
  });

  it("NEVER creates a trigger — engine tables belong to the engine train", () => {
    expect(MIGRATION_REQ.toLowerCase()).not.toContain("create trigger");
    expect(MIGRATION_POL.toLowerCase()).not.toContain("create trigger");
  });

  it("never writes an engine table directly (insert/update/delete on workflow_*)", () => {
    // The only engine mentions in DML position must be SELECTs; assert no
    // direct writes: any insert/update/delete followed by a workflow_ name.
    expect(MIGRATION_REQ).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.workflow_/i,
    );
  });

  it("the app layer writes only through RPCs (no .insert/.update/.delete/.upsert anywhere)", () => {
    for (const src of [...REQUESTS_LAYER, ...BALANCES_LAYER]) {
      expect(src).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    }
  });

  it("the deciding surface stays the EXISTING approvals inbox — the requests section renders no approve/reject action", () => {
    expect(SECTION).not.toContain("decideWorkflowStepAction");
    expect(SECTION).toContain("WorkflowTimeline");
  });

  it("the seed helper mints templates through the ENGINE's own commands", () => {
    expect(ACTIONS).toContain('"create_workflow_definition_v1"');
    expect(ACTIONS).toContain('"publish_workflow_version_v1"');
    expect(ACTIONS).toContain('"generic_request"');
  });

  it("mirror vocabulary is byte-identical to the engine instance statuses", () => {
    expect([...EMPLOYEE_REQUEST_STATUSES]).toEqual([
      ...WORKFLOW_INSTANCE_STATUSES,
    ]);
    // SQL side pins the same five words.
    expect(MIGRATION_REQ).toContain(
      "'pending','approved','rejected','withdrawn','cancelled'",
    );
  });

  it("mirror-sync semantics: same-transaction sync on create/withdraw, read-repair engine→mirror otherwise", () => {
    expect(MIGRATION_REQ).toContain("sync_employee_request_status_v1");
    // Read layer calls the repair command and overlays engine truth.
    expect(READS).toContain('"sync_employee_request_status_v1"');
    expect(READS).toContain("resolveDisplayStatus");
    // Pure overlay rule: engine truth wins.
    expect(
      resolveDisplayStatus("pending", "approved"),
    ).toEqual({ status: "approved", mirrorStale: true });
    expect(resolveDisplayStatus("pending", null)).toEqual({
      status: "pending",
      mirrorStale: false,
    });
  });
});

describe("employee requests — the absence path stays canonical (hard rule)", () => {
  it("absence/leave is NOT a request type", () => {
    for (const t of EMPLOYEE_REQUEST_TYPES) {
      expect(t).not.toMatch(/absence|leave|vacation|sick/);
    }
    // No LEAVE vocabulary word doubles as a request type ('other' is a
    // generic catch-all in both vocabularies, not a leave type).
    for (const absenceType of ABSENCE_TYPES.filter((t) => t !== "other")) {
      expect(EMPLOYEE_REQUEST_TYPES as readonly string[]).not.toContain(
        absenceType,
      );
    }
  });

  it("the SQL vocabulary is exactly the 7 mission types, matching TS", () => {
    expect([...EMPLOYEE_REQUEST_TYPES]).toEqual([
      "remote_work",
      "schedule_change",
      "certificate_request",
      "employment_condition_change",
      "benefit_request",
      "equipment_request",
      "other",
    ]);
    expect(MIGRATION_REQ).toContain(
      "'remote_work','schedule_change','certificate_request',",
    );
    expect(MIGRATION_REQ).toContain(
      "'employment_condition_change','benefit_request',",
    );
    expect(MIGRATION_REQ).toContain("'equipment_request','other'");
  });

  it("neither migration touches worker_absences DDL or absence RPCs", () => {
    for (const m of [MIGRATION_REQ, MIGRATION_POL]) {
      expect(m).not.toMatch(/alter\s+table\s+public\.worker_absences/i);
      expect(m).not.toMatch(/create\s+or\s+replace\s+function\s+public\.(request|review|cancel)_worker_absence/i);
      expect(m).not.toMatch(/drop\s+(policy|function|table)[^;]*worker_absence/i);
    }
  });

  it("the proven leave migration file is still byte-present and unrenamed", () => {
    expect(
      existsSync(join(REPO, "supabase/migrations/20260718150000_leave_absence.sql")),
    ).toBe(true);
  });
});

describe("leave balances — configurable, derived, advisory (no legal simulation)", () => {
  it("NO statutory defaults: the migration seeds zero rows and knows zero countries", () => {
    // The ONLY insert into the policy table lives INSIDE the gated command
    // (the upsert) — no top-level seed DML exists.
    const inserts =
      MIGRATION_POL.match(/insert\s+into\s+public\.leave_balance_policies/gi) ??
      [];
    expect(inserts).toHaveLength(1);
    expect(
      MIGRATION_POL.indexOf("insert into public.leave_balance_policies"),
    ).toBeGreaterThan(
      MIGRATION_POL.indexOf(
        "create or replace function public.set_leave_balance_policy_v1",
      ),
    );
    expect(MIGRATION_POL).toContain("NO STATUTORY HARDCODING");
    // No country column in the schema (the word appears only in the
    // prose that FORBIDS it).
    expect(MIGRATION_POL).not.toMatch(/country\w*\s+(text|varchar|char)/i);
  });

  it("policy vocabulary is the EXISTING worker_absences vocabulary", () => {
    expect(MIGRATION_POL).toContain(
      "'annual_leave','sickness','unpaid','training','other'",
    );
  });

  it("balances are never stored: no balance column, no balance table — derivation is TS-side", () => {
    expect(MIGRATION_POL).not.toMatch(/balance_days|remaining_days|used_days/);
    expect(BALANCES_MODEL).toContain("deriveLeaveBalance");
    expect(BALANCES_MODEL).toContain("absenceDaysWithinPeriod");
  });

  it("advisory only: the UI warns, never blocks, and the copy never claims law", () => {
    // The manager panel renders an advisory chip, not a disabled control.
    const panel = read("components/app/absence-panel.tsx");
    expect(panel).toContain("absence-advisory-exceeds");
    expect(panel).not.toMatch(/disabled=\{[^}]*exceeds/);
    // Worker + admin copy carry the honesty sentences (en catalog pins the
    // wording; all-locale presence is pinned separately below).
    const en = JSON.parse(readRepo("apps/web/messages/en.json"));
    expect(en.absences.balance.advisoryNote).toContain(
      "Your manager makes the decision",
    );
    expect(en.requests.policies.honesty).toContain("not legal advice");
  });

  it("write path is the single org owner/admin upsert command", () => {
    expect(MIGRATION_POL).toContain("set_leave_balance_policy_v1");
    expect(MIGRATION_POL).toContain("membership_actor_role_v1");
    expect(MIGRATION_POL).toContain("on conflict (organization_id, absence_type) do update");
  });
});

describe("employee requests — surfaces and honesty", () => {
  it("NO new dashboard route: the requests area expands the declared network surface", () => {
    expect(
      existsSync(join(ROOT, "app/[locale]/dashboard/requests")),
    ).toBe(false);
    expect(NETWORK_PAGE).toContain("RequestsSection");
    expect(SECTION).toContain('id="requests"');
  });

  it("honest degradation while unapplied (42P01/42883/PGRST202 → calm state, nothing faked)", () => {
    expect(MODEL).toContain('"42P01"');
    expect(MODEL).toContain('"42883"');
    expect(MODEL).toContain('"PGRST202"');
    expect(SECTION).toContain("requests-unavailable");
    expect(ACTIONS).toContain("needs_migration");
  });

  it("closed notice vocabulary, validated before render", () => {
    expect(EMPLOYEE_REQUEST_NOTICES).toContain("no_definition");
    expect(EMPLOYEE_REQUEST_NOTICES).toContain("no_approvers");
    expect(NETWORK_PAGE).toContain("isEmployeeRequestNotice");
  });

  it("definition-slug convention is pinned on both sides of the contract", () => {
    expect(EMPLOYEE_REQUEST_DEFAULT_DEFINITION_SLUG).toBe(
      "employee_request_default",
    );
    expect(employeeRequestDefinitionSlug("remote_work")).toBe(
      "employee_request_remote_work",
    );
    expect(MIGRATION_REQ).toContain("'employee_request_' || v_type");
    expect(MIGRATION_REQ).toContain("'employee_request_default'");
  });

  it("NO new notification types: only the existing engine emitters are used", () => {
    expect(ACTIONS).toContain("emitWorkflowStepPendingNotifications");
    expect(ACTIONS).not.toMatch(/emitNotificationEventInBackground/);
    const events = read("lib/notifications/events.ts");
    expect(events).not.toContain("employee_request");
  });

  it("no external sending anywhere in the module", () => {
    // Comments legitimately SAY "no webhook" — pinned are real senders and
    // outbound fetches.
    for (const src of [...REQUESTS_LAYER, ...BALANCES_LAYER]) {
      expect(src).not.toMatch(
        /sendgrid|mailgun|twilio|nodemailer|smtp|fetch\(\s*["']https?:/i,
      );
    }
  });

  it("calendar seam stays a seam: requests modules import nothing from lib/planning", () => {
    // Train E owns the calendar projection. The schedule-affecting types are
    // pinned as vocabulary only; wiring them into calendar bands is the
    // documented seam in the PR body.
    expect([...SCHEDULE_AFFECTING_REQUEST_TYPES]).toEqual([
      "remote_work",
      "schedule_change",
    ]);
    for (const src of REQUESTS_LAYER) {
      expect(src).not.toContain("lib/planning");
    }
  });

  it("db-proof script exists and runs the real files verbatim", () => {
    const proof = readRepo("scripts/db-proof/employee-requests-leave-balances.sh");
    expect(proof).toContain(`${REQUESTS_MIG}.sql`);
    expect(proof).toContain(`${POLICIES_MIG}.sql`);
    expect(proof).toContain("rollback");
  });
});

describe("employee requests — i18n in all 11 catalogs", () => {
  it("every locale carries the requests namespace and the absences.balance keys", () => {
    for (const locale of LOCALES) {
      const doc = JSON.parse(readRepo(`apps/web/messages/${locale}.json`));
      expect(doc.requests, `${locale}: requests namespace`).toBeTruthy();
      expect(
        Object.keys(doc.requests.type ?? {}).sort(),
        `${locale}: request types`,
      ).toEqual([...EMPLOYEE_REQUEST_TYPES].sort());
      expect(
        Object.keys(doc.requests.typeHint ?? {}).sort(),
        `${locale}: plain-language type hints`,
      ).toEqual([...EMPLOYEE_REQUEST_TYPES].sort());
      for (const n of EMPLOYEE_REQUEST_NOTICES) {
        expect(
          typeof doc.requests.notice?.[n],
          `${locale}: notice.${n}`,
        ).toBe("string");
      }
      expect(doc.absences?.balance?.advisoryNote, `${locale}: balance advisory`).toBeTruthy();
      expect(doc.absences?.balance?.exceedsNote, `${locale}: exceeds note`).toBeTruthy();
    }
  });
});
