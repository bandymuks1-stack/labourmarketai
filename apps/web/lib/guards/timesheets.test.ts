import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TIMESHEET_EVENT_ACTIONS,
  TIMESHEET_STATUSES,
} from "@/lib/timesheets/timesheets-model";

/**
 * Timesheets v1 guard — pins the TS↔SQL contract of the timesheet module
 * (functional completion train V2, audit WORK section "timesheet: MISSING").
 *
 * What this protects:
 *  1. the gated migration keeps its safety shape (RPC-only writes, RLS
 *     fail-closed, append-only events, frozen submitted snapshot, no anon
 *     grant, human-gate annotation, paired rollback);
 *  2. the TS layer keeps calling exactly the gated commands and the ENGINE's
 *     own start RPC (integration, never re-implementation);
 *  3. the export route stays an RLS-scoped CSV with real hours;
 *  4. the journal stays the only live hours truth (no second hours store);
 *  5. nothing in the module sends anything externally.
 *
 * Update this guard when the contract changes deliberately — never weaken it.
 */

const ROOT = resolve(__dirname, "../../../..");
const MIGRATION = resolve(
  ROOT,
  "supabase/migrations/20260817170000_timesheets_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "supabase/rollbacks/20260817170000_timesheets_v1.down.sql",
);

const migration = readFileSync(MIGRATION, "utf8");
const model = readFileSync(
  resolve(__dirname, "../timesheets/timesheets-model.ts"),
  "utf8",
);
const reads = readFileSync(
  resolve(__dirname, "../timesheets/timesheets.ts"),
  "utf8",
);
const actions = readFileSync(
  resolve(__dirname, "../timesheets/timesheets-actions.ts"),
  "utf8",
);
const section = readFileSync(
  resolve(
    ROOT,
    "apps/web/app/[locale]/dashboard/planning/timesheets-section.tsx",
  ),
  "utf8",
);
const exportRoute = readFileSync(
  resolve(
    ROOT,
    "apps/web/app/[locale]/dashboard/planning/timesheets/[id]/export/route.ts",
  ),
  "utf8",
);
const planningPage = readFileSync(
  resolve(ROOT, "apps/web/app/[locale]/dashboard/planning/page.tsx"),
  "utf8",
);

describe("timesheets migration — safety shape", () => {
  it("is a human-gated DRAFT with the mandate-cited annotation", () => {
    expect(migration).toContain("DRAFT — needs-human-gate");
    // The EXACT regex migration-safety.mjs uses for the bypass.
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toContain("owner mandate 2026-08-17");
  });

  it("ships the paired rollback that drops only the new objects", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const rollback = readFileSync(ROLLBACK, "utf8");
    for (const obj of [
      "timesheet_events_append_only",
      "timesheets_frozen",
      "sync_timesheet_decision_v1",
      "reopen_timesheet_v1",
      "submit_timesheet_v1",
      "refresh_timesheet_lines_v1",
      "create_timesheet_v1",
      "timesheet_compute_lines_v1",
      "timesheet_can_view_v1",
      "public.timesheet_events",
      "public.timesheets",
    ]) {
      expect(rollback).toContain(obj);
    }
    // The down file must never touch a pre-existing object.
    expect(rollback).not.toMatch(/journal_entry|workflow_|company_memberships/);
  });

  it("status vocabulary matches the TS model exactly", () => {
    expect(migration).toContain(
      "check (status in ('draft','submitted','approved','rejected','reopened'))",
    );
    expect([...TIMESHEET_STATUSES]).toEqual([
      "draft",
      "submitted",
      "approved",
      "rejected",
      "reopened",
    ]);
    for (const action of TIMESHEET_EVENT_ACTIONS) {
      expect(migration).toContain(`'${action}'`);
    }
  });

  it("period rule: ≤31 inclusive days + advisory-locked overlap rejection", () => {
    expect(migration).toContain("period_end - period_start <= 30");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(
      /daterange\(t\.period_start, t\.period_end, '\[\]'\)/,
    );
    expect(migration).toContain("return 'overlap'");
  });

  it("RLS is enabled fail-closed and writes are RPC-only", () => {
    expect(migration).toContain(
      "alter table public.timesheets enable row level security",
    );
    expect(migration).toContain(
      "alter table public.timesheet_events enable row level security",
    );
    // Default-closed grants, then exactly SELECT back — never to anon.
    expect(migration).toMatch(
      /revoke all on public\.timesheets, public\.timesheet_events from authenticated/,
    );
    expect(migration).toMatch(
      /grant select on public\.timesheets, public\.timesheet_events to authenticated/,
    );
    expect(migration).not.toMatch(/grant .* to anon/);
    expect(migration).not.toMatch(/create policy .* for (insert|update|delete)/);
    // Both membership truths for the org side; worker-own via owns_worker.
    expect(migration).toContain("public.owns_worker(worker_id)");
    expect(migration).toContain("public.manages_organization(organization_id)");
  });

  it("events are append-only and a submitted snapshot is frozen (triggers)", () => {
    expect(migration).toContain("timesheet_events is append-only");
    expect(migration).toContain(
      "before update or delete on public.timesheet_events",
    );
    expect(migration).toContain("timesheet identity (org, worker, period) is immutable");
    expect(migration).toContain(
      "a submitted timesheet snapshot is frozen — reopen first",
    );
  });

  it("every command revokes public+anon and grants authenticated only; the internal derivation helper is revoked from EVERYONE", () => {
    for (const fn of [
      "create_timesheet_v1(text, text, text)",
      "refresh_timesheet_lines_v1(text)",
      "submit_timesheet_v1(text)",
      "reopen_timesheet_v1(text, text)",
      "sync_timesheet_decision_v1(text)",
    ]) {
      expect(migration).toContain(
        `revoke all on function public.${fn} from public;`,
      );
      expect(migration).toContain(
        `revoke all on function public.${fn} from anon;`,
      );
      expect(migration).toContain(
        `grant execute on function public.${fn} to authenticated;`,
      );
    }
    expect(migration).toContain(
      "revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;",
    );
  });

  it("derivation reads ONLY journal truth and never invents a workday", () => {
    // The ORIGINAL v1 body derived from `journal_entry_work_items`. That table
    // never received a row, so 20260818150000 replaced this function body with
    // the canonical `journal_entry_metrics` derivation (owner ruling
    // 2026-08-18) — see journal-canonical-work-time.test.ts, which owns the
    // current contract. What is pinned HERE is that the v1 file itself is
    // never edited after apply, and that neither file invents a workday.
    expect(migration).toContain("metric_slug = 'work_date'");
    expect(migration).toContain("round(hours_numeric / 60.0, 2)");
    expect(migration).toMatch(/when unit = 'days' then hours_numeric else 0/);
    expect(migration).not.toMatch(/\* *8/);
  });

  it("sync copies the ENGINE outcome and never decides", () => {
    expect(migration).toContain("context_entity_type = 'timesheet'");
    expect(migration).toContain("NEVER decides anything");
    // The engine's own tables are read, none of its objects recreated.
    expect(migration).not.toMatch(/create (or replace )?function public\.decide_/);
    expect(migration).not.toMatch(
      /create table[^;]*workflow_/,
    );
  });
});

