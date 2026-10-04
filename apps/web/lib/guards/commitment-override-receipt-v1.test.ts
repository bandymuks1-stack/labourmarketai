import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OVERRIDE_REASON_CODES,
  parseOverrideReasonCode,
  toReceiptCollisions,
} from "@/lib/projects/override-receipt-model";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * J-TIME-FREEDOM step 5 - the override receipt (RED draft, needs-human-gate,
 * NOT applied). Static guards over the migration and the wiring; the database
 * behaviour is proven by scripts/db-proof/commitment-override-receipts-v1.sh.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const CR = String.fromCharCode(13);
const read = (...p: string[]) =>
  readFileSync(join(REPO, ...p), "utf8").split(CR).join("");
const NAME = "20261003150100_commitment_override_receipts_v1";
const UP = read("supabase", "migrations", `${NAME}.sql`);
const DOWN = read("supabase", "rollbacks", `${NAME}.down.sql`);
const ACTIONS = read("apps", "web", "lib", "projects", "actions.ts");
const MANAGER = read("apps", "web", "components", "app", "project-assignment-manager.tsx");
const TEAM_FORM = read("apps", "web", "components", "app", "team-assign-form.tsx");
// The team-basis keep path (J-TIME-FREEDOM for teams): a small seam component.
const TEAM_KEEP_SRC = read("apps", "web", "components", "app", "team-member-keep-decision.tsx");
// comments explain the seam; the assertions below are about CODE
const TEAM_KEEP = TEAM_KEEP_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// #2149's team block does not exist before that PR is integrated.
const TEAM_BLOCK_PATH = join(REPO, "apps", "web", "components", "app", "project-team-assignments.tsx");
const TEAM_BLOCK = existsSync(TEAM_BLOCK_PATH) ? read("apps", "web", "components", "app", "project-team-assignments.tsx") : null;
const NAME2 = "20261003150900_commitment_override_receipt_brigade_basis_v1";
const UP2 = read("supabase", "migrations", `${NAME2}.sql`);
const DOWN2 = read("supabase", "rollbacks", `${NAME2}.down.sql`);

