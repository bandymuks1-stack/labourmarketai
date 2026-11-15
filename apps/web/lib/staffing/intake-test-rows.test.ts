import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Our own test requests never raise a real number (owner 2026-11-14): the CRM
 * pipeline, launch readiness and the Agentai capability readback all use the
 * commercial feed's ONE predicate and agree with what the feed passes.
 */

// ── Mocks for the launch-readiness service (server-only, gated, service role) ──
let intakeRows: unknown[] = [];
let intakeReadFails = false;
const intakeRanges: Array<[number, number]> = [];

/** A service-role client: head counts answer 7, the intake table answers rows by range. */
function fakeClient() {
  return {
    rpc: () => Promise.resolve({ data: null, error: { message: "absent" } }),
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "not", "or"]) q[m] = () => q;
      q.range = (from: number, to: number) => {
        intakeRanges.push([from, to]);
        if (intakeReadFails) return Promise.resolve({ data: null, error: { message: "42501" } });
        return Promise.resolve({ data: intakeRows.slice(from, to + 1), error: null });
      };
      q.then = (done: (r: unknown) => unknown) =>
        done(table === "company_need_public_intakes" ? { count: 999, error: null } : { count: 7, error: null });
      return q;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/superadmin", () => ({ isSuperadmin: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));

import { getLaunchReadiness } from "@/lib/admin/launch-readiness";
import { CAPABILITY_READBACK_KEYS, buildCapabilityReadback, withRealIntakeCount } from "@/lib/api/capability-readback";
import { countItemsByStage, countItemsBySource, publicIntakeToItem, realPublicIntakes } from "@/lib/crm/pipeline-model";
import { feedPage, type CommercialRequestRow } from "@/lib/staffing/commercial-requests-feed";

import {
  INTAKE_COUNT_PAGE,
  countRealIntakesByStatus,
  countSyntheticIntakes,
  readIntakeCountRows,
  type IntakeCountRow,
} from "./intake-test-rows";

const RUN = "19400000001.1";
let seq = 0;
function intake(over: Partial<CommercialRequestRow> = {}): CommercialRequestRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    created_at: `2026-11-14T10:00:${String(seq % 60).padStart(2, "0")}.000000+00:00`,
    source_path: "/en/company-need",
    status: "new",
    company_name: "UAB Statyba",
    contact_name: "Jonas",
    contact_email: "pirkimai@statyba.lt",
    description: "Two tilers for a school.",
    ...over,
  };
}
/** The four kinds of test row the rule must catch, plus the walk itself. */
const markerOnly = (over: Partial<CommercialRequestRow> = {}) =>
  intake({ company_name: "[QA-SYNTHETIC] Gama", contact_name: null, ...over });
const mailboxOnly = (over: Partial<CommercialRequestRow> = {}) =>
  intake({ contact_email: "walk@example.invalid", contact_name: null, ...over });
const e2eMailbox = (over: Partial<CommercialRequestRow> = {}) =>
  intake({ contact_email: "run-1@e2e-proof.local", contact_name: null, ...over });
const walk = (over: Partial<CommercialRequestRow> = {}) =>
  intake({
    company_name: `QA-SYNTHETIC need walk ${RUN} (not a real company)`,
    contact_name: null,
    contact_email: `qa.synthetic.need.${RUN}@example.invalid`,
    description: "QA-SYNTHETIC production walk. Not a real need.",
    ...over,
  });

/** Real rows before AND after test rows, in every status a walk passes through. */
function mixed(): CommercialRequestRow[] {
  return [
    intake({ status: "new" }),
    walk({ status: "new" }),
    intake({ status: "contacted", company_name: "Test Building Ltd", contact_email: "jonas@testas.lt" }),
    markerOnly({ status: "contacted" }),
    mailboxOnly({ status: "qualified" }),
    e2eMailbox({ status: "new" }),
    walk({ status: "rejected" }),
    intake({ status: "qualified" }),
    intake({ status: "rejected" }),
    intake({ status: "converted" }),
  ];
}
/** Real rows are the ones built by `intake()` without a test override: contact "Jonas". */
const REAL_IDS = (rows: ReadonlyArray<{ id: string; contact_name?: string | null; contactName?: string | null }>) =>
  rows.filter((r) => (r.contact_name ?? r.contactName) === "Jonas").map((r) => r.id);

beforeEach(() => {
  intakeRows = [];
  intakeReadFails = false;
  intakeRanges.length = 0;
});

