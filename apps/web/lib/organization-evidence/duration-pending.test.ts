import { describe, expect, it } from "vitest";

import { deriveProfessionalExperience } from "@/lib/journal/professional-experience";
import { deriveWorkIntelligence } from "@/lib/journal/work-intelligence";
import { organizationLedgerFrom } from "@/lib/journal/work-intelligence-read";
import { readEvidenceRecordsForWorker } from "./worker-evidence-read";

/**
 * UNKNOWN IS NEVER ZERO — RECORDED WORK WITH NO STATED DURATION (SEP-7).
 *
 * NEGATIVE CONTROL: on the pre-change tree a committed organization record
 * with `hours = null` was dropped by the first line of the worker read
 * (`if (hours === null …) continue`), and the model and the one history then
 * filtered `hours > 0` again — a recorded work day whose length was not yet
 * stated never reached the Living CV at all. It must show as "duration to be
 * confirmed", and must still add NOTHING to any total (decision 0025).
 */

type Table = { data: unknown[] | null; error?: { code: string } | null };
function fakeClient(tables: Record<string, Table>) {
  const builder = (table: string) => {
    const t = tables[table] ?? { data: [] };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "range", "limit"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: t.error ? null : t.data, error: t.error ?? null });
    return b;
  };
  return { from: (table: string) => builder(table) } as never;
}

const rec = (over: Record<string, unknown>) => ({
  id: "r1",
  organization_id: "org1",
  organization_person_id: "p1",
  activity_date: "2025-03-04",
  period_start: null,
  period_end: null,
  hours: 8,
  evidence_state: "ORGANIZATION_REPORTED",
  derived: {},
  activity_kind: "work",
  context_label: null,
  work_object_id: null,
  project_id: null,
  supplied_by_organization_id: "org1",
  supplier_role: "employer",
  source_kind: "xlsx",
  row_origin: "parsed_file",
  imported_at: "2026-09-16T09:17:33Z",
  organization_people: { relationship_kind: "employee", linked_profile_id: "u1" },
  organization_evidence_events: [],
  organization_evidence_parties: [],
  ...over,
});

const linked = { data: [{ id: "p1" }] };

async function readFixture() {
  return readEvidenceRecordsForWorker(
    fakeClient({
      organization_people: linked,
      organization_evidence_records: {
        data: [
          rec({ id: "d8", activity_date: "2025-03-04", hours: 8 }),
          rec({ id: "dn1", activity_date: "2025-03-05", hours: null }),
          rec({ id: "dn2", activity_date: "2025-03-06", hours: null }),
          rec({ id: "pn", activity_date: null, period_start: "2025-04-01", period_end: "2025-04-30", hours: null }),
          rec({ id: "zero", activity_date: "2025-03-07", hours: 0 }),
          rec({
            id: "gone",
            activity_date: "2025-03-08",
            hours: null,
            organization_evidence_events: [
              { event_type: "withdrawn", actor_role: "employer", actor_profile_id: "m1", created_at: "2026-09-17T00:00:00Z" },
            ],
          }),
        ],
      },
      organizations: { data: [{ id: "org1", display_name: "Example Org", legal_name: null }] },
    }),
    "w1",
  );
}

describe("worker evidence read — a record with no stated duration is carried, not dropped", () => {
  it("null-hours records become pending rows; a stated 0 and a withdrawn record stay out", async () => {
    const out = await readFixture();
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.rows.map((r) => r.id)).toEqual(["d8"]);
    expect(out.periodRows).toEqual([]);
    expect((out.pendingRows ?? []).map((r) => r.id).sort()).toEqual(["dn1", "dn2", "pn"]);
    const span = out.pendingRows!.find((r) => r.id === "pn")!;
    expect(span).toMatchObject({ workDate: null, periodStart: "2025-04-01", periodEnd: "2025-04-30" });
    expect(out.pendingRows!.find((r) => r.id === "dn1")!.context.source.supplierName).toBe("Example Org");
  });
});

describe("model + one history — shown as 'duration to be confirmed', totals unchanged (decision 0025)", () => {
  it("the pending work reaches the professional history; no hour is added anywhere", async () => {
    const out = await readFixture();
    if (out.kind !== "ok") throw new Error("read failed");
    const ledger = organizationLedgerFrom({ kind: "needs-migration" }, out);
    expect(ledger.pendingRecords).toHaveLength(3);

    const base = {
      entries: [],
      skills: [],
      todayIso: "2026-10-30",
      focus: "all" as const,
      organizationRecords: ledger.records,
      organizationPeriodRecords: ledger.periodRecords,
    };
    const without = deriveWorkIntelligence(base);
    const withPending = deriveWorkIntelligence({ ...base, organizationPendingRecords: ledger.pendingRecords });
    expect(withPending.organizationPendingRecords).toHaveLength(3);
    // nothing in the model moves
    expect(withPending.periods).toEqual(without.periods);
    expect(withPending.organizationRecords).toEqual(without.organizationRecords);

    const expBefore = deriveProfessionalExperience({ wi: without, relationships: [] });
    const exp = deriveProfessionalExperience({ wi: withPending, relationships: [] });
    expect(exp.hours).toEqual(expBefore.hours);
    expect(exp.lines).toEqual(expBefore.lines);
    expect(exp.ledger.total).toBe(expBefore.ledger.total);
    expect(exp.hours?.total).toBe(8);

    expect(exp.durationPending).toHaveLength(1);
    expect(exp.durationPending[0]).toMatchObject({
      organizationId: "org1",
      organizationName: "Example Org",
      records: 3,
      days: 2,
      from: "2025-03-05",
      to: "2025-04-30",
      undated: 0,
    });
    expect(expBefore.durationPending).toEqual([]);
  });

  it("an unreadable organization ledger shows no pending work (unknown, not empty-and-fine)", () => {
    const wi = deriveWorkIntelligence({
      entries: [],
      skills: [],
      todayIso: "2026-10-30",
      organizationRecords: null,
      organizationPendingRecords: [
        { id: "x", organizationId: "org1", workDate: "2025-01-01", periodStart: null, periodEnd: null, source: "import" },
      ],
    });
    expect(wi.organizationPendingRecords).toBeNull();
    const exp = deriveProfessionalExperience({ wi, relationships: [] });
    expect(exp.durationPending).toEqual([]);
  });
});
