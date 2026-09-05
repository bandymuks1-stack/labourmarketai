import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_IDENTITY_KEYS,
  V1_AUTHORITY_KEYS,
  V1_SIGNAL_KEYS,
} from "@/lib/supply-bridge/first-party-signal-contract";
import {
  buildFeedBody,
  emitSignals,
  serialiseSignal,
  validateEmittedRow,
} from "@/lib/supply-bridge/first-party-supply-emitter";
import {
  decideMatchability,
  decidePublication,
  validateFirstPartySignal,
} from "@/lib/supply-bridge/__contract__/agentai-v1-consumer.vendored";

/**
 * The contract tests for the first-party supply bridge.
 *
 * `row()` below is the shape `public.first_party_supply_feed_v1()` produces,
 * transcribed field for field from its `jsonb_build_object` call. That is the
 * seam these tests actually defend: the SQL builds the row, the emitter decides
 * whether to write it, and the VENDORED consumer — the real code Agentai runs —
 * decides what it means. A change on any of the three that the other two do not
 * expect fails here.
 */

/** One row exactly as the feed RPC emits it: a matchable worker, identity denied. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "agentai-first-party-market-signal/v1",
    signalId: "lm-sig-1a2b3c4d-0000-4000-8000-000000000001",
    signalType: "WORKER_AVAILABILITY",
    actorType: "WORKER",
    actorRef: "lm:worker:1a2b3c4d-0000-4000-8000-000000000001",
    projectScope: "labourmarketai",
    currentState: "AVAILABLE_FROM",
    freshness: "CURRENT",
    geography: ["DE", "NL"],
    allowedMarkets: ["DE"],
    trades: ["carpenter", "concrete worker"],
    availableFromIso: "2026-10-01",
    headcount: null,
    requirementSummary: null,
    evidenceCompleteness: null,
    verifiedAtIso: "2026-09-04T00:00:00.000Z",
    expiresAtIso: "2026-11-03T00:00:00.000Z",
    authorities: {
      matchAuthority: "GRANTED",
      contactAuthority: "GRANTED",
      publicationAuthority: "DENIED",
      identityDisclosureAuthority: "DENIED",
    },
    allowedChannels: [],
    provenance: "FIRST_PARTY_REGISTERED",
    ...overrides,
  };
}

describe("the emitted row is the v1 shape and nothing else", () => {
  it("carries exactly the twenty v1 keys — no more, no fewer", () => {
    expect(Object.keys(row()).sort()).toEqual([...V1_SIGNAL_KEYS].sort());
  });

  it("carries exactly the four authorities", () => {
    const authorities = row()["authorities"] as Record<string, unknown>;
    expect(Object.keys(authorities).sort()).toEqual([...V1_AUTHORITY_KEYS].sort());
  });

  it("has no field that could ever hold an identity", () => {
    for (const forbidden of FORBIDDEN_IDENTITY_KEYS) {
      expect(Object.keys(row())).not.toContain(forbidden);
    }
  });

  it("rejects a row that grew a name, rather than emitting it", () => {
    const result = validateEmittedRow(row({ full_name: "Jonas Jonaitis" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("forbidden-identity-key");
  });

  it("rejects a row that grew any unknown key", () => {
    // An extra key is not harmless: the consumer's validator rebuilds the
    // object from the keys it knows, so the field would vanish in silence and
    // this end would believe it had sent something.
    const result = validateEmittedRow(row({ certificateFiles: ["a1.pdf"] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("unknown-key");
  });

  it("rejects a row that lost a key", () => {
    const partial = row();
    delete partial["allowedChannels"];
    const result = validateEmittedRow(partial);
    expect(result.ok).toBe(false);
  });

  it("serialises with a stable key order, so two unchanged rebuilds are identical", () => {
    const a = validateEmittedRow(row());
    const b = validateEmittedRow({ provenance: "FIRST_PARTY_REGISTERED", ...row() });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(serialiseSignal(a.signal)).toBe(serialiseSignal(b.signal));
      expect(serialiseSignal(a.signal).startsWith('{"schemaVersion":')).toBe(true);
    }
  });
});

describe("default deny — no authority is ever inferred", () => {
  it("MATCH denied: the person is absent from the feed entirely", () => {
    const denied = row({
      authorities: {
        matchAuthority: "DENIED",
        contactAuthority: "GRANTED",
        publicationAuthority: "GRANTED",
        identityDisclosureAuthority: "GRANTED",
      },
    });
    const result = emitSignals([denied]);
    expect(result.signals).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("match-authority-not-granted");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["boolean true", true],
    ["lower-case granted", "granted"],
    ["yes", "yes"],
    ["empty string", ""],
  ])("a matchAuthority of %s is a denial, not a grant", (_label, value) => {
    const result = emitSignals([
      row({
        authorities: {
          matchAuthority: value,
          contactAuthority: "GRANTED",
          publicationAuthority: "GRANTED",
          identityDisclosureAuthority: "GRANTED",
        },
      }),
    ]);
    expect(result.signals).toHaveLength(0);
  });

  it("MATCH granted with IDENTITY denied: matchable, and still not nameable", () => {
    const result = emitSignals([row()]);
    expect(result.signals).toHaveLength(1);

    const signal = validateFirstPartySignal(JSON.parse(serialiseSignal(result.signals[0]!)));
    expect(signal).not.toBeNull();
    expect(decideMatchability(signal!).allowed).toBe(true);
    expect(signal!.authorities.identityDisclosureAuthority).toBe("DENIED");

    // Publication is refused for two independent reasons, and BOTH are
    // reported: an owner fixing consent settings needs the whole list, not the
    // first one the code happened to hit.
    const publication = decidePublication(signal!, "telegram:LabourMarketAI", "DE");
    expect(publication.allowed).toBe(false);
    expect(publication.mayDiscloseIdentity).toBe(false);
    expect(publication.refusals).toContain("NOT_PUBLISHABLE");
    expect(publication.refusals).toContain("CHANNEL_NOT_ALLOWED");
  });

  it("CONTACT and PUBLICATION are respected independently of MATCH", () => {
    const contactOnly = emitSignals([
      row({
        authorities: {
          matchAuthority: "GRANTED",
          contactAuthority: "GRANTED",
          publicationAuthority: "DENIED",
          identityDisclosureAuthority: "DENIED",
        },
      }),
    ]).signals[0]!;
    expect(contactOnly.authorities.contactAuthority).toBe("GRANTED");
    expect(contactOnly.authorities.publicationAuthority).toBe("DENIED");

    const publishOnly = emitSignals([
      row({
        authorities: {
          matchAuthority: "GRANTED",
          contactAuthority: "DENIED",
          publicationAuthority: "GRANTED",
          identityDisclosureAuthority: "DENIED",
        },
        allowedChannels: ["telegram:LabourMarketAI"],
      }),
    ]).signals[0]!;
    expect(publishOnly.authorities.contactAuthority).toBe("DENIED");

    // Publishable as an aggregate, and still not nameable — the case the
    // contract exists for: a worker whose current employer reads the channel.
    const parsed = validateFirstPartySignal(JSON.parse(serialiseSignal(publishOnly)))!;
    const decision = decidePublication(parsed, "telegram:LabourMarketAI", "DE");
    expect(decision.allowed).toBe(true);
    expect(decision.mayDiscloseIdentity).toBe(false);
  });

  it("an empty allowedMarkets list is empty, never 'all markets'", () => {
    const signal = emitSignals([row({ allowedMarkets: [] })]).signals[0]!;
    const parsed = validateFirstPartySignal(JSON.parse(serialiseSignal(signal)))!;
    expect(
      decidePublication(parsed, "telegram:LabourMarketAI", "DE").refusals,
    ).toContain("MARKET_NOT_ALLOWED");
  });
});

describe("freshness — expired and withdrawn supply is never exported as current", () => {
  it("drops an EXPIRED row", () => {
    const result = emitSignals([row({ freshness: "EXPIRED" })]);
    expect(result.signals).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("not-current-supply");
  });

  it("drops a WITHDRAWN row", () => {
    const result = emitSignals([row({ freshness: "WITHDRAWN" })]);
    expect(result.signals).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("not-current-supply");
  });

  it("keeps an AGEING row — the consumer decays it rather than dropping it", () => {
    const result = emitSignals([row({ freshness: "AGEING" })]);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.freshness).toBe("AGEING");
  });

  it("rejects a freshness value neither side knows", () => {
    const result = emitSignals([row({ freshness: "PROBABLY_FINE" })]);
    expect(result.rejected[0]?.reason).toBe("unknown-freshness");
  });
});

describe("missing data becomes UNKNOWN, never a fabricated value", () => {
  it("an unmeasured completeness is null, not 0", () => {
    // 0.0 would claim a measurement of zero. Null says the product did not
    // report one, and the consumer treats null as neutral rather than punitive.
    const signal = emitSignals([row({ evidenceCompleteness: null })]).signals[0]!;
    expect(signal.evidenceCompleteness).toBeNull();
    expect(serialiseSignal(signal)).toContain('"evidenceCompleteness":null');
  });

  it("an unstated headcount is null, not 0", () => {
    const signal = emitSignals([row({ headcount: null })]).signals[0]!;
    expect(signal.headcount).toBeNull();
  });

  it("an unstated start date is null, not today", () => {
    const signal = emitSignals([
      row({ currentState: "OPEN_TO_OFFERS", availableFromIso: null }),
    ]).signals[0]!;
    expect(signal.availableFromIso).toBeNull();
  });

  it("refuses a completeness outside 0..1 rather than clamping it", () => {
    expect(emitSignals([row({ evidenceCompleteness: 80 })]).rejected[0]?.reason)
      .toBe("bad-completeness");
  });

  it("refuses a country that is not an ISO-3166-1 alpha-2 code", () => {
    expect(emitSignals([row({ geography: ["Germany"] })]).rejected[0]?.reason)
      .toBe("bad-country-code");
  });
});

describe("a stated availability and a profile are different claims", () => {
  it.each([
    "AVAILABLE_NOW",
    "AVAILABLE_FROM",
    "OPEN_TO_OFFERS",
    "LOOKING_FOR_WORK",
    "LOOKING_FOR_PROJECTS",
  ])("emits the canonical intent state %s unchanged", (state) => {
    const signal = emitSignals([
      row({ currentState: state, availableFromIso: state === "AVAILABLE_FROM" ? "2026-10-01" : null }),
    ]).signals[0]!;
    expect(signal.currentState).toBe(state);
    // The consumer maps LOOKING_* to JOB_SEEKER_PROFILE (POTENTIAL only) and
    // AVAILABLE_* to AVAILABLE_WORKER (LIKELY-eligible). Emitting the state
    // verbatim is what lets it keep them apart.
    expect(validateFirstPartySignal(JSON.parse(serialiseSignal(signal)))).not.toBeNull();
  });

  it("refuses an intent state the contract does not define", () => {
    expect(emitSignals([row({ currentState: "MAYBE_LATER" })]).rejected[0]?.reason)
      .toBe("unknown-intent-state");
  });
});

describe("provenance cannot be claimed by the row", () => {
  it("forces FIRST_PARTY_REGISTERED even when the row says otherwise", () => {
    // A mislabelled external import must not be able to claim the first-party
    // confidence advantage by writing it into its own provenance field.
    const signal = emitSignals([row({ provenance: "EXTERNAL_DISCOVERED" })]).signals[0]!;
    expect(signal.provenance).toBe("FIRST_PARTY_REGISTERED");
  });
});

describe("UNKNOWN and ZERO are different answers", () => {
  it("a successful read of nobody produces an EMPTY FILE — a measured zero", () => {
    const build = buildFeedBody({ kind: "read", rows: [] });
    expect(build.body).toBe("");
    expect(build.unavailableReason).toBeNull();
    expect(build.emitted?.signals).toHaveLength(0);
  });

  it("a failed read produces NO FILE — 'we did not look'", () => {
    const build = buildFeedBody({ kind: "unavailable", reason: "rpc timed out" });
    expect(build.body).toBeNull();
    expect(build.emitted).toBeNull();
    expect(build.unavailableReason).toBe("rpc timed out");
  });

  it("a read whose every row was rejected is still a measured zero, not an outage", () => {
    // The read succeeded; we simply hold nobody the contract can carry. That is
    // a real answer about our supply, and the file must state it.
    const build = buildFeedBody({ kind: "read", rows: [row({ freshness: "EXPIRED" })] });
    expect(build.body).toBe("");
    expect(build.emitted?.rejected).toHaveLength(1);
  });
});

describe("every emitted row survives the consumer Agentai actually runs", () => {
  it("round-trips through validateFirstPartySignal with no field lost or altered", () => {
    const emitted = emitSignals([
      row(),
      row({
        signalId: "lm-sig-2",
        actorRef: "lm:team:2",
        actorType: "TEAM",
        headcount: 5,
        currentState: "AVAILABLE_NOW",
        availableFromIso: null,
        evidenceCompleteness: 0.8,
        allowedChannels: ["telegram:LabourMarketAI"],
        authorities: {
          matchAuthority: "GRANTED",
          contactAuthority: "GRANTED",
          publicationAuthority: "GRANTED",
          identityDisclosureAuthority: "GRANTED",
        },
      }),
    ]);
    expect(emitted.signals).toHaveLength(2);

    for (const signal of emitted.signals) {
      const line = serialiseSignal(signal);
      const parsed = validateFirstPartySignal(JSON.parse(line));
      expect(parsed).not.toBeNull();
      // Field-for-field, both directions. A silently dropped field on the
      // consumer side is exactly the failure a mirrored type cannot catch.
      expect(parsed).toEqual(signal);
    }
  });

  it("the JSONL body is one signal per line, newline-terminated", () => {
    const build = buildFeedBody({
      kind: "read",
      rows: [row(), row({ signalId: "lm-sig-2", actorRef: "lm:worker:2" })],
    });
    const lines = build.body!.split("\n");
    expect(lines).toHaveLength(3); // two rows + the trailing newline's empty tail
    expect(lines[2]).toBe("");
    for (const line of lines.slice(0, 2)) {
      expect(validateFirstPartySignal(JSON.parse(line))).not.toBeNull();
    }
  });

  it("counts the authorities it emitted, so a blanket GRANTED is visible", () => {
    const result = emitSignals([
      row(),
      row({
        signalId: "lm-sig-3",
        actorRef: "lm:worker:3",
        authorities: {
          matchAuthority: "GRANTED",
          contactAuthority: "DENIED",
          publicationAuthority: "DENIED",
          identityDisclosureAuthority: "DENIED",
        },
      }),
    ]);
    expect(result.authorityCounts).toEqual({
      matchAuthority: 2,
      contactAuthority: 1,
      publicationAuthority: 0,
      identityDisclosureAuthority: 0,
    });
  });
});
