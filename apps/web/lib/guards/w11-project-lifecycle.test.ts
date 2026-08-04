import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  PROJECT_STATUSES,
  PROJECT_TRANSITIONS,
  acceptsAssignment,
  canTransition,
  isActivePlanningStatus,
  isProjectStatus,
  isTerminalStatus,
  nextStatuses,
} from "@/lib/projects/project-lifecycle-model";
import { getResult, canRenderInline } from "@/lib/conversation/result-registry";
import { COMPANY_ACTION_SCHEMAS } from "@/lib/conversation/company-schemas";
import { getConversationAction } from "@/lib/conversation/action-registry";

/**
 * Guard — W11 PROJECT EXECUTION AND COMPLETION SPINE.
 *
 * Three connected defects, pinned so none of them can quietly return:
 *   1. the `projects` row was INSERT-ONLY — status written once, to 'draft',
 *      with no update path anywhere in the product;
 *   2. the status vocabulary carried a dead 'closed' and no 'completed';
 *   3. the `project` result had no inline renderer, so `company.assign-worker`
 *      was unreachable from the chat-first employer surface.
 *
 * It also pins the THREE PREMISES THIS SLICE HAD TO CORRECT, because each was
 * believed true when the work started and acting on any of them would have
 * caused real damage. See §6.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

const MIGRATION = "supabase/migrations/20260804120000_project_lifecycle_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260804120000_project_lifecycle_v1.down.sql";
const RENDERER = "components/app/workspace/project-result.tsx";
const ADAPTER = "lib/projects/project-workspace.ts";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";

/** SQL with `--` comment lines removed. Several assertions below check that
 *  the migration does NOT touch a thing — and the header comment legitimately
 *  NAMES those things to explain why it leaves them alone. Scanning prose for
 *  a code rule is how a guard starts failing on its own documentation. */
