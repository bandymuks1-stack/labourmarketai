import { readFileSync } from "node:fs";
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

  it("neither keep path marks the decision as made unless the receipt action succeeded", () => {
    expect(MANAGER).toMatch(/keepAssignmentAction\(/);
    expect(MANAGER).toMatch(/if \(!r\.ok\) \{\s*setKeepFailed\(true\);\s*return;/);
    expect(TEAM_FORM).toMatch(/keepAssignmentAction\(/);
    expect(TEAM_FORM).toMatch(/if \(r\.ok\) markDecided/);
    expect(TEAM_FORM).not.toMatch(/recordAssignmentDecisionAction\(projectId, m\.profileId, "kept"\)/);
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
