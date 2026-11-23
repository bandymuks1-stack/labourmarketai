import { describe, expect, it } from "vitest";

import type { EvidenceRecordView } from "./import-core";
import { clientsOfRecords, isConfirmedRecord, summarizeWorkForClient } from "./work-for-client";

// SYNTHETIC ids only.
const SUB = "0a000000-0000-4000-8000-00000000000a"; // the subcontractor whose books hold the records
const CLIENT = "0b000000-0000-4000-8000-00000000000b";
const OTHER = "0c000000-0000-4000-8000-00000000000c";

type Facts = Parameters<typeof summarizeWorkForClient>[0][number];
const rec = (over: Partial<EvidenceRecordView>): Facts => ({
  organizationId: SUB,
  parties: [{ role: "client", organizationId: CLIENT, label: null }],
  withdrawn: false,
  superseded: false,
  state: "ORGANIZATION_REPORTED",
  hours: 8,
  activityDate: "2025-03-03",
  periodStart: null,
  periodEnd: null,
  ...over,
});

describe("summarizeWorkForClient: one aggregate, no names", () => {
  it("counts confirmed and unconfirmed apart and keeps period totals out of single days", () => {
    const work = summarizeWorkForClient([
      rec({ state: "CLIENT_ATTESTED" }),
      rec({ state: "SELF_ATTESTED", activityDate: "2025-04-01" }),
      rec({ activityDate: null, periodStart: "2025-01-01", periodEnd: "2025-01-31", hours: 160 }),
      rec({ withdrawn: true, hours: 99 }),
      rec({ superseded: true, hours: 99 }),
    ]);
    expect(work).toEqual({
      records: 3,
      confirmed: 1,
      unconfirmed: 2,
      dayHours: 16,
      periodHours: 160,
      firstDate: "2025-01-01",
      lastDate: "2025-04-01",
    });
    // The aggregate carries no person, place or partner field.
    expect(Object.keys(work!).sort()).toEqual(
      ["confirmed", "dayHours", "firstDate", "lastDate", "periodHours", "records", "unconfirmed"].sort(),
    );
  });

  it("is null when nothing live was done for the client", () => {
    expect(summarizeWorkForClient([])).toBeNull();
    expect(summarizeWorkForClient([rec({ withdrawn: true })])).toBeNull();
  });

  it("never counts a self-attestation as a confirmation", () => {
    expect(isConfirmedRecord({ state: "SELF_ATTESTED" })).toBe(false);
    expect(isConfirmedRecord({ state: "ORGANIZATION_ATTESTED" })).toBe(true);
    expect(isConfirmedRecord({ state: "INDEPENDENTLY_VERIFIED" })).toBe(true);
    expect(isConfirmedRecord({ state: "ORGANIZATION_REPORTED" })).toBe(false);
  });
});

describe("clientsOfRecords: whom the organization's own records were for", () => {
  it("counts each client once per record, own books only, most records first", () => {
    const clients = clientsOfRecords(
      [
        rec({}),
        rec({ parties: [{ role: "client", organizationId: CLIENT, label: null }, { role: "client", organizationId: CLIENT, label: null }] }),
        rec({ parties: [{ role: "client", organizationId: OTHER, label: null }] }),
        rec({ parties: [{ role: "employer", organizationId: OTHER, label: null }] }),
        rec({ organizationId: OTHER }),
        rec({ withdrawn: true }),
      ],
      SUB,
    );
    expect(clients).toEqual([
      { organizationId: CLIENT, records: 2 },
      { organizationId: OTHER, records: 1 },
    ]);
  });
});
