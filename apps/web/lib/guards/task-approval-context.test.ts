import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WORKFLOW_CONTEXT_ENTITY_TYPES,
  WORKFLOW_INSTANCE_STATUSES,
} from "@/lib/approvals/approvals-model";

/**
 * GUARD — work_task routed through the CANONICAL approval engine
 * (field-work audit v1, chain step B).
 *
 * The audit found the workflow engine fully built — definitions, published
 * versions, approver resolution, decide/delegate/withdraw/cancel, deadlines,
 * escalation, an append-only transition log — and admitting ten kinds of
 * context entity, none of which was `work_task`. So the one object the whole
 * field-work chain revolves around was the one object that could not be sent
 * for approval, and 16 seeded definitions had produced 0 instances.
 *
 * The fix is a CHECK widening and nothing else. This guard exists to keep it
 * that way: the standing temptation is to "just add an approval_status column
 * to work_tasks", which would create a second, disagreeing truth.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase/migrations/20260819210000_workflow_work_task_context_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase/rollbacks/20260819210000_workflow_work_task_context_v1.down.sql",
);
const APP = join(__dirname, "..", "..");

const migrationSql = readFileSync(MIGRATION, "utf8");
const rollbackSql = readFileSync(ROLLBACK, "utf8");
const migrationCode = migrationSql.replace(/--[^\n]*/g, "");
const actions = readFileSync(
  join(APP, "lib/tasks/task-approval-actions.ts"),
  "utf8",
);
const reads = readFileSync(join(APP, "lib/approvals/task-approvals.ts"), "utf8");

/** The ten kinds that existed before this slice. */
const ORIGINAL_TYPES = [
  "generic_request",
  "worker_absence",
  "expense",
  "invoice",
  "document_ack",
  "timesheet",
  "procurement",
  "business_trip",
  "management_decision",
  "agreement",
];

describe("task approval — the model", () => {
  it("work_task is a context entity type, added to the existing set", () => {
    expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toContain("work_task");
    // Widening only: nothing that existed before may have been dropped.
    for (const t of ORIGINAL_TYPES) {
      expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toContain(t);
    }
    expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toHaveLength(
      ORIGINAL_TYPES.length + 1,
    );
  });

  it("the TS set matches the migration's IN-list exactly (one contract)", () => {
    for (const t of [...ORIGINAL_TYPES, "work_task"]) {
      expect(migrationCode).toContain(`'${t}'`);
    }
  });
});

describe("task approval — the migration stays GREEN and additive", () => {
  it("is a pure CHECK widening: no table, function, policy or grant", () => {
    expect(migrationCode).not.toMatch(/create\s+table/i);
    expect(migrationCode).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migrationCode).not.toMatch(/security\s+definer/i);
    expect(migrationCode).not.toMatch(/\bgrant\b/i);
    expect(migrationCode).not.toMatch(/\brevoke\b/i);
    expect(migrationCode).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy/i);
    // No DML — widening a CHECK rewrites no rows.
    expect(migrationCode).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from)\b/i);
  });

  it("carries NO human-gate annotation — it does not need one", () => {
    // Asserted with the migration-safety gate's own regex so this guard and
    // CI can never disagree. A GREEN migration that annotates itself would be
    // claiming a review it never required.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(migrationSql)).toBe(false);
  });

  it("every dropped constraint is re-added in the SAME file", () => {
    const drops = [...migrationCode.matchAll(/drop\s+constraint\s+if\s+exists\s+(\w+)/gi)]
      .map((m) => m[1]);
    const adds = [...migrationCode.matchAll(/add\s+constraint\s+(\w+)/gi)].map(
      (m) => m[1],
    );
    expect(drops).toHaveLength(2);
    for (const d of drops) expect(adds).toContain(d);
  });

  it("widens BOTH the definition and the instance constraint", () => {
    expect(migrationCode).toMatch(/alter\s+table\s+public\.workflow_definitions/i);
    expect(migrationCode).toMatch(/alter\s+table\s+public\.workflow_instances/i);
  });

  it("adds NO second approval truth to work_tasks", () => {
    // The recurring temptation this guard exists to block.
    expect(migrationCode).not.toMatch(/alter\s+table\s+public\.work_tasks/i);
    expect(migrationCode).not.toMatch(/approval_status|approved_by|approved_at/i);
  });

  it("ships a rollback that refuses while work_task approvals exist", () => {
    expect(rollbackSql).toMatch(/raise\s+exception/i);
    expect(rollbackSql).toMatch(/context_entity_type\s*=\s*'work_task'/i);
    // And it narrows back to exactly the original ten.
    expect(rollbackSql).not.toMatch(/'work_task'[^;]*\)\s*\);/);
  });
});

describe("task approval — the app layer reuses the engine", () => {
  it("writes ONLY through the existing start_workflow_instance_v1 RPC", () => {
    expect(actions).toContain("start_workflow_instance_v1");
    // No direct table writes, and no new task-approval RPC of its own.
    expect(actions).not.toMatch(/\.from\(\s*["']workflow_instances["']\s*\)/);
    expect(actions).not.toMatch(/insert|upsert|\.update\(|\.delete\(/);
  });

  it("passes the task as the CONTEXT ENTITY, never as copied task fields", () => {
    expect(actions).toMatch(/p_context_entity_id:\s*taskId/);
    // The payload must not snapshot the task — the approval points at it.
    expect(actions).toMatch(/p_payload:\s*\{\}/);
  });

  it("reuses the existing notification spine, emits nothing of its own", () => {
    expect(actions).toContain("emitWorkflowStepPendingNotifications");
    expect(actions).not.toMatch(/sendEmail|sendSms|fetch\(|webhook/i);
  });

  it("the read never invents a status outside the engine's vocabulary", () => {
    expect(reads).toContain("isValidWorkflowInstanceStatus");
    for (const s of WORKFLOW_INSTANCE_STATUSES) {
      expect(["pending", "approved", "rejected", "withdrawn", "cancelled"]).toContain(s);
    }
  });

  it("the read is batched — no per-card query on the tasks page", () => {
    expect(reads).toMatch(/\.in\(\s*["']context_entity_id["']/);
    expect(reads).toMatch(/getTaskApprovalStates/);
  });

  it("scopes strictly to work_task approvals", () => {
    expect(reads).toMatch(/\.eq\(\s*["']context_entity_type["'],\s*["']work_task["']\s*\)/);
  });
});
