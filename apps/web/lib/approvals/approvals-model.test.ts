import { describe, expect, it } from "vitest";

import {
  WORKFLOW_APPROVAL_MODES,
  WORKFLOW_CONTEXT_ENTITY_TYPES,
  WORKFLOW_DECISIONS,
  WORKFLOW_INSTANCE_STATUSES,
  WORKFLOW_NOTICES,
  WORKFLOW_STEP_STATUSES,
  deriveStepProgress,
  isDecidableStepStatus,
  isValidWorkflowApprovalMode,
  isValidWorkflowContextEntityType,
  isValidWorkflowDecision,
  isValidWorkflowFormRule,
  isValidWorkflowInstanceStatus,
  isValidWorkflowStepStatus,
  isWorkflowMigrationMissingCode,
  isWorkflowNotice,
  workflowSlugFromName,
  type WorkflowDecision,
} from "@/lib/approvals/approvals-model";

/**
 * Unit tests for the pure workflow model — the TS half of the ONE
 * TS↔SQL contract (the SQL half is pinned by lib/guards/workflow-engine
 * .test.ts and proven behaviourally by scripts/db-proof/workflow-engine-v1.sh).
 */

describe("mode evaluation matrix (mirrors the SQL decide command exactly)", () => {
  const D = (arr: (WorkflowDecision | null)[]) => arr;

  it("single: the first decision settles the step with that outcome", () => {
    expect(deriveStepProgress("single", D(["approved"]))).toMatchObject({
      settled: true,
      outcome: "approved",
    });
    expect(deriveStepProgress("single", D(["rejected"]))).toMatchObject({
      settled: true,
      outcome: "rejected",
    });
    expect(deriveStepProgress("single", D([null, null]))).toMatchObject({
      settled: false,
      outcome: null,
    });
    // Multiple slots, one decided: settled by the first decision.
    expect(deriveStepProgress("single", D(["approved", null]))).toMatchObject({
      settled: true,
      outcome: "approved",
    });
  });

  it("any: first approval approves; any rejection rejects", () => {
    expect(deriveStepProgress("any", D(["approved", null, null]))).toMatchObject(
      { settled: true, outcome: "approved" },
    );
    expect(deriveStepProgress("any", D(["rejected", null]))).toMatchObject({
      settled: true,
      outcome: "rejected",
    });
    expect(deriveStepProgress("any", D([null, null, null]))).toMatchObject({
      settled: false,
      outcome: null,
    });
  });

  it("all: one rejection rejects; approval needs every slot", () => {
    expect(
      deriveStepProgress("all", D(["approved", "approved", null])),
    ).toMatchObject({ settled: false, outcome: null, approved: 2, total: 3 });
    expect(
      deriveStepProgress("all", D(["approved", "approved", "approved"])),
    ).toMatchObject({ settled: true, outcome: "approved" });
    expect(
      deriveStepProgress("all", D(["approved", "rejected", null])),
    ).toMatchObject({ settled: true, outcome: "rejected" });
    // Rejection wins regardless of order.
    expect(
      deriveStepProgress("all", D(["rejected", "approved", "approved"])),
    ).toMatchObject({ settled: true, outcome: "rejected" });
    // Empty slot lists never settle (the SQL start command refuses them
    // with 'no_approvers' before an instance exists).
    expect(deriveStepProgress("all", D([]))).toMatchObject({
      settled: false,
      outcome: null,
      total: 0,
    });
  });
});

describe("honest vocabularies (pinned — a new value is a reviewed act)", () => {
  it("statuses, modes, decisions", () => {
    expect([...WORKFLOW_INSTANCE_STATUSES]).toEqual([
      "pending",
      "approved",
      "rejected",
      "withdrawn",
      "cancelled",
    ]);
    expect([...WORKFLOW_STEP_STATUSES]).toEqual([
      "waiting",
      "active",
      "approved",
      "rejected",
      "skipped",
      "escalated",
    ]);
    expect([...WORKFLOW_APPROVAL_MODES]).toEqual(["single", "all", "any"]);
    expect([...WORKFLOW_DECISIONS]).toEqual(["approved", "rejected"]);
    // 10 -> 11: 'work_task' added by the field-work audit chain step B
    // (migration 20260819210000). This length is pinned precisely so that
    // widening the vocabulary stays a REVIEWED act — the value must also
    // exist in the DB CHECK on workflow_definitions AND workflow_instances,
    // which lib/guards/task-approval-context.test.ts asserts against the
    // migration file itself.
    expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toHaveLength(11);
    expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toContain("work_task");
    expect(WORKFLOW_CONTEXT_ENTITY_TYPES[0]).toBe("generic_request");
  });

  it("validators accept exactly the vocabulary and nothing else", () => {
    expect(isValidWorkflowInstanceStatus("pending")).toBe(true);
    expect(isValidWorkflowInstanceStatus("escalated")).toBe(false);
    expect(isValidWorkflowStepStatus("escalated")).toBe(true);
    expect(isValidWorkflowStepStatus("pending")).toBe(false);
    expect(isValidWorkflowApprovalMode("all")).toBe(true);
    expect(isValidWorkflowApprovalMode("majority")).toBe(false);
    expect(isValidWorkflowDecision("approved")).toBe(true);
    expect(isValidWorkflowDecision("escalated")).toBe(false);
    expect(isValidWorkflowContextEntityType("expense")).toBe(true);
    expect(isValidWorkflowContextEntityType("anything")).toBe(false);
    expect(isValidWorkflowFormRule("owner_admin")).toBe(true);
    expect(isValidWorkflowFormRule("profiles")).toBe(false);
  });

  it("an escalated step is still decidable — escalation is visibility, not authority", () => {
    expect(isDecidableStepStatus("active")).toBe(true);
    expect(isDecidableStepStatus("escalated")).toBe(true);
    expect(isDecidableStepStatus("waiting")).toBe(false);
    expect(isDecidableStepStatus("approved")).toBe(false);
  });

  it("the notice vocabulary is closed and self-consistent", () => {
    expect(new Set(WORKFLOW_NOTICES).size).toBe(WORKFLOW_NOTICES.length);
    expect(isWorkflowNotice("started")).toBe(true);
    expect(isWorkflowNotice("no_approvers")).toBe(true);
    expect(isWorkflowNotice("auto_approved")).toBe(false);
  });
});

describe("migration-missing detection (shared honest-degradation contract)", () => {
  it("accepts exactly the four absent-store codes", () => {
    for (const code of ["42P01", "42703", "42883", "PGRST202"]) {
      expect(isWorkflowMigrationMissingCode(code)).toBe(true);
    }
    expect(isWorkflowMigrationMissingCode("23505")).toBe(false);
    expect(isWorkflowMigrationMissingCode(undefined)).toBe(false);
  });
});

describe("slug derivation (mirrors the SQL slug CHECK)", () => {
  it("produces the SQL-accepted shape", () => {
    expect(workflowSlugFromName("Expense approval")).toBe("expense_approval");
    expect(workflowSlugFromName("Komandiruočių tvirtinimas")).toBe(
      "komandiruociu_tvirtinimas",
    );
    expect(workflowSlugFromName("  A  B  ")).toBe("a_b");
    for (const name of ["Expense approval", "Komandiruočių tvirtinimas"]) {
      const slug = workflowSlugFromName(name);
      expect(slug).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
      expect(slug!.length).toBeLessThanOrEqual(60);
    }
  });

  it("returns null when nothing usable survives", () => {
    expect(workflowSlugFromName("!")).toBeNull();
    expect(workflowSlugFromName("")).toBeNull();
    expect(workflowSlugFromName("®")).toBeNull();
  });
});
