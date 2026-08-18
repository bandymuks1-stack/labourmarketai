import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WORKFLOW_DEFAULT_PACK,
  WORKFLOW_MANAGING_ROLES,
  WORKFLOW_RULE_KINDS,
  WORKFLOW_RULE_ROLES,
  parseWorkflowApproverRule,
  parseWorkflowEscalationEnabled,
  resolveApproverCount,
} from "@/lib/approvals/approvals-model";

/**
 * WORKFLOW TEMPLATE MANAGEMENT guards (template management v1).
 *
 * The engine (20260817130000) can run approvals but cannot be CONFIGURED:
 * there is no way to version a published template, no way to retire one, and
 * no way to get a usable set of templates into an organization at all. This
 * migration closes exactly those three gaps, and these pins keep the
 * dangerous parts honest:
 *
 *   - the eight-template default pack is IDENTICAL in the SQL and in the TS
 *     constant the panel renders from;
 *   - EXACTLY ONE 'generic_request' template is seeded — a second one makes
 *     org document approval route non-deterministically;
 *   - escalation NEVER approves: 'mark_escalated' is the only action written
 *     anywhere in this migration, and no auto-approve vocabulary exists;
 *   - the installer constructs its own steps (organization id is its ONLY
 *     parameter) so it cannot be used to inject an arbitrary rule;
 *   - RUNNING INSTANCES ARE IMMUNE: nothing here reads or writes
 *     workflow_instances / _instance_steps / _instance_approvers, and the UI
 *     says so;
 *   - the TS approver-count resolver mirrors the SQL resolver's three rules.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(join(REPO, rel), "utf8");

const NAME = "20260818120000_workflow_template_management_v1";
const MIGRATION = readRepo(`supabase/migrations/${NAME}.sql`);
const ROLLBACK = readRepo(`supabase/rollbacks/${NAME}.down.sql`);
const GATE = readRepo("docs/human-gates/workflow-template-management-gate.md");
const LEDGER = readRepo("docs/APPLIED_LEDGER.md");
const PROOF = readRepo("scripts/db-proof/workflow-template-management-v1.sh");

const MODEL = read("lib/approvals/approvals-model.ts");
const READS = read("lib/approvals/approvals.ts");
const ACTIONS = read("lib/approvals/approvals-actions.ts");
const PANEL = read(
  "app/[locale]/dashboard/network/workflow-templates-panel.tsx",
);
const SECTION = read("app/[locale]/dashboard/network/approvals-section.tsx");
const FORM_FEEDBACK = read("lib/guards/form-submit-feedback.test.ts");

const COMMANDS = [
  "create_workflow_definition_version_v1",
  "set_workflow_definition_active_v1",
  "install_default_workflow_pack_v1",
] as const;

const SIGNATURES: Record<(typeof COMMANDS)[number], string> = {
  create_workflow_definition_version_v1: "text, jsonb",
  set_workflow_definition_active_v1: "text, text",
  install_default_workflow_pack_v1: "text",
};

/** The body of ONE function in the migration (create → its first revoke). */
function fnBody(name: string): string {
  const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} missing from the migration`).toBeGreaterThanOrEqual(0);
  const end = MIGRATION.indexOf(`revoke all on function public.${name}(`, start);
  expect(end, `${name} carries no revoke`).toBeGreaterThan(start);
  return MIGRATION.slice(start, end);
}

describe("1. the migration is a human-gated, rollback-paired, additive slice", () => {
  it("carries the owner-mandate annotation, the gate pointer and the rollback pointer", () => {
    expect(MIGRATION).toContain("needs-human-gate");
    expect(MIGRATION).toMatch(
      /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i,
    );
    expect(MIGRATION).toContain("owner mandate 2026-08-17");
    expect(MIGRATION).toContain(
      "autonomous functional completion train V2, §4",
    );
    expect(MIGRATION).toContain("SAFETY CLASS: RED");
    expect(MIGRATION).toContain(
      "docs/human-gates/workflow-template-management-gate.md",
    );
    expect(MIGRATION).toContain(`supabase/rollbacks/${NAME}.down.sql`);
    // The rollback itself must never carry the approval marker.
    expect(ROLLBACK).not.toMatch(
      /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i,
    );
  });

  it("adds NO table, NO column, NO policy, NO trigger and does NO DML at apply time", () => {
    // Comment lines may legitimately DISCUSS these; executable SQL is pinned.
    const sql = MIGRATION.split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(sql).not.toMatch(/create\s+table/i);
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/drop\s+policy/i);
    expect(sql).not.toMatch(/create\s+trigger/i);
    expect(sql).not.toMatch(/create\s+index/i);
    // No top-level DML at apply time. Every statement this migration
    // executes on apply starts at column 0 (`begin;`, `do $$ … $$;`,
    // `create or replace function …`, `revoke`, `grant`, `commit;`); the
    // inserts and updates all sit INDENTED inside a function body and only
    // run when an org owner/admin calls the command.
    for (const line of sql.split("\n")) {
      expect(line).not.toMatch(/^(insert|update|delete|truncate)\s/i);
    }
  });

  it("asserts its dependency on the engine before doing anything", () => {
    expect(MIGRATION).toContain("to_regclass('public.workflow_definitions')");
    expect(MIGRATION).toContain("20260817130000_workflow_engine_v1");
    expect(MIGRATION).toContain("membership_actor_role_v1");
  });

  it("the rollback drops exactly the three commands and deletes no row", () => {
    for (const fn of COMMANDS) {
      expect(ROLLBACK).toContain(
        `drop function if exists public.${fn}(${SIGNATURES[fn]})`,
      );
    }
    const sql = ROLLBACK.split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
  });

  it("the gate doc and the deferred ledger entry both name this file", () => {
    expect(GATE).toContain(`${NAME}.sql`);
    expect(GATE).toContain("PENDING APPLY BY LEAD");
    expect(LEDGER).toContain(`${NAME}.sql`);
  });
});

describe("2. every command is a gated SECURITY DEFINER with owner/admin authority", () => {
  it("definer + pinned search_path + anon/public revoked + authenticated granted", () => {
    for (const fn of COMMANDS) {
      const body = fnBody(fn);
      expect(body, fn).toContain("security definer");
      expect(body, fn).toContain("set search_path = public");
      expect(MIGRATION).toContain(
        `revoke all on function public.${fn}(${SIGNATURES[fn]}) from public;`,
      );
      expect(MIGRATION).toContain(
        `revoke all on function public.${fn}(${SIGNATURES[fn]}) from anon;`,
      );
      expect(MIGRATION).toContain(
        `grant execute on function public.${fn}(${SIGNATURES[fn]}) to authenticated;`,
      );
    }
    expect(MIGRATION).not.toMatch(/grant execute[^;]*to anon/);
    expect(MIGRATION).not.toMatch(/grant execute[^;]*to public/);
  });

  it("anon raises 42501 first and authority comes from membership_actor_role_v1", () => {
    for (const fn of COMMANDS) {
      const body = fnBody(fn);
      expect(body, fn).toMatch(
        /if uid is null then\s+raise exception 'Not authenticated' using errcode = '42501';/,
      );
      expect(body, fn).toMatch(/membership_actor_role_v1/);
      expect(body, fn).toMatch(/not in \('owner','admin'\)/);
    }
  });

  it("anti-oracle: missing row and unauthorized caller answer the same", () => {
    // The two definition-scoped commands merge "missing" with "no authority".
    for (const fn of [
      "create_workflow_definition_version_v1",
      "set_workflow_definition_active_v1",
    ]) {
      const body = fnBody(fn);
      const idx = body.indexOf("membership_actor_role_v1");
      expect(body.slice(idx), fn).toMatch(/return 'not_found';/);
    }
    expect(fnBody("install_default_workflow_pack_v1")).toContain(
      "'not_authorized'",
    );
  });
});

describe("3. version authoring — validated, capped, serialized, draft-only", () => {
  const body = fnBody("create_workflow_definition_version_v1");

  it("validates the WHOLE closed vocabulary before the first write", () => {
    const firstInsert = body.indexOf("insert into public.workflow_definition_versions");
    expect(firstInsert).toBeGreaterThan(0);
    const validation = body.slice(0, firstInsert);
    expect(validation).toMatch(/not in \('single','all','any'\)/);
    for (const kind of WORKFLOW_RULE_KINDS) {
      expect(validation, kind).toContain(`'${kind}'`);
    }
    expect(validation).toMatch(
      /not in \('owner','admin','manager','external_manager','member'\)/,
    );
    expect(validation).toMatch(/v_dl < 1 or v_dl > 2160/);
    expect(validation).toContain("'mark_escalated'");
  });

  it("creates a DRAFT (published_at untouched) — publishing stays the engine's own command", () => {
    expect(body).toMatch(
      /insert into public\.workflow_definition_versions \(definition_id, version, created_by\)/,
    );
    expect(body).not.toMatch(/published_at/);
  });

  it("serializes on the definition row and caps the version history", () => {
    expect(body).toMatch(/for update;/);
    expect(body).toMatch(/coalesce\(max\(v\.version\), 0\) \+ 1/);
    expect(body).toContain("'limit_reached'");
  });

  it("returns the new version id, so the action can tell success from an outcome word", () => {
    expect(body).toMatch(/return v_ver::text;/);
    expect(ACTIONS).toMatch(
      /UUID_RX\.test\(outcome\)\) finish\(ctx, "version_created"\)/,
    );
  });
});

describe("4. activate/deactivate NEVER touches a running request", () => {
  const body = fnBody("set_workflow_definition_active_v1");

  it("reads and writes workflow_definitions only", () => {
    expect(body).not.toMatch(/workflow_instances/);
    expect(body).not.toMatch(/workflow_instance_steps/);
    expect(body).not.toMatch(/workflow_instance_approvers/);
    expect(body).not.toMatch(/workflow_transitions/);
    expect(body).toMatch(/update public\.workflow_definitions/);
  });

  it("accepts only a true/false flag and answers idempotently", () => {
    expect(body).toMatch(/not in \('true','false'\)/);
    expect(body).toContain("'already_active'");
    expect(body).toContain("'already_inactive'");
    expect(body).toContain("'activated'");
    expect(body).toContain("'deactivated'");
  });
});

describe("5. the default pack — SQL and TS agree, exactly one generic_request", () => {
  const body = fnBody("install_default_workflow_pack_v1");

  it("the installer's ONLY parameter is an organization id (no rule injection)", () => {
    expect(MIGRATION).toMatch(
      /create or replace function public\.install_default_workflow_pack_v1\(\s*p_organization_id text\s*\) returns jsonb/,
    );
    // The rule, the mode and the escalation action are literals in the body.
    expect(body).toContain(
      `'{"kind":"org_role","roles":["owner","admin"]}'::jsonb`,
    );
    expect(body).toContain(
      `'{"action":"mark_escalated","notify_roles":["owner","admin"]}'::jsonb`,
    );
    expect(body).toMatch(/values\s*\r?\n?\s*\(v_ver, 1, v_step_name, 'single',/);
  });

  it("SQL and the TS constant carry the SAME eight slugs, contexts and deadlines", () => {
    expect(WORKFLOW_DEFAULT_PACK.length).toBe(8);
    for (const entry of WORKFLOW_DEFAULT_PACK) {
      expect(body, entry.slug).toContain(`"slug":"${entry.slug}"`);
      expect(body, entry.slug).toContain(
        `"context_entity_type":"${entry.contextEntityType}"`,
      );
      expect(body, entry.slug).toContain(
        `"deadline_hours":${entry.deadlineHours}`,
      );
    }
    // No NINTH entry hiding in the SQL pack.
    const slugsInSql = [...body.matchAll(/"slug":"([a-z0-9_]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(slugsInSql)).toEqual(
      new Set(WORKFLOW_DEFAULT_PACK.map((p) => p.slug)),
    );
  });

  it("EXACTLY ONE generic_request template is seeded, and the reason is written down", () => {
    const generic = WORKFLOW_DEFAULT_PACK.filter(
      (p) => p.contextEntityType === "generic_request",
    );
    expect(generic.map((p) => p.slug)).toEqual(["employee_request_default"]);
    const sqlGeneric = [
      ...body.matchAll(/"context_entity_type":"generic_request"/g),
    ];
    expect(sqlGeneric.length).toBe(1);
    // The rationale is stated in the migration header AND in the UI copy.
    expect(MIGRATION).toMatch(/EXACTLY ONE `?generic_request`? DEFINITION/i);
    expect(MIGRATION).toContain("employee_request_default");
    expect(MODEL).toMatch(/EXACTLY ONE `generic_request` entry/);
  });

  it("is idempotent per context and never overwrites an existing slug", () => {
    expect(body).toContain("'context_already_covered'");
    expect(body).toContain("'slug_already_exists'");
    expect(body).toMatch(/d\.context_entity_type = v_ctx/);
    expect(body).toMatch(/v\.published_at is not null/);
    expect(body).toContain("'all_skipped'");
  });

  it("publishes AFTER the steps exist (the engine's frozen-steps trigger)", () => {
    const stepInsert = body.indexOf("insert into public.workflow_version_steps");
    // CRLF-robust: a Windows checkout ends these lines with \r\n.
    const publish = body.search(
      /update public\.workflow_definition_versions\s+set published_at = now\(\)/,
    );
    expect(stepInsert).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(stepInsert);
  });
});

describe("6. ESCALATION NEVER APPROVES, and no auto-approve vocabulary exists", () => {
  it("mark_escalated is the ONLY escalation action anywhere in the migration", () => {
    const sql = MIGRATION.split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    const actions = [...sql.matchAll(/"action":"([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(actions)).toEqual(new Set(["mark_escalated"]));
    expect(sql).not.toMatch(/auto[_-]?approv/i);
    expect(sql).not.toMatch(/\bAI\b|\bLLM\b|openai|anthropic/i);
  });

  it("the app layer only ever writes the mark_escalated action too", () => {
    const escalations = [
      ...ACTIONS.matchAll(/action:\s*"([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(escalations)).toEqual(new Set(["mark_escalated"]));
  });
});

describe("7. running instances are immune — pinned in SQL, code and copy", () => {
  it("no management command reads or writes any instance-family table", () => {
    for (const fn of COMMANDS) {
      const body = fnBody(fn);
      for (const tbl of [
        "workflow_instances",
        "workflow_instance_steps",
        "workflow_instance_approvers",
        "workflow_transitions",
      ]) {
        expect(body, `${fn} must not touch ${tbl}`).not.toContain(tbl);
      }
    }
  });

  it("the read layer for the panel never reads an instance-family table either", () => {
    const start = READS.indexOf(
      "export async function getWorkflowTemplateAdministration",
    );
    expect(start).toBeGreaterThan(0);
    const body = READS.slice(start);
    for (const tbl of [
      "workflow_instances",
      "workflow_instance_steps",
      "workflow_instance_approvers",
      "workflow_transitions",
    ]) {
      expect(body).not.toContain(`.from("${tbl}")`);
    }
  });

  it("the UI states it, in every catalogue, and the panel renders that string", () => {
    expect(PANEL).toContain('t("tpl.runningImmuneNote")');
    expect(PANEL).toContain("approvals-templates-running-immune");
    for (const loc of [
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
    ]) {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      const note = msgs.approvals.tpl.runningImmuneNote;
      expect(typeof note, loc).toBe("string");
      expect(note.length, loc).toBeGreaterThan(40);
      expect(note.startsWith("[EN]"), `${loc} carries an [EN] marker`).toBe(
        false,
      );
    }
    // The English sentence must actually say the two halves of the rule.
    const en = JSON.parse(read("messages/en.json")).approvals.tpl;
    expect(en.runningImmuneNote.toLowerCase()).toContain("only requests started afterwards");
    expect(en.runningImmuneNote.toLowerCase()).toContain("already under way");
  });
});

describe("8. the TS approver resolver mirrors the SQL resolver", () => {
  const ctx = {
    members: [
      { profileId: "p-owner", role: "owner" },
      { profileId: "p-admin", role: "admin" },
      { profileId: "p-manager", role: "manager" },
      { profileId: "p-member", role: "member" },
    ],
    engagementProfileIds: ["p-engaged"],
  };

  it("org_role counts distinct ACTIVE members holding one of the named roles", () => {
    expect(
      resolveApproverCount({ kind: "org_role", roles: ["owner", "admin"] }, ctx),
    ).toEqual({ min: 2, max: 2, exact: true });
    expect(
      resolveApproverCount({ kind: "org_role", roles: ["external_manager"] }, ctx),
    ).toEqual({ min: 0, max: 0, exact: true });
  });

  it("profiles counts named ids eligible through EITHER membership truth", () => {
    expect(
      resolveApproverCount(
        { kind: "profiles", profileIds: ["p-member", "p-engaged", "p-stranger"] },
        ctx,
      ),
    ).toEqual({ min: 2, max: 2, exact: true });
  });

  it("requester_manager is a RANGE because the SQL rule excludes the requester", () => {
    expect(resolveApproverCount({ kind: "requester_manager" }, ctx)).toEqual({
      min: 2,
      max: 3,
      exact: false,
    });
    // A one-person org: the rule can reach nobody — the fail-closed case.
    expect(
      resolveApproverCount(
        { kind: "requester_manager" },
        { members: [{ profileId: "solo", role: "owner" }], engagementProfileIds: [] },
      ),
    ).toEqual({ min: 0, max: 1, exact: false });
    // 'member' is deliberately NOT a managing role, in SQL and here.
    expect(WORKFLOW_MANAGING_ROLES).not.toContain("member");
    expect(fnBodyOfEngineResolver()).toMatch(
      /in \('owner','admin','manager','external_manager'\)/,
    );
  });

  it("an unrecognised stored rule resolves to zero rather than to a guess", () => {
    expect(parseWorkflowApproverRule({ kind: "whatever" })).toEqual({
      kind: "unknown",
    });
    expect(parseWorkflowApproverRule(null)).toEqual({ kind: "unknown" });
    expect(resolveApproverCount({ kind: "unknown" }, ctx)).toEqual({
      min: 0,
      max: 0,
      exact: true,
    });
  });

  it("escalation is read as enabled only for the mark_escalated action", () => {
    expect(parseWorkflowEscalationEnabled({ action: "mark_escalated" })).toBe(
      true,
    );
    expect(parseWorkflowEscalationEnabled({ action: "auto_approve" })).toBe(
      false,
    );
    expect(parseWorkflowEscalationEnabled(null)).toBe(false);
  });

  it("the role vocabulary matches the engine's own CHECK list", () => {
    expect([...WORKFLOW_RULE_ROLES]).toEqual([
      "owner",
      "admin",
      "manager",
      "external_manager",
      "member",
    ]);
  });
});

/** The engine's internal resolver body, read from the ENGINE migration —
 *  this guard compares the TS mirror against the real SQL, not against a
 *  copy of itself. */
function fnBodyOfEngineResolver(): string {
  const engine = readRepo(
    "supabase/migrations/20260817130000_workflow_engine_v1.sql",
  );
  const start = engine.indexOf(
    "create or replace function public.workflow_resolve_step_approvers_v1(",
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const end = engine.indexOf(
    "revoke all on function public.workflow_resolve_step_approvers_v1(",
    start,
  );
  return engine.slice(start, end);
}

describe("9. the panel is a real, honest, native-nav surface — and NOT a new route", () => {
  it("no new dashboard route: the panel renders inside the declared approvals area", () => {
    expect(SECTION).toContain("<WorkflowTemplatesPanel");
    expect(SECTION).toContain(
      'import { WorkflowTemplatesPanel } from "./workflow-templates-panel"',
    );
    expect(PANEL).not.toMatch(/"use client"/);
    expect(PANEL).not.toMatch(/useState|useTransition|startTransition/);
  });

  it("every control is a form over one of the four gated commands", () => {
    expect(PANEL).toContain("action={installDefaultWorkflowPackAction}");
    expect(PANEL).toContain("action={createWorkflowVersionAction}");
    expect(PANEL).toContain("action={setWorkflowDefinitionActiveAction}");
    expect(PANEL).toContain("action={publishWorkflowVersionAction}");
    // No direct table writes and no outbound transport anywhere on it.
    expect(PANEL).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(PANEL).not.toMatch(/\bfetch\s*\(/);
  });

  it("it is registered as a NATIVE-NAV surface, not silently exempt", () => {
    expect(FORM_FEEDBACK).toContain(
      "app/[locale]/dashboard/network/workflow-templates-panel.tsx",
    );
  });

  it("it degrades honestly while the gated migration is unapplied", () => {
    expect(PANEL).toContain('admin.status === "needs-migration"');
    expect(PANEL).toContain("approvals-templates-unavailable");
    expect(PANEL).toContain('t("tpl.unavailable")');
    const en = JSON.parse(read("messages/en.json")).approvals.tpl;
    expect(en.unavailable.toLowerCase()).toContain("not enabled");
  });

  it("the zero-approver fail-closed warning is rendered, per step, with a fix", () => {
    expect(PANEL).toContain("s.resolved.min === 0");
    expect(PANEL).toContain('t("tpl.zeroWarning")');
    expect(PANEL).toContain('t("tpl.zeroWarningManager")');
    const en = JSON.parse(read("messages/en.json")).approvals.tpl;
    expect(en.zeroWarning.toLowerCase()).toContain("would be refused");
    expect(en.zeroWarningManager.toLowerCase()).toContain("would be refused");
  });

  it("the single-person self-approval consequence is stated, not hidden", () => {
    expect(PANEL).toContain('t("tpl.selfApprovalNote")');
    const en = JSON.parse(read("messages/en.json")).approvals.tpl;
    expect(en.selfApprovalNote.toLowerCase()).toContain(
      "approves their own requests",
    );
    // The migration header owes the same honesty to the reviewer.
    expect(MIGRATION).toMatch(/owner approves their own submissions/i);
    expect(MIGRATION).toMatch(/requester_manager/);
    expect(GATE).toMatch(/single-person/i);
  });
});

describe("10. the behavioural proof covers what the owner asked for", () => {
  it("the db-proof script runs the real files and names every required probe", () => {
    expect(PROOF).toContain(`supabase/migrations/${NAME}.sql`);
    expect(PROOF).toContain(`supabase/rollbacks/${NAME}.down.sql`);
    expect(PROOF).toContain(
      "supabase/migrations/20260817130000_workflow_engine_v1.sql",
    );
    for (const probe of [
      "idempot",
      "cross-tenant",
      "running",
      "escalation",
      "rollback",
    ]) {
      expect(PROOF.toLowerCase(), probe).toContain(probe);
    }
    // The cross-tenant negative runs against the REAL engine decide command.
    expect(PROOF).toContain("decide_workflow_step_v1");
    // It must never be pointed at a shared or production database.
    expect(PROOF).toMatch(/throwaway/i);
  });
});
