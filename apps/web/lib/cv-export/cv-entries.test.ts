import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { countClientAcceptedEntries, selectStandingConfirmations } from "./confirmation-standing";
import { cvLiveEntries } from "./cv-entries";

/**
 * C3 - the verified CV's proof rows and its "accepted by the client" count run
 * over LIVE, COUNTED-ONCE entries only.
 */
const entries = [
  { id: "live", deleted_at: null, superseded_by: null },
  { id: "deleted", deleted_at: "2026-10-01T00:00:00Z", superseded_by: null },
  { id: "superseded", deleted_at: null, superseded_by: "live" },
  { id: "orig", deleted_at: null, superseded_by: null }, // confirmed original (superseded_by stays NULL)
  { id: "corr", deleted_at: null, superseded_by: null, correction_of: "orig" },
];

const accept = (entry_id: string, at = "2026-10-04T10:00:00Z") => ({
  entry_id,
  created_at: at,
  confirmation_scope: { action: "client_accept", decision: "approved", authority: { basis: "counterparty" } },
});
const employer = (entry_id: string) => ({
  entry_id,
  created_at: "2026-10-03T10:00:00Z",
  confirmation_scope: { action: "confirm", decision: "approved", authority: { basis: "employer" } },
});

describe("cvLiveEntries", () => {
  it("drops deleted and superseded entries and replaces a corrected original by its live correction", () => {
    expect(cvLiveEntries(entries).map((e) => e.id)).toEqual(["live", "corr"]);
    expect(cvLiveEntries(null)).toEqual([]);
  });

  it("a client acceptance on a deleted, a superseded or a withdrawn (corrected) entry is NOT counted", () => {
    const confs = [accept("live"), accept("deleted"), accept("superseded"), accept("orig")];
    const ids = new Set(cvLiveEntries(entries).map((e) => e.id));
    const overLive = confs.filter((c) => ids.has(c.entry_id));
    expect(countClientAcceptedEntries(overLive)).toBe(1);
    // the unrestricted read (the old behaviour) would have counted 4
    expect(countClientAcceptedEntries(confs)).toBe(4);
  });

  it("an employer confirmation on a deleted / superseded / withdrawn entry is not printed as Confirmed Work Proof", () => {
    const confs = [employer("live"), employer("deleted"), employer("superseded"), employer("orig")];
    const ids = new Set(cvLiveEntries(entries).map((e) => e.id));
    const proof = selectStandingConfirmations(confs.filter((c) => ids.has(c.entry_id)));
    expect(proof.map((p) => p.entry_id)).toEqual(["live"]);
  });
});
