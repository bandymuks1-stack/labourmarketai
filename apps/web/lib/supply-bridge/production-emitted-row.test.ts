import { describe, expect, it } from "vitest";

import { emitSignals, serialiseSignal } from "@/lib/supply-bridge/first-party-supply-emitter";
import {
  decideMatchability,
  decidePublication,
  validateFirstPartySignal,
} from "@/lib/supply-bridge/__contract__/agentai-v1-consumer.vendored";

/**
 * The row production actually produced, pinned.
 *
 * Everything else in this directory tests the emitter against a fixture a
 * human wrote, which proves the emitter and proves nothing about the SQL. This
 * file closes that gap: the object below was copied VERBATIM out of
 * `public.first_party_supply_feed_v1()` running against the production database
 * on 2026-09-04, inside a transaction that was rolled back — see
 * docs/handoffs/FIRST_PARTY_SUPPLY_BRIDGE_V1.md for the run and the
 * zero-residue check. (The project ref is deliberately not written here:
 * single-domain-origin keeps raw Supabase hosts out of source.)
 *
 * The synthetic person behind it: MATCH consent granted at the current text
 * version, AVAILABLE_FROM 2026-10-01, legally able to work in LT/DE/NL, agreed
 * to be offered in DE only, contact permitted, publication and naming refused.
 *
 * If a later change to the SQL alters the shape, this test fails even though
 * every hand-written fixture still passes — which is the whole point of pinning
 * a real one.
 */
const PRODUCTION_EMITTED_ROW = {
  trades: ["carpenter"],
  actorRef: "lm:worker:c8b0e24b-0215-4576-86b3-0f3d588cec7c",
  signalId: "lm-sig-c8b0e24b-0215-4576-86b3-0f3d588cec7c",
  actorType: "WORKER",
  freshness: "CURRENT",
  geography: ["DE", "LT", "NL"],
  headcount: null,
  provenance: "FIRST_PARTY_REGISTERED",
  signalType: "WORKER_AVAILABILITY",
  authorities: {
    matchAuthority: "GRANTED",
    contactAuthority: "GRANTED",
    publicationAuthority: "DENIED",
    identityDisclosureAuthority: "DENIED",
  },
  currentState: "AVAILABLE_FROM",
  expiresAtIso: "2026-11-03T21:10:33.298Z",
  projectScope: "labourmarketai",
  schemaVersion: "agentai-first-party-market-signal/v1",
  verifiedAtIso: "2026-09-04T21:10:33.298Z",
  allowedMarkets: ["DE"],
  allowedChannels: [],
  availableFromIso: "2026-10-01",
  requirementSummary: null,
  evidenceCompleteness: null,
} as const;

describe("the row production emitted", () => {
  it("passes the emitter without a single rejection", () => {
    const result = emitSignals([PRODUCTION_EMITTED_ROW]);
    expect(result.rejected).toEqual([]);
    expect(result.signals).toHaveLength(1);
  });

  it("survives the consumer Agentai runs, field for field", () => {
    const signal = emitSignals([PRODUCTION_EMITTED_ROW]).signals[0]!;
    const parsed = validateFirstPartySignal(JSON.parse(serialiseSignal(signal)));
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(signal);
  });

  it("is matchable, and still cannot be named or published", () => {
    const signal = emitSignals([PRODUCTION_EMITTED_ROW]).signals[0]!;
    const parsed = validateFirstPartySignal(JSON.parse(serialiseSignal(signal)))!;

    expect(decideMatchability(parsed).allowed).toBe(true);

    const published = decidePublication(parsed, "telegram:LabourMarketAI", "DE");
    expect(published.allowed).toBe(false);
    expect(published.mayDiscloseIdentity).toBe(false);
    expect(published.refusals).toContain("NOT_PUBLISHABLE");
  });

  it("carries geography and allowedMarkets as two different answers", () => {
    // LT/DE/NL is where they may legally work; DE alone is where they agreed to
    // be offered. A consumer that used either alone would make a legal error in
    // one direction or a disclosure error in the other.
    const signal = emitSignals([PRODUCTION_EMITTED_ROW]).signals[0]!;
    expect(signal.geography).toEqual(["DE", "LT", "NL"]);
    expect(signal.allowedMarkets).toEqual(["DE"]);
    expect(signal.geography.length).toBeGreaterThan(signal.allowedMarkets.length);
  });

  it("says UNKNOWN about completeness rather than claiming zero", () => {
    // `workers.profile_completeness` is 0 for all 52 production workers because
    // nothing computes it yet. Null is "we did not measure"; 0.0 would be
    // "we measured nothing there", which is a different and false claim.
    const signal = emitSignals([PRODUCTION_EMITTED_ROW]).signals[0]!;
    expect(signal.evidenceCompleteness).toBeNull();
  });

  it("contains no identifying value anywhere in its serialised form", () => {
    const line = serialiseSignal(emitSignals([PRODUCTION_EMITTED_ROW]).signals[0]!);
    // The synthetic person's display name, email and profile id, none of which
    // may appear in the wire form under any key.
    for (const secret of [
      "PROOF A",
      "proof-a@example.invalid",
      "00000000-0000-4000-8000-00000000a001",
      "@",
    ]) {
      expect(line).not.toContain(secret);
    }
  });
});
