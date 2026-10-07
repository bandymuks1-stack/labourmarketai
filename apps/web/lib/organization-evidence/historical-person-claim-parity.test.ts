import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  historicalPersonIntelligence,
  organizationLedgerFrom,
} from "@/lib/journal/work-intelligence-read";
import { buildCvOrganizationHistory } from "@/lib/cv-export/organization-history";
import { readSignalsForRosterPeople, readSignalsForWorkers } from "./history-signals-read";
import {
  readEvidenceRecordsForOrganizationPerson,
  readEvidenceRecordsForWorker,
} from "./worker-evidence-read";

/**
 * DECISION 0020 (owner 2026-10-07): organization-provided history forms the
 * person's profile BEFORE any claim, and claiming later changes WHICH KEY
 * finds the rows - never which rows count. These tests run the same rows
 * through both doors (roster-person key, linked-worker key) and require
 * identical counts, hours, signals and CV entries.
 */

type Table = { data: unknown; error?: { code: string } | null };

function fake(tables: Record<string, Table>) {
  const client = {
    from: (table: string) => {
      const t = tables[table] ?? { data: [] };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "limit", "not", "eq"]) b[m] = () => b;
      b.maybeSingle = () =>
        Promise.resolve({
          data: Array.isArray(t.data) ? (t.data[0] ?? null) : t.data,
          error: t.error ?? null,
        });
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: t.error ? null : t.data, error: t.error ?? null });
      return b;
    },
  };
  return client as never;
}

const dayRow = {
  id: "r1",
  organization_id: "o1",
  organization_person_id: "p1",
  activity_date: "2026-03-02",
  period_start: null,
  period_end: null,
  hours: 8,
  evidence_state: "ORGANIZATION_REPORTED",
  derived: {},
  activity_kind: null,
  context_label: "Site A",
  work_object_id: null,
  project_id: null,
  supplied_by_organization_id: "o1",
  supplier_role: "employer",
  source_kind: "xlsx",
  row_origin: "source",
  imported_at: "2026-09-01T00:00:00Z",
  organization_people: { relationship_kind: "employee", linked_profile_id: null },
  organization_evidence_events: [],
  organization_evidence_parties: [],
};
const periodRow = {
  ...dayRow,
  id: "r2",
  activity_date: null,
  period_start: "2025-06-01",
  period_end: "2025-11-30",
  hours: 800,
};
const withdrawnRow = {
  ...dayRow,
  id: "r3",
  organization_evidence_events: [
    { event_type: "withdrawn", actor_role: "employer", actor_profile_id: "m1", created_at: "2026-09-17T00:00:00Z" },
  ],
};
const records = { data: [dayRow, periodRow, withdrawnRow] };

const unclaimed = fake({
  organization_people: { data: [{ id: "p1" }] },
  organization_evidence_records: records,
});
const claimed = fake({
  // the same roster row, now linked to the person's account
  organization_people: { data: [{ id: "p1" }] },
  organization_evidence_records: records,
});

const today = { todayIso: "2026-10-07", horizonIso: "2026-10-07" } as never;

