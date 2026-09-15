import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCollisions } from "@/lib/planning/override-receipt-model";

/**
 * J-TIME-FREEDOM step 5 — "The authorized actor decides, and an explicit
 * override is recorded with a receipt." The RED packet (migration
 * 20260915120000, PREPARED, NOT APPLIED) and the app half that degrades
 * honestly until it is.
 *
 * What this guard pins is the SHAPE of the receipt, because every invariant
 * the owner named is a shape property:
 *   · override is explicit      → a form the manager must act on; the
 *                                 assignment is written before and without it
 *   · override leaves a receipt → append-only: trigger refuses UPDATE/DELETE,
 *                                 no write policy, one definer writer
 *   · the subject can see it    → the SELECT policy's second arm is the worker
 *   · a receipt is about a real → the RPC requires an ACTIVE assignment
 *     commitment
 *   · nothing is faked          → needs_migration renders as "prepared, not
 *                                 enabled"; the annotation is ABSENT because
 *                                 the owner has not approved it
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const MIGRATION = join(REPO, "supabase", "migrations", "20260915120000_commitment_override_receipts_v1.sql");
const ROLLBACK = join(REPO, "supabase", "rollbacks", "20260915120000_commitment_override_receipts_v1.down.sql");
const read = (p: string) => readFileSync(p, "utf8");

describe("the migration packet — prepared, unapplied, and shaped as a receipt", () => {
  const sql = read(MIGRATION);

  it("exists with its paired guarded rollback", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = read(ROLLBACK);
    expect(down).toMatch(/still holds % receipt\(s\)/);
    expect(down).toMatch(/^begin;/m);
    expect(sql).toMatch(/^-- ROLLBACK/m);
  });

  it("carries NO @human-gate-approved annotation — the owner has not approved it", () => {
    expect(sql).not.toMatch(/@human-gate-approved/);
    expect(sql).toMatch(/PREPARED FOR REVIEW ONLY/);
  });

  it("is append-only: a trigger refuses UPDATE and DELETE, and no write policy exists", () => {
    expect(sql).toMatch(/before update or delete on public\.commitment_override_receipts/);
    expect(sql).toMatch(/is append-only \(% refused\)/);
    expect(sql).not.toMatch(/for insert/i);
    expect(sql).not.toMatch(/for update/i);
    expect(sql).not.toMatch(/for delete/i);
    expect(sql).not.toMatch(/updated_at/);
  });

  it("the subject can read their own receipt, and only the project's managers otherwise", () => {
    const policy = sql.slice(sql.indexOf("create policy commitment_override_receipts_select"));
    expect(policy).toMatch(/public\.can_manage_project\(project_id\)/);
    expect(policy).toMatch(/or public\.owns_worker\(worker_id\)/);
    expect(sql).toMatch(/revoke all on public\.commitment_override_receipts from public, anon/);
  });

  it("the one writer requires a manager of THIS project and an ACTIVE assignment, and snapshots the window from the project row", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.record_commitment_override_v1"));
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = public/);
    expect(fn).toMatch(/public\.can_manage_project\(p_project_id\)/);
    expect(fn).toMatch(/a\.status\s+= 'active'/);
    expect(fn).toMatch(/select start_date, end_date into v_start, v_end from public\.projects where id = p_project_id/);
    expect(fn).toMatch(/not in \('project','booking','trip','absence'\)/);
    expect(fn).toMatch(/revoke all on function public\.record_commitment_override_v1\(uuid, uuid, jsonb, text\) from public, anon/);
    expect(fn).toMatch(/grant execute on function public\.record_commitment_override_v1\(uuid, uuid, jsonb, text\) to authenticated/);
  });
});

describe("the app half — explicit, after the write, honest when unapplied", () => {
  const actions = read(join(APP, "lib/projects/actions.ts"));
  const receiptAction = read(join(APP, "lib/planning/override-receipt-actions.ts"));
  const manager = read(join(APP, "components/app/project-assignment-manager.tsx"));
  const reader = read(join(APP, "lib/planning/override-receipts.ts"));

  it("the receipt is a SEPARATE act: the assignment action never writes one", () => {
    expect(actions).not.toMatch(/record_commitment_override_v1/);
    expect(actions).toMatch(/assignment\?: \{ projectId: string; workerId: string \}/);
  });

  it("the receipt action maps a missing RPC to needs_migration — never to success", () => {
    expect(receiptAction).toMatch(/"42883", "PGRST202", "42P01"/);
    expect(receiptAction).toMatch(/return \{ status: "needs_migration" \}/);
    expect(receiptAction).not.toMatch(/status: "ok"[^}]*\}\s*;?\s*\/\/ fallback/);
  });

  it("the form renders only under a COLLIDING verdict, for a named assignment, and shows the unapplied state truthfully", () => {
    expect(manager).toMatch(/function OverrideReceiptForm\(/);
    expect(manager).toMatch(/\{assignment \? <OverrideReceiptForm verdict=\{verdict\} assignment=\{assignment\} labels=\{labels\} \/> : null\}/);
    expect(manager).toMatch(/data-testid="assign-override-receipt"/);
    expect(manager).toMatch(/labels\.receiptNeedsMigration/);
    // The form lives inside the `collides` branch of the notice: the unknown
    // branch returns before it, and the clear branch returns null.
    const notice = manager.slice(manager.indexOf("function ReservationNotice("));
    const unknownReturn = notice.indexOf('data-testid="assign-reservation-unknown"');
    const form = notice.indexOf("<OverrideReceiptForm");
    expect(unknownReturn).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(unknownReturn);
  });

  it("the reader has three states and never renders an unapplied or failed read as an empty list", () => {
    expect(reader).toMatch(/status: "not-applied"/);
    expect(reader).toMatch(/status: "unavailable"/);
    expect(reader).toMatch(/MISSING_OBJECT_CODES\.has\(res\.error\.code \?\? ""\) \? \{ status: "not-applied" \} : \{ status: "unavailable" \}/);
  });

  it("both parties read the same rows: the manager by project, the worker by worker", () => {
    const ops = read(join(APP, "app/[locale]/dashboard/projects/[id]/operations/page.tsx"));
    const planning = read(join(APP, "app/[locale]/dashboard/planning/page.tsx"));
    expect(ops).toMatch(/getProjectOverrideReceipts\(id\)/);
    expect(ops).toMatch(/perspective="manager"/);
    expect(planning).toMatch(/getWorkerOverrideReceipts\(ownWorkerId\)/);
    expect(planning).toMatch(/perspective="worker"/);
  });

  it("every routed locale carries the receipt keys", () => {
    for (const locale of ["en", "lt", "de", "nl", "ru"]) {
      const m = JSON.parse(read(join(APP, `messages/${locale}.json`)));
      const r = m.projects?.assign?.receipt;
      expect(r, `${locale}: projects.assign.receipt`).toBeTruthy();
      for (const k of ["prompt", "reasonLabel", "submit", "saving", "recorded", "needsMigration", "notAuthorized", "invalid", "error"]) {
        expect(typeof r[k], `${locale}: ${k}`).toBe("string");
      }
      const s = m.overrideReceipts;
      expect(s, `${locale}: overrideReceipts`).toBeTruthy();
      for (const k of ["title", "introManager", "introWorker", "notApplied", "unavailable", "empty", "acceptedOn", "window", "windowUndated"]) {
        expect(typeof s[k], `${locale}: ${k}`).toBe("string");
      }
      for (const src of ["project", "booking", "trip", "absence"]) expect(typeof s.source[src]).toBe("string");
    }
  });
});

describe("parseCollisions — the closed shape, refused before it leaves the process", () => {
  const good = JSON.stringify([
    { source: "booking", sourceId: "b1", overlapStart: "2026-10-05", overlapEnd: "2026-10-07" },
  ]);
  it("accepts the shape the RPC accepts and nothing more", () => {
    expect(parseCollisions(good)).toEqual([
      { source: "booking", sourceId: "b1", overlapStart: "2026-10-05", overlapEnd: "2026-10-07" },
    ]);
    // Extra keys are dropped, not stored.
    const extra = JSON.stringify([{ source: "trip", sourceId: "t", overlapStart: "2026-01-01", overlapEnd: "2026-01-02", label: "leak" }]);
    expect(parseCollisions(extra)![0]).not.toHaveProperty("label");
  });
  it("refuses malformed input", () => {
    expect(parseCollisions("not json")).toBeNull();
    expect(parseCollisions("[]")).toBeNull();
    expect(parseCollisions(JSON.stringify([{ source: "email", sourceId: "x", overlapStart: "2026-01-01", overlapEnd: "2026-01-01" }]))).toBeNull();
    expect(parseCollisions(JSON.stringify([{ source: "booking", sourceId: "", overlapStart: "2026-01-01", overlapEnd: "2026-01-01" }]))).toBeNull();
    expect(parseCollisions(JSON.stringify([{ source: "booking", sourceId: "x", overlapStart: "yesterday", overlapEnd: "2026-01-01" }]))).toBeNull();
    expect(parseCollisions(JSON.stringify(Array.from({ length: 21 }, () => ({ source: "booking", sourceId: "x", overlapStart: "2026-01-01", overlapEnd: "2026-01-01" }))))).toBeNull();
  });
});
