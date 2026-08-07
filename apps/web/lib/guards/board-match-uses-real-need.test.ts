import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { matchWorkerToNeed, type MatchSubject } from "@/lib/market/match-v1";
import {
  needFromDemandRow,
  needFromRoleText,
  structuredV2FromDemandRow,
} from "@/lib/opportunities/opportunity-need";

/**
 * The worker board must match against the need it DISPLAYS.
 *
 * W10 audit P0-1. `load-worker-opportunities.ts` built the `MatchNeed` from
 * `role_text` alone and, three lines later, read the same row's structured
 * demand for rendering. So a card could show the employer's engagement form,
 * gross pay, licence requirement and shift pattern, and print `strong` beside
 * them — because the engine had been handed `structuredV2: undefined`, so
 * `engagement_form`, `transport.licence_categories` and the compensation
 * comparison never ran and `blocking` came back empty.
 *
 * The audit's failure scenario, reproduced below: a verified NL contractor
 * posts engagement `direct_employment`, gross €2 400, licence `C+CE`, night
 * shifts, no accommodation. A worker whose `preferred_contract_type` is
 * `subcontract`, who holds only licence `B` and will not work nights, opens the
 * board, sees all four facts on the card, and is told the match is strong. They
 * express interest; the employer rejects on the first call.
 *
 * (The audit wrote the demand's form as "employment"; the canonical enum value
 * is `direct_employment` — `employment` is the WORKER-side
 * `workers.preferred_contract_type` vocabulary, which the engine maps across.
 * The projection correctly drops an out-of-enum value, which is how the first
 * draft of this test caught its own bad fixture.)
 *
 * This guard pins the fix at the level that matters — the ENGINE OUTPUT, not
 * the wiring. A future refactor that reintroduces a reduced need will fail
 * here even if every import still looks right.
 */

const APP = join(__dirname, "..", "..");

/** The audit's worker: wrong contract type, licence B only, no night shifts. */
const MISMATCHED_WORKER: MatchSubject = {
  skills: [{ uri: "welding", evidence: "work_journal" }],
  country: "NL",
  preferredContractType: "subcontract",
  drivingLicenceCategories: ["B"],
  nightShiftsOk: false,
  salaryMinEur: 3200,
};

/** The audit's demand, in the shape the board RPC actually returns. */
const DEMAND_ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  role_text: "welder",
  country: "NL",
  location_label: "Rotterdam",
  route_status: "approved",
  structured: {
    engagement_form: "direct_employment",
    compensation: { min_cents: 240000, currency: "EUR", basis: "gross", unit: "month" },
    transport: { licence_categories: ["C", "CE"] },
    time: { shifts: ["night"] },
    accommodation: { state: "not_offered" },
  },
};

describe("the structured demand actually reaches the engine", () => {
  it("the row's structured cluster survives projection to v2", () => {
    const v2 = structuredV2FromDemandRow(DEMAND_ROW);
    expect(v2, "the public→v2 projection dropped a valid structured demand").not.toBeNull();
    expect(v2?.engagement_form).toBe("direct_employment");
    expect(v2?.transport?.licence_categories).toEqual(["C", "CE"]);
    expect(v2?.compensation?.min_cents).toBe(240000);
    expect(v2?.time?.shifts).toEqual(["night"]);
    expect(v2?.accommodation?.state).toBe("not_offered");
  });

  it("needFromDemandRow carries the structure; needFromRoleText never did", () => {
    const fromRow = needFromDemandRow(DEMAND_ROW).need;
    const fromText = needFromRoleText("welder", "NL", "Rotterdam").need;

    expect(fromRow.structuredV2).not.toBeNull();
    // The pre-fix path, kept for the text-only callers, must stay structure-free
    // so this test keeps describing a real difference.
    expect(fromText.structuredV2 ?? null).toBeNull();

    // Everything the old path DID derive is preserved unchanged.
    expect(fromRow.country).toBe(fromText.country);
    expect(fromRow.city).toBe(fromText.city);
    expect(fromRow.skillIds).toEqual(fromText.skillIds);
    expect(fromRow.needSource).toBe(fromText.needSource);
  });

  it("a demand with no structured cluster degrades to the old need exactly", () => {
    // Honest degradation: an unstructured demand must match EXACTLY as before,
    // never worse. Absence is unknown, never "not met".
    const bare = { role_text: "welder", country: "NL", location_label: "Rotterdam" };
    const fromRow = needFromDemandRow(bare).need;
    const fromText = needFromRoleText("welder", "NL", "Rotterdam").need;
    expect(fromRow.structuredV2).toBeNull();
    // `languageRequirementUnknown` is normalised out alongside `structuredV2`:
    // both are ADDITIVE declarations this builder makes about its own limits,
    // not derived requirements. The point of this test is that nothing the old
    // path derived changed, and neither flag can make a match worse — the
    // engine treats the language declaration as missing DATA, never as
    // "not met" (w10-7-match-symmetry.test.ts pins that behaviour).
    const withoutDeclarations = (n: typeof fromRow) => ({
      ...n,
      structuredV2: undefined,
      languageRequirementUnknown: undefined,
    });
    expect(fromRow.languageRequirementUnknown).toBe(true);
    expect(withoutDeclarations(fromRow)).toEqual(withoutDeclarations(fromText));
  });
});