describe("historical person: identical before and after claim", () => {
  it("the unclaimed door and the claimed door read the same rows", async () => {
    const a = await readEvidenceRecordsForOrganizationPerson(unclaimed, { organizationId: "o1", personId: "p1" });
    const b = await readEvidenceRecordsForWorker(claimed, "w1");
    expect(a.kind).toBe("ok");
    expect(b).toEqual(a);
    if (a.kind !== "ok") return;
    // withdrawn counts nowhere; one day row, one period row
    expect(a.rows.map((r) => r.id)).toEqual(["r1"]);
    expect(a.periodRows.map((r) => r.id)).toEqual(["r2"]);
  });

  it("Work Intelligence figures are identical before and after claim", async () => {
    const before = await readEvidenceRecordsForOrganizationPerson(unclaimed, { organizationId: "o1", personId: "p1" });
    const after = await readEvidenceRecordsForWorker(claimed, "w1");
    const wiBefore = historicalPersonIntelligence(before, today)!;
    const wiAfter = historicalPersonIntelligence(after, today)!;
    expect(wiBefore).not.toBeNull();
    expect(wiAfter).toEqual(wiBefore);
    const all = wiBefore.organizationRecords!.find((p) => p.key === "all")!;
    expect(all.hours).toBe(8);
    expect(wiBefore.organizationPeriodRecords!).toHaveLength(1);
    expect(wiBefore.organizationPeriodRecords![0]!.hours).toBe(800);
    // the period total is never summed into the day ledger
    expect(wiBefore.totalHours).toBe(0);
  });

  it("the Living CV organization history is identical before and after claim", async () => {
    const ledgerOf = async (c: never, claimedDoor: boolean) => {
      const ev = claimedDoor
        ? await readEvidenceRecordsForWorker(c, "w1")
        : await readEvidenceRecordsForOrganizationPerson(c, { organizationId: "o1", personId: "p1" });
      if (ev.kind === "error") throw new Error("read failed");
      const l = organizationLedgerFrom({ kind: "needs-migration" }, ev);
      return buildCvOrganizationHistory(l.records, l.periodRecords);
    };
    const before = await ledgerOf(unclaimed, false);
    const after = await ledgerOf(claimed, true);
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
    // provenance is never upgraded: no verification concept appears
    for (const e of before) expect(e.proof).not.toContain("INDEPENDENTLY_VERIFIED");
  });

  it("a failed ledger read is UNKNOWN (null), never an empty picture", async () => {
    const failing = fake({
      organization_people: { data: [{ id: "p1" }] },
      organization_evidence_records: { data: null, error: { code: "XX000" } },
    });
    const ev = await readEvidenceRecordsForOrganizationPerson(failing, { organizationId: "o1", personId: "p1" });
    expect(ev.kind).toBe("error");
    expect(historicalPersonIntelligence(ev, today)).toBeNull();
  });

  it("a person id from another organization yields an empty ledger, not data", async () => {
    const other = fake({
      organization_people: { data: [] },
      organization_evidence_records: records,
    });
    const ev = await readEvidenceRecordsForOrganizationPerson(other, { organizationId: "o2", personId: "p1" });
    expect(ev).toEqual({ kind: "ok", rows: [], periodRows: [] });
  });
});

describe("historical person signals: identical before and after claim", () => {
  const people = { data: [{ id: "p1", linked_worker_id: "w1" }] };
  const recs = {
    data: [
      {
        id: "r1",
        organization_person_id: "p1",
        evidence_state: "ORGANIZATION_REPORTED",
        organization_people: { linked_profile_id: null },
        organization_evidence_events: [],
      },
    ],
  };
  const sigs = { data: [{ record_id: "r1", skill_slug: "tiling" }] };
  const client = fake({
    organization_people: people,
    organization_evidence_records: recs,
    organization_evidence_competency_signals: sigs,
  });

  it("the roster door and the worker door count the same signals", async () => {
    const roster = await readSignalsForRosterPeople(client, ["p1"]);
    const worker = await readSignalsForWorkers(client, ["w1"]);
    expect(roster.kind === "ok" && worker.kind === "ok").toBe(true);
    if (roster.kind !== "ok" || worker.kind !== "ok") return;
    expect(roster.byPerson.get("p1")).toEqual(worker.byWorker.get("w1"));
    expect(roster.byPerson.get("p1")).toEqual([
      { slug: "tiling", records: 1, provenance: "organization_provided" },
    ]);
  });

  it("a roster person with no skill-naming history is ABSENT (unknown), not an empty list", async () => {
    const out = await readSignalsForRosterPeople(
      fake({ organization_evidence_records: { data: [] } }),
      ["p9"],
    );
    expect(out.kind === "ok" && out.byPerson.has("p9")).toBe(false);
  });
});
