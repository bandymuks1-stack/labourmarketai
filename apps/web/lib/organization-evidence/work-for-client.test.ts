import { describe, expect, it } from "vitest";

import type { EvidenceRecordView } from "./import-core";
import { clientsOfRecords, isConfirmedRecord, summarizeWorkForClient } from "./work-for-client";

// SYNTHETIC ids only.
const SUB = "0a000000-0000-4000-8000-00000000000a"; // the subcontractor whose books hold the records
const CLIENT = "0b000000-0000-4000-8000-00000000000b";
const OTHER = "0c000000-0000-4000-8000-00000000000c";

type Facts = Parameters<typeof summarizeWorkForClient>[0][number];
let seq = 0;
const rec = (over: Partial<EvidenceRecordView>): Facts => ({
  id: `r${++seq}`,
  personId: "p1",
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
  it("counts confirmed and unconfirmed apart and every hour once (one total)", () => {
    const work = summarizeWorkForClient([
      rec({ state: "CLIENT_ATTESTED" }),
      rec({ state: "SELF_ATTESTED", activityDate: "2025-04-01" }),
      // The only account of January: counted.
      rec({ activityDate: null, periodStart: "2025-01-01", periodEnd: "2025-01-31", hours: 160 }),
      rec({ withdrawn: true, hours: 99 }),
      rec({ superseded: true, hours: 99 }),
    ]);
    expect(work).toEqual({
      records: 3,
      confirmed: 1,
      unconfirmed: 2,
      hours: 176,
      firstDate: "2025-01-01",
      lastDate: "2025-04-01",
    });
    // The aggregate carries no person, place or partner field.
    expect(Object.keys(work!).sort()).toEqual(
      ["confirmed", "firstDate", "hours", "lastDate", "records", "unconfirmed"].sort(),
    );
  });

  it("a period total over days already recorded for the same person is not added again", () => {
    const work = summarizeWorkForClient([
      rec({ activityDate: "2025-03-03", hours: 8 }),
      rec({ activityDate: "2025-03-04", hours: 8 }),
      rec({ activityDate: null, periodStart: "2025-03-01", periodEnd: "2025-03-31", hours: 16 }),
      // Another person's period over the same month is that person's only account.
      rec({ personId: "p2", activityDate: null, periodStart: "2025-03-01", periodEnd: "2025-03-31", hours: 40 }),
    ]);
    expect(work?.hours).toBe(56);
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
      { organizationId: CLIENT, records: 2, label: null },
      { organizationId: OTHER, records: 1, label: null },
    ]);
  });

  it("keeps the name the records give the client, for a reader who cannot read the client itself", () => {
    const clients = clientsOfRecords(
      [rec({ parties: [{ role: "client", organizationId: CLIENT, label: " Synthetic Client Ltd " }] }), rec({})],
      SUB,
    );
    expect(clients).toEqual([{ organizationId: CLIENT, records: 2, label: "Synthetic Client Ltd" }]);
  });
});