describe("the audit's failure scenario no longer produces a false strong match", () => {
  const realNeed = needFromDemandRow(DEMAND_ROW).need;
  const reducedNeed = needFromRoleText("welder", "NL", "Rotterdam").need;

  it("PRE-FIX shape: the reduced need blocks nothing", () => {
    // This is what the board used to do. Kept as the control, so the test below
    // is a demonstrated CHANGE rather than an assertion about a constant.
    const before = matchWorkerToNeed(reducedNeed, MISMATCHED_WORKER);
    expect(before.blocking ?? []).toEqual([]);
  });

  it("POST-FIX: the real need blocks on the facts the card displays", () => {
    const after = matchWorkerToNeed(realNeed, MISMATCHED_WORKER);
    const blockedCriteria = (after.blocking ?? []).map((b) => b.criterion);

    expect(
      blockedCriteria.length,
      "the demand states engagement form, licence and pay that this worker " +
        "fails, and the engine still blocks on none of them",
    ).toBeGreaterThan(0);

    // Named explicitly: these are the three the audit called out by line.
    expect(blockedCriteria).toContain("engagement_form");
    expect(blockedCriteria).toContain("licence_categories");
  });

  it("POST-FIX: the match is not reported as strong", () => {
    const after = matchWorkerToNeed(realNeed, MISMATCHED_WORKER);
    expect(after.status).not.toBe("strong");
  });

  it("a worker who FITS the same structured demand is not harmed", () => {
    // The fix must not simply make everything block — that would be a different
    // kind of lie. A worker who meets the stated requirements still matches.
    const fitting: MatchSubject = {
      skills: [{ uri: "welding", evidence: "work_journal" }],
      country: "NL",
      preferredContractType: "employment",
      drivingLicenceCategories: ["B", "C", "CE"],
      nightShiftsOk: true,
      salaryMinEur: 2000,
    };
    const after = matchWorkerToNeed(realNeed, fitting);
    expect(after.blocking ?? []).toEqual([]);
  });
});

describe("one derivation, server-side, not client-chosen", () => {
  const loader = readFileSync(
    join(APP, "lib", "opportunities", "load-worker-opportunities.ts"),
    "utf8",
  );
  const interest = readFileSync(join(APP, "lib", "opportunities", "interest.ts"), "utf8");

  it("both worker surfaces use the row-based derivation", () => {
    for (const src of [loader, interest]) {
      expect(src).toMatch(/needFromDemandRow/);
      expect(src).not.toMatch(/needFromRoleText/);
    }
  });

  it("the express-interest path still re-reads the row through the gated RPC", () => {
    // The client sends a request id; it must never be the thing that decides
    // what is matched. The row comes back from the gated RPC and is re-checked
    // against the same approved-route filter the board uses.
    expect(interest).toMatch(/list_open_demand_for_workers/);
    expect(interest).toMatch(/isApprovedRouteRow/);
    expect(interest).toMatch(/needFromDemandRow\(visibleRow\)/);
  });

  it("the board matches the SAME row object it renders from", () => {
    expect(loader).toMatch(/needFromDemandRow\(row\)/);
    expect(loader).toMatch(/readStructuredDemandPublic\(row\)/);
  });
});