function sqlCode(src: string): string {
  return src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

/** TS/TSX with block comments and `//` lines removed, for the same reason. */
function tsCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

const migration = readRepo(MIGRATION);
const migrationCode = sqlCode(migration);
const rollback = readRepo(ROLLBACK);
const renderer = read(RENDERER);
const rendererCode = tsCode(renderer);
const adapter = read(ADAPTER);
const chat = read(CHAT);

// ═══════════════════════════════════════════════════════════════════════════
// 1. One canonical status vocabulary
// ═══════════════════════════════════════════════════════════════════════════

describe("1. one canonical project status contract", () => {
  it("is exactly draft | live | paused | completed", () => {
    expect([...PROJECT_STATUSES]).toEqual(["draft", "live", "paused", "completed"]);
  });

  it("the SQL constraint agrees with the model, and drops 'closed'", () => {
    expect(migrationCode).toMatch(
      /check \(status in \('draft', 'live', 'paused', 'completed'\)\)/,
    );
    // The dead value must not survive as a second word for "finished".
    // On CODE, not prose: the in-file ROLLBACK block legitimately quotes the
    // OLD constraint (including 'closed') to document what reverting restores.
    const constraintBlock = /add constraint projects_status_check[\s\S]*?;/.exec(migrationCode)?.[0] ?? "";
    expect(constraintBlock).not.toMatch(/'closed'/);
  });

  it("rejects invented statuses (default-closed)", () => {
    expect(isProjectStatus("closed")).toBe(false);
    expect(isProjectStatus("active")).toBe(false);
    expect(isProjectStatus("finished")).toBe(false);
    expect(isProjectStatus(null)).toBe(false);
    expect(isProjectStatus(42)).toBe(false);
  });

  it("`active` is NOT a project status anywhere in the model", () => {
    expect((PROJECT_STATUSES as readonly string[]).includes("active")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The transition matrix
// ═══════════════════════════════════════════════════════════════════════════

describe("2. transitions — allowed", () => {
  it.each([
    ["draft", "live"],
    ["live", "paused"],
    ["paused", "live"],
    ["live", "completed"],
    ["paused", "completed"],
  ])("%s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe("2. transitions — rejected", () => {
  it.each([
    ["draft", "paused"],
    ["draft", "completed"],
    ["completed", "draft"],
    ["completed", "live"],
    ["completed", "paused"],
  ])("%s → %s is refused", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("unknown on either side is refused", () => {
    expect(canTransition("closed", "live")).toBe(false);
    expect(canTransition("live", "closed")).toBe(false);
    expect(canTransition(null, "live")).toBe(false);
    expect(canTransition("live", undefined)).toBe(false);
  });

  it("same-state is NOT a transition — it is its own outcome", () => {
    for (const s of PROJECT_STATUSES) {
      expect(canTransition(s, s), `${s} → ${s}`).toBe(false);
    }
  });

  it("completed is terminal — nothing leads out of it", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(nextStatuses("completed")).toEqual([]);
    expect(PROJECT_TRANSITIONS.completed).toEqual([]);
    for (const s of PROJECT_STATUSES) {
      if (s !== "completed") expect(isTerminalStatus(s), `${s}`).toBe(false);
    }
  });

  it("the SQL matrix is the SAME matrix, arm for arm", () => {
    for (const [from, tos] of Object.entries(PROJECT_TRANSITIONS)) {
      for (const to of tos) {
        expect(
          migration.includes(`v_from = '${from}'`) && migration.includes(`v_to = '${to}'`),
          `${from} → ${to} missing from the RPC`,
        ).toBe(true);
      }
    }
    // …and no arm leads out of completed.
    expect(migration).not.toMatch(/v_from = 'completed'/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The RPC's safety properties
// ═══════════════════════════════════════════════════════════════════════════

describe("3. the lifecycle RPC is safe by construction", () => {
  it("locks the project row before deciding anything", () => {
    expect(migration).toMatch(/from public\.projects p[\s\S]{0,120}for update/);
  });

  it("the status update is GUARDED on the value read under the lock", () => {
    expect(migration).toMatch(
      /update public\.projects[\s\S]{0,300}where id = p_project_id[\s\S]{0,120}and status is not distinct from v_from/,
    );
    expect(migration).toMatch(/return jsonb_build_object\('outcome', 'conflict'\)/);
  });

  it("same-state returns already_in_state BEFORE any write or audit", () => {
    const body = migration.slice(migration.indexOf("already_in_state"));
    const sameStateIdx = migration.indexOf("v_from is not distinct from v_to");
    const updateIdx = migration.indexOf("update public.projects");
    const auditIdx = migration.indexOf("insert into public.audit_logs");
    expect(sameStateIdx).toBeGreaterThan(-1);
    expect(sameStateIdx).toBeLessThan(updateIdx);
    expect(sameStateIdx).toBeLessThan(auditIdx);
    expect(body.length).toBeGreaterThan(0);
  });

  it("SECURITY DEFINER hygiene: pinned search_path, PUBLIC + anon revoked", () => {
    expect(migration).toMatch(/security definer\s+set search_path = public/);
    expect(migration).toMatch(
      /revoke all on function public\.set_project_status_v1\(uuid, text\) from public;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.set_project_status_v1\(uuid, text\) from anon;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.set_project_status_v1\(uuid, text\) to authenticated;/,
    );
  });

  it("authority is the EXISTING helper — no second model", () => {
    expect(migration).toMatch(/public\.can_manage_project\(p_project_id\)/);
    // No hand-rolled ownership check that could drift from it.
    expect(migration).not.toMatch(/from public\.companies[\s\S]{0,120}profile_id/);
  });

  it("no existence oracle: an unrelated caller gets not_found, not not_authorized", () => {
    expect(migration).toMatch(
      /is_assigned_to_project\(p_project_id\)[\s\S]{0,160}'not_authorized'[\s\S]{0,160}'not_found'/,
    );
  });

  it("never raises raw SQL at the caller — every path returns a tagged outcome", () => {
    // Scoped to the LIFECYCLE function: `assign_worker_to_project` is copied
    // verbatim from 20260609120000 and keeps its existing raise-based
    // convention, which is not this slice's to change.
    const fn = migrationCode.slice(
      migrationCode.indexOf("function public.set_project_status_v1"),
      migrationCode.indexOf("revoke all on function public.set_project_status_v1"),
    );
    // Exactly one: the not-authenticated guard. Every domain outcome is a tag.
    expect((fn.match(/raise exception/g) ?? []).length).toBe(1);
    for (const tag of [
      "transitioned",
      "already_in_state",
      "invalid_transition",
      "not_authorized",
      "not_found",
      "conflict",
    ]) {
      expect(migration, tag).toContain(`'${tag}'`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Completion ends this project's roster — and nothing else
// ═══════════════════════════════════════════════════════════════════════════

describe("4. completion ends exactly the right assignments", () => {
  it("is scoped to the exact project", () => {
    expect(migration).toMatch(
      /from public\.project_worker_assignments pwa[\s\S]{0,160}where pwa\.project_id = p_project_id[\s\S]{0,80}and pwa\.status = 'active'/,
    );
  });

  it("NEVER updates by company + worker alone", () => {
    // The exact broad-update shape this must not have.
    expect(migration).not.toMatch(
      /update public\.project_worker_assignments[\s\S]{0,200}where[\s\S]{0,120}company_id/,
    );
    expect(migration).not.toMatch(
      /update public\.project_worker_assignments[\s\S]{0,200}where\s+worker_id\s*=/,
    );
  });

  it("locks the assignment rows and only ends ACTIVE ones", () => {
    expect(migration).toMatch(/and pwa\.status = 'active'\s*\n\s*for update/);
    expect(migration).toMatch(/where id = r\.id\s*\n\s*and status = 'active'/);
  });

  it("never overwrites an ended_at that already exists", () => {
    expect(migration).toMatch(/ended_at = coalesce\(ended_at, now\(\)\)/);
  });

  it("deletes nothing", () => {
    expect(migration).not.toMatch(/delete from public\.project_worker_assignments/);
    expect(migration).not.toMatch(/delete from public\.projects/);
  });

  it("only the completing transition touches assignments", () => {
    expect(migration).toMatch(/if v_to = 'completed' then[\s\S]{0,2000}end if;/);
    const before = migration.slice(0, migration.indexOf("if v_to = 'completed'"));
    expect(before).not.toMatch(/update public\.project_worker_assignments/);
  });

  it("a completed project refuses NEW assignments, server-side", () => {
    expect(migration).toMatch(/if v_status = 'completed' then\s*\n\s*raise exception/);
    // …and the check sits AFTER authorization, so it cannot be used to probe.
    const authIdx = migration.indexOf("Not authorized to assign this worker");
    const guardIdx = migration.indexOf("if v_status = 'completed'");
    expect(authIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(authIdx);
  });

  it("the pure model agrees about assignability", () => {
    expect(acceptsAssignment("draft")).toBe(true);
    expect(acceptsAssignment("live")).toBe(true);
    expect(acceptsAssignment("paused")).toBe(true);
    expect(acceptsAssignment("completed")).toBe(false);
    expect(acceptsAssignment("nonsense")).toBe(false);
  });

  it("creates NO second public assignment-ending API", () => {
    // The per-worker RPC keeps its exact signature and is not redefined here.
    expect(migrationCode).not.toMatch(/create or replace function public\.end_worker_project_assignment/);
    const created = migrationCode.match(/create or replace function public\.(\w+)/g) ?? [];
    expect(created.sort()).toEqual([
      "create or replace function public.assign_worker_to_project",
      "create or replace function public.set_project_status_v1",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Audit
// ═══════════════════════════════════════════════════════════════════════════

describe("5. audit records real changes only", () => {
  it("one row per real transition, and one per real assignment ending", () => {
    expect(migration).toMatch(/'set_project_status'/);
    expect(migration).toMatch(/'end_project_assignment'/);
  });

  it("the assignment audit is inside the `if found` of a real update", () => {
    expect(migration).toMatch(
      /if found then[\s\S]{0,120}v_ended := v_ended \+ 1;[\s\S]{0,400}insert into public\.audit_logs/,
    );
  });

  it("carries no project body, no worker PII, no client payload", () => {
    const auditBlocks = migration.match(/insert into public\.audit_logs[\s\S]{0,700}?\)\);/g) ?? [];
    expect(auditBlocks.length).toBeGreaterThan(0);
    for (const b of auditBlocks) {
      for (const banned of ["title", "notes", "full_name", "email", "phone", "p_status"]) {
        expect(b, `audit leaks ${banned}`).not.toContain(banned);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE THREE CORRECTED PREMISES — the reason this slice looks the way it does
// ═══════════════════════════════════════════════════════════════════════════

describe("6. corrected premises stay corrected", () => {
  it("W6 is NOT touched: no engagement_contexts, no engagement writer", () => {
    // `completed_engagement` reads engagement_contexts.ended_at, whose writer
    // (end_org_membership_v1) already exists, is applied in production and is
    // already called by the app. Completing a PROJECT must never end a person's
    // ORGANIZATION membership.
    expect(migrationCode).not.toMatch(/engagement_contexts/);
    expect(migrationCode).not.toMatch(/end_org_membership/);
    expect(migrationCode).not.toMatch(/company_worker_engagements/);
    expect(migrationCode).not.toMatch(/end_company_worker_engagement/);
    expect(adapter).not.toMatch(/engagement_contexts|company_worker_engagements/);
    expect(renderer).not.toMatch(/engagement_contexts|company_worker_engagements/);
  });

  it("no experience record can be created by this slice", () => {
    for (const [name, src] of [
      ["migration", migrationCode],
      ["adapter", tsCode(adapter)],
      ["renderer", rendererCode],
    ] as const) {
      expect(src, `${name} touches experience records`).not.toMatch(/experience_record/);
    }
  });

  it("the completion copy states that no review is created", () => {
    const en = JSON.parse(read("messages/en.json")) as Record<string, never>;
    const body = (en as unknown as {
      conversation: { results: { projectCompleteBody: string } };
    }).conversation.results.projectCompleteBody;
    expect(body).toMatch(/no review|no rating/i);
  });

  it("`active` assignment literals are LEFT ALONE — renaming them would break reads", () => {
    // Every "active" in lib/projects is project_worker_assignments.status, a
    // different column on a different table. It must survive this slice.
    for (const f of [
      "lib/projects/map.ts",
      "lib/projects/projects.ts",
      "lib/projects/operations.ts",
    ]) {
      expect(read(f), `${f} lost its assignment filter`).toMatch(/\.eq\("status", "active"\)/);
    }
  });

  it("projects_select is NOT redefined here — production already fixed it", () => {
    // The tenant-blind `status='live'` branch was removed by the applied
    // 20260803090000; re-stating a policy this slice did not design would risk
    // reverting that fix.
    expect(migrationCode).not.toMatch(/create policy|drop policy|projects_select/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Rollback is guarded
// ═══════════════════════════════════════════════════════════════════════════

describe("7. rollback refuses once real history exists", () => {
  it("the paired file exists", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
  });

  it("aborts when any project is completed", () => {
    expect(rollback).toMatch(/from public\.projects where status = 'completed'/);
    expect(rollback).toMatch(/ROLLBACK REFUSED/);
  });

  it("aborts when a completion ended assignments", () => {
    expect(rollback).toMatch(/action = 'end_project_assignment'/);
    expect(rollback).toMatch(/'cause' = 'project_completed'/);
  });

  it("never clears an ended_at and never deletes", () => {
    expect(rollback).not.toMatch(/set ended_at = null/);
    expect(rollback).not.toMatch(/delete from/);
  });

  it("restores the pre-W11 constraint and drops only what it added", () => {
    expect(rollback).toMatch(/drop function if exists public\.set_project_status_v1/);
    expect(rollback).toMatch(/check \(status in \('draft', 'live', 'paused', 'closed'\)\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. The inline project result
// ═══════════════════════════════════════════════════════════════════════════

describe("8. the project result is real, and renders", () => {
  it("readiness is `real` AND a renderer exists — never one without the other", () => {
    expect(getResult("project")?.dataReadiness).toBe("real");
    expect(read("components/app/workspace/result-body.tsx")).toMatch(/case "project":/);
    expect(read("components/app/workspace/result-body.tsx")).toMatch(/<ProjectResult/);
  });

  it("renders inline where the registry says it is meaningful", () => {
    expect(canRenderInline("project", "organization")).toBe(true);
    expect(canRenderInline("project", "project")).toBe(true);
    expect(canRenderInline("project", "personal")).toBe(false);
  });

  it("keeps the real full screen as the fallback from every state", () => {
    expect(getResult("project")?.advancedRoute).toBe("/dashboard/projects");
    expect(renderer).toMatch(/const FULL_ROUTE = "\/dashboard\/projects"/);
    expect((renderer.match(/<Explained/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("fabricates NOTHING — no percentage, score or estimate", () => {
    for (const banned of [
      "progress",
      "percent",
      "completionRate",
      "estimate",
      "score",
      "aiStatus",
    ]) {
      expect(rendererCode.toLowerCase(), `renderer mentions ${banned}`).not.toContain(
        banned.toLowerCase(),
      );
    }
    // The contract cannot even carry such a field.
    expect(tsCode(read("lib/projects/project-result-contract.ts")).toLowerCase()).not.toContain(
      "progress",
    );
  });

  it("distinguishes 'stages unreadable' from 'no stages'", () => {
    expect(renderer).toMatch(/project-stages-unavailable/);
    expect(renderer).toMatch(/project-stages-empty/);
    expect(adapter).toMatch(/stages: readonly ProjectStageRow\[\] \| null/);
  });

  it("an unknown status is said, never shown as draft", () => {
    expect(renderer).toMatch(/projectStatusUnknown/);
    expect(adapter).toMatch(/isProjectStatus\(value\) \? value : null/);
  });

  it("contains no router and no Link", () => {
    expect(renderer).not.toMatch(/useRouter|from "next\/link"/);
  });

  it("offers ONLY transitions the shared matrix allows", () => {
    expect(renderer).toMatch(/nextStatuses\(project\.status\)/);
    // No hand-written per-state button list that could drift from the matrix.
    expect(renderer).not.toMatch(/status === "draft" \? \[/);
  });

  it("completion asks for an explicit confirmation", () => {
    expect(renderer).toMatch(/project-complete-confirm/);
    expect(renderer).toMatch(/projectCompleteBody/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. company.assign-worker is finally reachable
// ═══════════════════════════════════════════════════════════════════════════

describe("9. company.assign-worker has a real client caller", () => {
  it("is still a registered executable action", () => {
    expect(Object.keys(COMPANY_ACTION_SCHEMAS)).toContain("company.assign-worker");
  });

  it("the chat dispatches it through the EXISTING dispatcher", () => {
    expect(chat).toMatch(/dispatchWorkerAction\("company\.assign-worker"/);
    expect(chat).toMatch(/from "@\/lib\/conversation\/dispatch"/);
  });

  it("mints a FRESH confirmation token first (strong tier)", () => {
    expect(getConversationAction("company.assign-worker")?.confirmation).toBe(
      "strong_irreversible",
    );
    expect(chat).toMatch(
      /prepareConfirmationAction\("company\.assign-worker"[\s\S]{0,600}confirmationToken: prep\.token/,
    );
  });

  it("the panel asks the conversation — it never assigns by itself", () => {
    expect(renderer).toMatch(/onAssignWorker/);
    expect(renderer).not.toMatch(/dispatchWorkerAction|assign_worker_to_project/);
  });

  it("offers only people the server would actually accept", () => {
    // Same population as the RPC's caller_manages_worker gate.
    expect(adapter).toMatch(/listActiveCompanyWorkers/);
    expect(chat).toMatch(/loadAssignableWorkersForProject/);
  });

  it("no second assignment API was created", () => {
    expect(adapter).not.toMatch(/assign_worker_to_project/);
    const chatRpc = chat.match(/\.rpc\(/g) ?? [];
    expect(chatRpc.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Planning semantics + no new surface
// ═══════════════════════════════════════════════════════════════════════════

describe("10. planning semantics are pinned, W12 is not rewritten", () => {
  it("only `live` is ACTIVE work", () => {
    expect(isActivePlanningStatus("live")).toBe(true);
    expect(isActivePlanningStatus("draft")).toBe(false);
    expect(isActivePlanningStatus("paused")).toBe(false);
    expect(isActivePlanningStatus("completed")).toBe(false);
  });

  it("a completed project never produces a forward band", () => {
    const planning = read("lib/planning/planning.ts");
    expect(planning).toMatch(
      /const PLANNED_PROJECT_STATUSES = \["draft", "live", "paused"\] as const;/,
    );
    expect(planning).not.toMatch(/PLANNED_PROJECT_STATUSES = \[[^\]]*"completed"/);
  });

  it("the booking overlap invariant is untouched", () => {
    const planningModel = read("lib/planning/planning-model.ts");
    expect(planningModel).toMatch(/isConflictEligible/);
    // This slice may not edit W12's booking RPC.
    expect(existsSync(join(REPO, "supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql"))).toBe(true);
  });

  it("the reports hub counts the terminal status instead of dropping it", () => {
    const reports = read("lib/reports/reports-hub.ts");
    expect(reports).toMatch(
      /REPORT_PROJECT_STATUSES = \["draft", "live", "paused", "completed"\]/,
    );
  });
});

describe("11. no new surface", () => {
  it("this slice created no screen", () => {
    for (const p of [
      "app/[locale]/dashboard/project-lifecycle",
      "app/[locale]/dashboard/projects/[id]/complete",
      "app/[locale]/dashboard/company/projects/lifecycle",
    ]) {
      expect(existsSync(join(APP, p)), `${p} must not exist`).toBe(false);
    }
  });

  it("no billing, payment or auth file is involved", () => {
    for (const src of [migrationCode, tsCode(adapter), rendererCode]) {
      expect(src).not.toMatch(/stripe|billing|payment|credits/i);
    }
  });

  /**
   * THE HUMAN GATE — and a note on how this assertion was wrong.
   *
   * It used to read `expect(migrationCode).not.toMatch(/@human-gate-approved/)`
   * to pin "ships unapplied". That could NEVER have failed: the marker is a
   * `--` comment and `migrationCode` strips every comment line, so the check
   * was vacuous from the moment it was written. It kept passing after the
   * marker was added, which is exactly how a guard that cannot fail hides a
   * real change.
   *
   * It now asserts the REAL post-gate state, on the RAW file, in both
   * directions — that the marker is present AND that it is narrow.
   */
  it("carries the owner's human-gate marker, and it is NARROW", () => {
    // Present, on the raw file — the only place a `--` marker can be seen.
    expect(migration).toMatch(/^\s*--\s*@human-gate-approved\b/m);

    // Narrow: it names the three approved findings and this file's scope, and
    // it does not claim to cover anything else.
    for (const finding of ["security-definer-function", "grant-or-revoke", "data-dml"]) {
      expect(migration, `marker must name ${finding}`).toContain(finding);
    }
    expect(migration).toMatch(/PR #1007/);
    expect(migration).toMatch(/does not weaken, suppress, delete, bypass or/i);
  });

  it("THIS approval was not copied onto any other migration", () => {
    // NOTE: ~97 migrations already carry a marker from their own historical
    // approvals, so "only one gated file exists" would be false and asserting
    // it would just be wrong. The property that actually matters is that THIS
    // owner decision — PR #1007, 2026-08-04 — gated exactly ONE file.
    const dir = join(REPO, "supabase", "migrations");
    const claimingThisApproval = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("PR #1007"));
    expect(claimingThisApproval).toEqual([
      "20260804120000_project_lifecycle_v1.sql",
    ]);
  });

  it("the gate script itself was not weakened", () => {
    const gate = readFileSync(join(REPO, ".github", "scripts", "migration-safety.mjs"), "utf8");
    // The three findings must still be RED rules that the marker BYPASSES and
    // REPORTS — not rules that were deleted or downgraded.
    for (const rule of ["security-definer-function", "grant-or-revoke", "data-dml"]) {
      expect(gate, `${rule} rule missing from the gate`).toContain(rule);
    }
    expect(gate).toMatch(/bypassed by @human-gate-approved/);
  });
});