describe("the shared counts use the feed's one rule", () => {
  it("counts marker-only, example.invalid-only, e2e-mailbox and both-signal rows as test rows", () => {
    const rows = mixed();
    expect(countSyntheticIntakes(rows)).toBe(5);
    expect(countRealIntakesByStatus(rows)).toEqual({ new: 1, contacted: 1, qualified: 1, rejected: 1, converted: 1 });
  });

  it("agrees with the feed: the real count is exactly the items the feed passes", () => {
    const rows = mixed();
    const fed = feedPage(rows, 200).items.map((i) => i.id);
    expect(fed).toEqual(REAL_IDS(rows));
    expect(rows.length - countSyntheticIntakes(rows)).toBe(fed.length);
  });

  it("reads every page until a short one, oldest first", async () => {
    intakeRows = Array.from({ length: INTAKE_COUNT_PAGE + 3 }, () => intake());
    const rows = await readIntakeCountRows(fakeClient());
    expect(rows).toHaveLength(INTAKE_COUNT_PAGE + 3);
    expect(intakeRanges).toEqual([
      [0, INTAKE_COUNT_PAGE - 1],
      [INTAKE_COUNT_PAGE, 2 * INTAKE_COUNT_PAGE - 1],
    ]);
  });

  it("a failed read is null, never a partial list", async () => {
    intakeReadFails = true;
    expect(await readIntakeCountRows(fakeClient())).toBeNull();
    expect(await readIntakeCountRows({ from: () => { throw new Error("no key"); } })).toBeNull();
  });
});

describe("CRM pipeline: test rows sit in no stage or source count", () => {
  const asQueueRow = (r: CommercialRequestRow) => ({
    id: r.id,
    createdAt: r.created_at,
    status: r.status as "new",
    companyName: r.company_name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    description: r.description,
    country: "LT",
  });

  it("keeps only the real requests, in order, unchanged", () => {
    const rows = mixed().map(asQueueRow);
    const kept = realPublicIntakes(rows);
    expect(kept.map((r) => r.id)).toEqual(REAL_IDS(rows));
    expect(kept).toHaveLength(5);
    expect(kept.every((r) => rows.includes(r))).toBe(true);
  });

  it("stage and source counts are over real requests only", () => {
    const items = realPublicIntakes(mixed().map(asQueueRow)).map((r) => publicIntakeToItem(r));
    expect(countItemsByStage(items)).toEqual({
      new: 1,
      contacted: 1,
      qualifying: 1,
      follow_up: 0,
      active: 0,
      closed: 2,
    });
    expect(countItemsBySource(items).public_intake).toBe(5);
  });
});

describe("launch readiness: test rows never raise the intake numbers", () => {
  it("counts real requests per status over every row", async () => {
    intakeRows = mixed();
    const result = await getLaunchReadiness();
    if (result.kind !== "ok") throw new Error("expected ok");
    const r = result.readiness;
    expect([r.intakesNew, r.intakesContacted, r.intakesQualified, r.intakesRejected]).toEqual([1, 1, 1, 1]);
    // The other tiles still come from their own head counts.
    expect(r.workersTotal).toBe(7);
  });

  it("a status with only test rows is 0; a failed read is null for all four, never 0", async () => {
    intakeRows = [walk({ status: "rejected" }), markerOnly({ status: "qualified" })];
    const only = await getLaunchReadiness();
    if (only.kind !== "ok") throw new Error("expected ok");
    expect([only.readiness.intakesQualified, only.readiness.intakesRejected]).toEqual([0, 0]);

    intakeReadFails = true;
    const failed = await getLaunchReadiness();
    if (failed.kind !== "ok") throw new Error("expected ok");
    const f = failed.readiness;
    expect([f.intakesNew, f.intakesContacted, f.intakesQualified, f.intakesRejected]).toEqual([null, null, null, null]);
  });
});

describe("Agentai capability readback: the intake count is the real-request count", () => {
  const counted = buildCapabilityReadback(
    Object.fromEntries(CAPABILITY_READBACK_KEYS.map((k) => [k, k === "company_need_public_intakes" ? 10 : 3])),
    "2026-11-14T10:00:00.000Z",
  );

  it("equals what the feed passes, other counts untouched", () => {
    const rows = mixed();
    const body = withRealIntakeCount(counted, rows as IntakeCountRow[]);
    expect(body?.counts.company_need_public_intakes).toBe(feedPage(rows, 200).items.length);
    expect(body?.counts.company_need_public_intakes).toBe(5);
    expect(body?.counts.workers).toBe(3);
    expect(JSON.stringify(body)).not.toMatch(/statyba|example\.invalid|QA-SYNTHETIC/);
  });

  it("only test rows → 0; a failed intake read or a failed base read → null (503), never the raw count", () => {
    expect(withRealIntakeCount(counted, [walk(), mailboxOnly()])?.counts.company_need_public_intakes).toBe(0);
    expect(withRealIntakeCount(counted, null)).toBeNull();
    expect(withRealIntakeCount(null, mixed())).toBeNull();
  });
});