describe("migration - shape and safety", () => {
  it("carries the human-gate marker; the rollback does not", () => {
    expect(UP).toMatch(/^-- @human-gate-approved/m);
    expect(DOWN).not.toMatch(/@human-gate-approved/i);
  });

  it("is append-only: update/delete/truncate triggers, FORCE RLS, no write grant", () => {
    expect(UP).toMatch(/before update or delete on public\.commitment_override_receipts/);
    expect(UP).toMatch(/before truncate on public\.commitment_override_receipts/);
    expect(UP).toMatch(/force row level security/);
    expect(UP).toMatch(/revoke all on public\.commitment_override_receipts from public, anon, authenticated/);
    expect(UP).toMatch(/grant select on public\.commitment_override_receipts to authenticated/);
    expect(UP).not.toMatch(/grant (insert|update|delete)[^;]*commitment_override_receipts/i);
    expect(UP).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
  });

  it("has NO free-text column: the reason is a closed code", () => {
    expect(UP).toMatch(/reason_code\s+text check \(reason_code is null or reason_code in/);
    expect(UP).not.toMatch(/\breason\s+text\b/);
    for (const c of OVERRIDE_REASON_CODES) expect(UP).toContain(`'${c}'`);
  });

  it("the writer is SECURITY DEFINER with a pinned search_path, NULL-safe, authenticated only", () => {
    expect(UP).toMatch(/security definer\s+set search_path to 'public'/);
    expect(UP).toMatch(/not coalesce\(public\.can_manage_project\(p_project_id\), false\)/);
    expect(UP).toMatch(/coalesce\(public\.can_manage_project\(project_id\), false\)/);
    expect(UP).toMatch(/coalesce\(public\.owns_worker\(worker_id\), false\)/);
    expect(UP).toMatch(/revoke all on function public\.record_commitment_override_v1\(uuid, uuid, jsonb, text\) from public, anon/);
    expect(UP).toMatch(/grant execute on function public\.record_commitment_override_v1\(uuid, uuid, jsonb, text\) to authenticated/);
  });

  it("an absence is rebuilt as kind + dates only (whitelist, no id)", () => {
    const abs = UP.slice(UP.indexOf("if v_kind = 'absence' then"), UP.indexOf("else\n      v_sid"));
    const code = abs.replace(/--.*/g, "");
    expect(code).toContain("'kind', v_kind, 'overlapStart', v_os, 'overlapEnd', v_oe");
    expect(code).not.toMatch(/sourceId|label|category|reason/);
    expect(UP).toMatch(/'project', 'booking', 'trip', 'absence', 'plan'/);
  });

  it("the window is read from projects, never from the caller", () => {
    expect(UP).toMatch(/select p\.start_date, p\.end_date into v_start, v_end from public\.projects/);
    expect(UP).not.toMatch(/p_window/);
  });

  it("is idempotent and bounded", () => {
    expect(UP).toMatch(/unique \(assignment_id, fingerprint\)/);
    expect(UP).toMatch(/v_n >= 50/);
  });

  it("the rollback refuses to drop evidence", () => {
    expect(DOWN).toMatch(/refusing to drop evidence/);
  });
});

describe("wiring - fail-loud, server-recomputed", () => {
  it("keepAssignmentAction recomputes the collisions server-side and returns failure", () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function keepAssignmentAction"));
    expect(fn).toMatch(/reservationAfterAssign\(/);
    expect(fn).toMatch(/record_commitment_override_v1/);
    expect(fn).toMatch(/ok: false, code: "error"/);
    // collisions never come from a client parameter
    expect(fn.slice(0, fn.indexOf("{\n  const supabase"))).not.toMatch(/collisions/i);
  });

  it("the person keep path marks the decision as made only when the receipt action succeeded", () => {
    expect(MANAGER).toMatch(/keepAssignmentAction\(/);
    expect(MANAGER).toMatch(/if \(!r\.ok\) \{\s*setKeepFailed\(true\);\s*return;/);
  });

  it("no team form records 'kept' through the best-effort audit append; if it keeps, it is fail-loud", () => {
    // the legacy per-member form (pre-#2149) keeps through the receipt action
    // and marks the decision only on success; the canonical team block
    // (post-#2149) no longer contains the form's keep path at all.
    expect(TEAM_FORM).not.toMatch(/recordAssignmentDecisionAction\(projectId, m\.profileId, "kept"\)/);
    if (/keepAssignmentAction\(/.test(TEAM_FORM)) {
      expect(TEAM_FORM).toMatch(/if \(r\.ok\) markDecided/);
    }
  });

  it("the TEAM keep path (member of an actively assigned team) is fail-loud and server-recomputed", () => {
    // it goes through the same server action that re-derives the collisions
    expect(TEAM_KEEP).toMatch(/keepAssignmentAction\(projectId, memberProfileId, reasonCode\)/);
    // decided only when the action returned ok; otherwise the failure is shown
    expect(TEAM_KEEP).toMatch(/if \(r\.ok\) \{\s*setKeepFailed\(false\);\s*setDecided\(true\);\s*\} else \{\s*setKeepFailed\(true\);/);
    expect(TEAM_KEEP).toMatch(/keepFailed=\{keepFailed\}/);
    // never the best-effort audit append, never a client-supplied collision list
    expect(TEAM_KEEP).not.toMatch(/recordAssignmentDecisionAction/);
    expect(TEAM_KEEP).not.toMatch(/collisions/);
    // the closed reason select is wired (no free text on the receipt path)
    expect(TEAM_KEEP).toMatch(/reasons=\{reasons\}/);
    // no swap / undo: a team member is not a person assignment
    expect(TEAM_KEEP).not.toMatch(/\bonSwap\b|\bonUndo\b/);
  });

  it("SEAM: once #2149's team block exists it must offer the keep decision, not an advisory-only notice", () => {
    // before #2149 is integrated the block does not exist (null): nothing to pin.
    // after: every member clash must render through TeamMemberKeepDecision.
    expect(TEAM_BLOCK === null || /<TeamMemberKeepDecision\b/.test(TEAM_BLOCK)).toBe(true);
    expect(TEAM_BLOCK === null || !/<ReservationNotice\b/.test(TEAM_BLOCK)).toBe(true);
  });
});

describe("migration 20261003150900 - team basis for the receipt", () => {
  it("is RED-marked, declares its dependencies, has a rollback", () => {
    expect(UP2).toMatch(/^-- @human-gate-approved/m);
    expect(UP2).toMatch(/20261003150100_commitment_override_receipts_v1/);
    expect(UP2).toMatch(/20261003150600_brigade_work_assignment_v1/);
    expect(UP2).toMatch(/to_regclass\('public\.team_assignments'\) is null/);
    expect(UP2).toMatch(/to_regprocedure\('public\.team_member_at_v1\(uuid,uuid,timestamptz\)'\) is null/);
    expect(DOWN2).not.toMatch(/@human-gate-approved/i);
    expect(DOWN2).toMatch(/refusing to drop evidence/);
    expect(DOWN2).toMatch(/team_assignment_id is not null/);
  });

  it("stores exactly ONE basis, additively, with the same lifecycle", () => {
    expect(UP2).toMatch(/add column if not exists team_assignment_id uuid\s+references public\.team_assignments\(id\) on delete cascade/);
    expect(UP2).toMatch(/check \(num_nonnulls\(assignment_id, team_assignment_id\) = 1\)/);
    expect(UP2).toMatch(/unique \(team_assignment_id, fingerprint\)/);
  });

  it("resolves membership AS OF NOW through team_member_at_v1, only for an ACTIVE team assignment", () => {
    expect(UP2).toMatch(/public\.team_member_at_v1\(ta\.team_org_id, p_worker_profile_id, now\(\)\)/);
    expect(UP2).toMatch(/ta\.status = 'active' and ta\.ended_at is null/);
  });

  it("keeps the authority, the whitelist, the closed reason and the grants of the first migration", () => {
    expect(UP2).toMatch(/not coalesce\(public\.can_manage_project\(p_project_id\), false\)/);
    expect(UP2).toMatch(/security definer\s+set search_path to 'public'/);
    expect(UP2).toMatch(/revoke all on function public\.record_commitment_override_v1\(uuid, uuid, jsonb, text\) from public, anon/);
    expect(UP2).toMatch(/grant execute on function public\.record_commitment_override_v1\(uuid, uuid, jsonb, text\) to authenticated/);
    expect(UP2).toMatch(/'kind', v_kind, 'overlapStart', v_os, 'overlapEnd', v_oe\)\);/);
    for (const c of OVERRIDE_REASON_CODES) expect(UP2).toContain(`'${c}'`);
    // no new grant, policy, table or free-text column
    expect(UP2).not.toMatch(/create policy/i);
    expect(UP2).not.toMatch(/create table/i);
    expect(UP2).not.toMatch(/grant (select|insert|update|delete)/i);
    expect(UP2).not.toMatch(/\breason\s+text\b/);
  });

  it("the fingerprint includes the basis AND the worker; the person formula is unchanged; the cap is per basis", () => {
    expect(UP2).toMatch(/md5\(v_assign::text \|\| '\|' \|\| v_uid::text \|\| '\|kept\|'/);
    expect(UP2).toMatch(/md5\('team:' \|\| v_team::text \|\| '\|' \|\| v_worker::text/);
    expect(UP2).toMatch(/v_n >= 50/);
    expect(UP2).toMatch(/r\.team_assignment_id is not distinct from v_team/);
  });

  it("never fans out: no write to project_worker_assignments", () => {
    const code = UP2.replace(/--.*/g, "");
    expect(code).not.toMatch(/(insert into|update|delete from)\s+public\.project_worker_assignments/i);
  });
});

describe("receipt model - what may be stored", () => {
  const verdict = {
    state: "collides",
    gaps: [],
    collisions: [
      { source: "absence", sourceId: "abs-1", label: "Chemotherapy", startDate: "2026-10-01", endDate: "2026-10-09", overlapStart: "2026-10-05", overlapEnd: "2026-10-06" },
      { source: "trip", sourceId: "trip-1", label: "Oslo", startDate: "2026-10-01", endDate: "2026-10-09", overlapStart: "2026-10-07", overlapEnd: "2026-10-08" },
    ],
  } as unknown as ReservationVerdict;

  it("an absence keeps kind + dates only; other kinds keep the id; no label anywhere", () => {
    const out = toReceiptCollisions(verdict);
    expect(out[0]).toEqual({ kind: "absence", overlapStart: "2026-10-05", overlapEnd: "2026-10-06" });
    expect(out[1]).toEqual({ kind: "trip", sourceId: "trip-1", overlapStart: "2026-10-07", overlapEnd: "2026-10-08" });
    expect(JSON.stringify(out)).not.toMatch(/Chemo|Oslo|abs-1|label/);
  });

  it("only closed reason codes parse", () => {
    expect(parseOverrideReasonCode("urgent_need")).toBe("urgent_need");
    expect(parseOverrideReasonCode("he was ill")).toBeNull();
    expect(parseOverrideReasonCode(undefined)).toBeNull();
  });
});
