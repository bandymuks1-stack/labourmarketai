import { describe, expect, it } from "vitest";

import { MemoryEvidenceDb } from "./testing/memory-store";
import {
  attributeRecordsToPerformingOrganization,
  listRecordIdsAttributedTo,
} from "./import-core";

// SYNTHETIC ids only.
const ORG_A = "0a000000-0000-4000-8000-000000000001"; // the books that hold the records
const ORG_B = "0b000000-0000-4000-8000-000000000002"; // the performing company
const actor = {
  profileId: "0c000000-0000-4000-8000-000000000003",
  memberships: [{ organizationId: ORG_A, organizationName: "Org A", role: "owner" }],
  activeOrganizationId: ORG_A,
};

function seed(): MemoryEvidenceDb {
  const db = new MemoryEvidenceDb();
  for (const n of [1, 2, 3]) {
    db.tables.records.push({
      id: `rec-${n}`,
      organization_id: n === 3 ? ORG_B : ORG_A,
      record_fingerprint: `fp-${n}`,
      hours: 8,
    });
  }
  return db;
}

describe("attributeRecordsToPerformingOrganization — additive, idempotent, never moves a record", () => {
  it("writes one employer party row per visible record, in the RECORD's organization, created by the caller", async () => {
    const db = seed();
    const res = await attributeRecordsToPerformingOrganization(db.as(actor), {
      recordIds: ["rec-1", "rec-2"],
      performingOrganizationId: ORG_B,
    });
    expect(res).toMatchObject({ kind: "ok", attributed: 2, skipped: 0 });
    expect(db.tables.parties).toHaveLength(2);
    for (const p of db.tables.parties) {
      expect(p).toMatchObject({
        organization_id: ORG_A,
        party_role: "employer",
        party_organization_id: ORG_B,
        created_by: actor.profileId,
      });
    }
    // the records themselves are untouched
    expect(db.tables.records.map((r) => r.organization_id)).toEqual([ORG_A, ORG_A, ORG_B]);
    expect(db.tables.records.map((r) => r.record_fingerprint)).toEqual(["fp-1", "fp-2", "fp-3"]);
  });

  it("is idempotent and skips a record already stored in the performing organization", async () => {
    const db = seed();
    const first = await attributeRecordsToPerformingOrganization(db.as(actor), {
      recordIds: ["rec-1", "rec-3"],
      performingOrganizationId: ORG_B,
    });
    expect(first).toMatchObject({ attributed: 1, skipped: 1 }); // rec-3 already lives in B
    const again = await attributeRecordsToPerformingOrganization(db.as(actor), {
      recordIds: ["rec-1", "rec-3"],
      performingOrganizationId: ORG_B,
    });
    expect(again).toMatchObject({ attributed: 0, skipped: 2 });
    expect(db.tables.parties).toHaveLength(1);
  });

  it("lists the records that name an organization, and refuses bad input", async () => {
    const db = seed();
    await attributeRecordsToPerformingOrganization(db.as(actor), {
      recordIds: ["rec-1", "rec-2"],
      performingOrganizationId: ORG_B,
      label: "stated share",
    });
    const listed = await listRecordIdsAttributedTo(db.as(actor), ORG_B);
    expect(listed).toMatchObject({ kind: "ok" });
    expect([...(listed as unknown as { recordIds: string[] }).recordIds].sort()).toEqual(["rec-1", "rec-2"]);
    expect(
      await attributeRecordsToPerformingOrganization(db.as(actor), {
        recordIds: ["rec-1"],
        performingOrganizationId: ORG_B,
        role: "client" as never,
      }),
    ).toMatchObject({ kind: "invalid" });
    expect(
      await attributeRecordsToPerformingOrganization(db.as(actor), {
        recordIds: ["rec-1"],
        performingOrganizationId: ORG_B,
        label: "x".repeat(201),
      }),
    ).toMatchObject({ kind: "invalid" });
    expect(
      await attributeRecordsToPerformingOrganization(db.as(actor), { recordIds: [], performingOrganizationId: ORG_B }),
    ).toMatchObject({ kind: "ok", attributed: 0 });
    expect(
      await attributeRecordsToPerformingOrganization(db.as(actor), { recordIds: ["nope"], performingOrganizationId: ORG_B }),
    ).toMatchObject({ kind: "invalid" });
  });
});