describe("invalid structure is dropped fail-closed, never improvised", () => {
  it("an out-of-enum value is dropped, not guessed at", () => {
    // The projection runs through the CANONICAL v2 validator. A value outside
    // the closed set does not get coerced to the nearest neighbour and does not
    // get passed through raw — it disappears, and the criterion goes back to
    // "unknown". (This is not hypothetical: the first draft of this file used
    // "employment", the worker-side vocabulary, and the projection dropped it.)
    const v2 = structuredV2FromDemandRow({
      structured: {
        engagement_form: "employment", // worker vocabulary, not a demand form
        transport: { licence_categories: ["C", "CE", "SPACESHIP"] },
      },
    });
    expect(v2?.engagement_form).toBeUndefined();
    // Array fields drop element-by-element — the valid ones survive.
    expect(v2?.transport?.licence_categories).toEqual(["C", "CE"]);
  });

  it("a dropped requirement never becomes a BLOCK", () => {
    // The critical direction. An unparseable requirement must degrade to
    // "unknown", never to "not met" — otherwise bad data would start rejecting
    // workers who actually qualify.
    const need = needFromDemandRow({
      role_text: "welder",
      country: "NL",
      structured: { engagement_form: "employment" },
    }).need;
    const result = matchWorkerToNeed(need, MISMATCHED_WORKER);
    const blocked = (result.blocking ?? []).map((b) => b.criterion);
    expect(blocked).not.toContain("engagement_form");
  });

  it("a non-object / absent structured field yields null, not a throw", () => {
    for (const row of [null, undefined, {}, { structured: null }, { structured: 7 }]) {
      expect(structuredV2FromDemandRow(row)).toBeNull();
      expect(() => needFromDemandRow(row)).not.toThrow();
    }
  });
});

describe("the match explanation names the input the match actually used", () => {
  it("every blocking criterion cites a structured_v2 source path", () => {
    const need = needFromDemandRow(DEMAND_ROW).need;
    const result = matchWorkerToNeed(need, MISMATCHED_WORKER);
    const blocking = result.blocking ?? [];
    expect(blocking.length).toBeGreaterThan(0);

    // W10 critical check #3: the explanation must describe the REAL signals
    // used. A criterion that blocks must be able to say where it came from,
    // and for these it is the structured demand — the same cluster the card
    // renders — not a derived guess from the role text.
    for (const b of blocking) {
      expect(b.source, `blocking criterion "${b.criterion}" has no source`).toBeTruthy();
    }
    const structuredSourced = blocking.filter((b) =>
      String(b.source).includes("structured_v2"),
    );
    expect(
      structuredSourced.length,
      `no blocking criterion cites the structured demand: ` +
        blocking.map((b) => `${b.criterion}←${b.source}`).join(", "),
    ).toBeGreaterThan(0);
  });

  it("nothing is blocked that the demand did not state", () => {
    // The inverse honesty check: a demand stating ONLY an engagement form must
    // not produce blocks about licences, pay or shifts.
    const need = needFromDemandRow({
      role_text: "welder",
      country: "NL",
      structured: { engagement_form: "direct_employment" },
    }).need;
    const blocked = (matchWorkerToNeed(need, MISMATCHED_WORKER).blocking ?? []).map(
      (b) => b.criterion,
    );
    expect(blocked).toEqual(["engagement_form"]);
  });
});

describe("no banned signal entered the match input", () => {
  // The owner's explicit ban list for this slice. The need builder must not
  // start reaching for reputation-shaped or recency-shaped signals.
  const needModule = readFileSync(
    join(APP, "lib", "opportunities", "opportunity-need.ts"),
    "utf8",
  );
  const stripped = needModule
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("no trust/rating/recency/fraud signal is read", () => {
    for (const banned of [
      "trustScore",
      "trust_score",
      "rating",
      "stars",
      "reputation",
      "fraud",
      "updated_at",
      "last_seen",
      "profile_touch",
    ]) {
      expect(stripped, `banned signal "${banned}" reached the match input`).not.toContain(
        banned,
      );
    }
  });

  it("no hard-coded score or confidence literal", () => {
    expect(stripped).not.toMatch(/\bscore\s*[:=]\s*\d/);
    expect(stripped).not.toMatch(/confidence/i);
  });
});
