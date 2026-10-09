import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { historicalPersonIntelligence } from "@/lib/journal/work-intelligence-read";
import { buildCvOrganizationHistory } from "@/lib/cv-export/organization-history";
import { orgLedger } from "@/lib/journal/work-in-numbers-view";
import { readEvidenceRecordsForWorker } from "@/lib/organization-evidence/worker-evidence-read";
import { organizationAllTime } from "./organization-all-time";

/**
 * #2169 (owner correction 2026-10-09): imported historical work is recognised
 * from the canonical record ALONE — dates, hours, attribution, provenance. No
 * invoice, payment or settlement is required or consulted.
 *
 * The fixture is the production record read back under the person's own RLS
 * on 2026-10-09 (ids replaced): one period aggregate, 800 h over
 * 2025-06-01..2025-11-30, organization-reported, attested by the employer,
 * no invoice anywhere. It runs through the canonical readers end to end.
 */

type Table = { data: unknown; error?: { code: string } | null };
function fake(tables: Record<string, Table>) {
  return {
    from: (table: string) => {
      const t = tables[table] ?? { data: [] };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "limit", "not", "eq"]) b[m] = () => b;
      b.maybeSingle = () =>
        Promise.resolve({ data: Array.isArray(t.data) ? (t.data[0] ?? null) : t.data, error: t.error ?? null });
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: t.error ? null : t.data, error: t.error ?? null });
      return b;
    },
  } as never;
}

const PRODUCTION_PERIOD_RECORD = {
  id: "rec-800",
  hours: 800,
  derived: {
    calendarWeek: { value: 47, method: "iso_week_of_explicit_date", confidence: 1 },
    timeSemantics: {
      note: "month",
      value: "period_aggregate",
      method: "human_choice",
      remote: true,
      periodEnd: "2025-11-30",
      confidence: 1,
      periodStart: "2025-06-01",
      sourceHours: 800,
    },
    hoursPlausibility: { value: 800, method: "hours_exceed_day", confidence: 1 },
  },
  period_end: "2025-11-30",
  period_start: "2025-06-01",
  activity_date: null,
  project_id: null,
  row_origin: null,
  imported_at: "2026-09-17T15:15:29.922+00:00",
  source_kind: "csv",
  activity_kind: "work",
  context_label: "Administraciniai/koordinavimo darbai",
  supplier_role: "employer",
  evidence_state: "ORGANIZATION_REPORTED",
  work_object_id: null,
  organization_id: "org-1",
  organization_people: { linked_profile_id: "profile-1", relationship_kind: "employee" },
  organization_person_id: "person-1",
  supplied_by_organization_id: "org-1",
  organization_evidence_events: [
    { actor_role: "employer", created_at: "2026-09-17T17:01:12Z", event_type: "attested", actor_profile_id: "profile-1" },
  ],
  organization_evidence_parties: [],
};

const TODAY = { todayIso: "2026-10-09", horizonIso: "2026-10-09" } as never;

async function readFor(records: unknown[]) {
  const client = fake({
    organization_people: { data: [{ id: "person-1" }] },
    organization_evidence_records: { data: records },
  });
  const ev = await readEvidenceRecordsForWorker(client, "worker-1");
  return { ev, wi: historicalPersonIntelligence(ev, TODAY, { focus: "all" }) };
}

describe("historical work is recognised from the record alone (#2169)", () => {
  it("the production 800 h period record reaches every surface", async () => {
    const { ev, wi } = await readFor([PRODUCTION_PERIOD_RECORD]);
    // Evidence read (the canonical reader).
    expect(ev.kind).toBe("ok");
    if (ev.kind !== "ok") return;
    expect(ev.periodRows).toHaveLength(1);
    expect(ev.periodRows[0]).toMatchObject({ periodStart: "2025-06-01", periodEnd: "2025-11-30", hours: 800 });

    // Work Intelligence / Work Journal ledger: the period line, never split onto days.
    expect(wi?.organizationPeriodRecords?.map((p) => p.hours)).toEqual([800]);
    for (const p of wi?.organizationRecords ?? []) expect(p.hours).toBe(0);
    const ledger = orgLedger(wi!);
    expect(ledger.kind).toBe("rows");

    // All-time professional experience: the 800 h COUNT.
    const allTime = organizationAllTime(wi);
    expect(allTime).toMatchObject({
      dayHours: 0,
      periodHours: 800,
      periodRecords: 1,
      totalHours: 800,
      importedHours: 800,
      approvedHours: 0,
      from: "2025-06-01",
      to: "2025-11-30",
    });
    expect(allTime?.overlapping).toEqual([]);

    // Living CV professional history.
    const cv = buildCvOrganizationHistory(wi?.organizationContextRecords ?? [], wi?.organizationPeriodRecords ?? []);
    expect(cv).toHaveLength(1);
    expect(cv[0]).toMatchObject({ periodHours: 800, periodRecords: 1, from: "2025-06-01", to: "2025-11-30" });
  });

  it("recorded is not confirmed: the attestation stays a separate fact, nothing is upgraded", async () => {
    const { wi } = await readFor([PRODUCTION_PERIOD_RECORD]);
    const allTime = organizationAllTime(wi)!;
    // Day-record approvals are the only "approved" figure; a period record never becomes one.
    expect(allTime.approvedHours).toBe(0);
    const cv = buildCvOrganizationHistory(wi?.organizationContextRecords ?? [], wi?.organizationPeriodRecords ?? []);
    expect(cv[0].proof).not.toContain("INDEPENDENTLY_VERIFIED");
    expect(cv[0].proof).not.toContain("CLIENT_ACCEPTED");
  });

  it("a period over days the same organization already recorded is listed, not double-counted", async () => {
    const day = {
      ...PRODUCTION_PERIOD_RECORD,
      id: "rec-day",
      hours: 8,
      activity_date: "2025-07-01",
      period_start: null,
      period_end: null,
      derived: {},
    };
    const { wi } = await readFor([PRODUCTION_PERIOD_RECORD, day]);
    const allTime = organizationAllTime(wi)!;
    expect(allTime.dayHours).toBe(8);
    expect(allTime.periodHours).toBe(0);
    expect(allTime.totalHours).toBe(8);
    expect(allTime.overlapping.map((p) => p.hours)).toEqual([800]);
  });

  it("an unreadable ledger is UNKNOWN, never zero", async () => {
    const client = fake({ organization_people: { data: null, error: { code: "XX000" } } });
    const ev = await readEvidenceRecordsForWorker(client, "worker-1");
    expect(organizationAllTime(historicalPersonIntelligence(ev, TODAY))).toBeNull();
  });
});

describe("no invoice or payment dependency in historical-work recognition", () => {
  const APP = join(__dirname, "..", "..");
  const files = [
    "lib/journal/organization-all-time.ts",
    "lib/journal/work-intelligence-read.ts",
    "lib/organization-evidence/worker-evidence-read.ts",
    "lib/organization-evidence/history-signals-read.ts",
    "lib/cv-export/organization-history.ts",
  ];
  for (const f of files) {
    it(`${f} reads no invoice, payment or finance record`, () => {
      const src = readFileSync(join(APP, f), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(src).not.toMatch(/finance_records|invoice|lmc_transactions|payment|paid_at|settlement/i);
    });
  }
});