describe("TS layer — engine integration, not re-implementation", () => {
  it("actions call exactly the five gated commands + the engine's own RPCs", () => {
    for (const rpc of [
      "create_timesheet_v1",
      "refresh_timesheet_lines_v1",
      "submit_timesheet_v1",
      "reopen_timesheet_v1",
      "sync_timesheet_decision_v1",
      // Engine seam (integration): start + compensating withdraw + the
      // one-click default-pack install (the engine's OWN idempotent
      // installer — templates are never authored from this module).
      "start_workflow_instance_v1",
      "withdraw_workflow_instance_v1",
      "install_default_workflow_pack_v1",
    ]) {
      expect(actions).toContain(`"${rpc}"`);
    }
    // The engine's decide command is NEVER called from the timesheet module —
    // decisions belong to the approvals area.
    expect(actions).not.toContain("decide_workflow_step_v1");
    expect(reads).not.toContain("decide_workflow_step_v1");
    // The retired rival-slug path must not come back: authoring a SECOND
    // timesheet definition next to the pack's `timesheet_default` made the
    // template-state read and the submit path disagree about the same org.
    expect(actions).not.toContain("timesheet_approval_standard");
    expect(actions).not.toContain("create_workflow_definition_v1");
    expect(actions).not.toContain("publish_workflow_version_v1");
  });

  it("template state is read per-org with the submit path's own model", () => {
    // The read asks about the caller's orgs, never a global window …
    expect(reads).toContain('.in("organization_id", organizationIds)');
    // … and the install offer is rendered only where the engine's authoring
    // RPCs would accept the caller (governance mirror), never as a button
    // whose only possible answer is not_authorized.
    expect(reads).toContain("canGovern");
    expect(section).toContain("o.canGovern");
    expect(section).toContain("templateNeedsAdmin");
  });

  it("submit starts the instance with the timesheet as context entity", () => {
    expect(actions).toContain("p_context_entity_id: timesheetId");
    expect(actions).toContain('context_entity_type", "timesheet"');
    // Honest degradation when the org has no published template.
    expect(actions).toContain('finish(ctx, "no_template")');
  });

  it("no direct table writes anywhere in the module", () => {
    for (const src of [reads, actions]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toContain("createAdminClient");
    }
  });

  it("honest degradation codes are the shared vocabulary", () => {
    expect(model).toContain('"42P01"');
    expect(model).toContain('"PGRST202"');
    expect(reads).toContain('return { status: "needs-migration" }');
  });

  it("no external sending of any kind", () => {
    for (const src of [model, reads, actions, section]) {
      // ("webhook" appears only inside the module's own "no webhook" doc
      // sentences, so the pattern pins real senders + raw outbound fetches.)
      expect(src).not.toMatch(/nodemailer|sendgrid|twilio|fetch\(\s*["']https?:/i);
    }
    // The only notification path is the EXISTING engine event type.
    expect(actions).toContain("emitWorkflowStepPendingNotifications");
    expect(actions).not.toMatch(/emitNotificationEventInBackground/);
  });
});

describe("surfaces — expansion inside the declared calendar surface", () => {
  it("the planning page renders the #timesheets section and the workload strip", () => {
    expect(planningPage).toContain("TimesheetsSection");
    expect(planningPage).toContain("buildWorkloadWeeks");
    expect(planningPage).toContain('data-testid="planning-workload"');
  });

  it("the section reuses the ONE workflow timeline component and links the approvals area", () => {
    expect(section).toContain("WorkflowTimeline");
    expect(section).toContain("/dashboard/network#approvals");
    expect(section).toContain('id="timesheets"');
  });

  it("the export route is an RLS-scoped CSV with real hours and honest 503", () => {
    expect(exportRoute).toContain("getTimesheetForExport");
    expect(exportRoute).toContain("buildTimesheetCsv");
    expect(exportRoute).toContain("text/csv");
    expect(exportRoute).toContain("503");
    expect(exportRoute).not.toContain("createAdminClient");
  });

  it("no new page.tsx was added for timesheets (route handler only)", () => {
    expect(
      existsSync(
        resolve(
          ROOT,
          "apps/web/app/[locale]/dashboard/timesheets",
        ),
      ),
    ).toBe(false);
  });
});
