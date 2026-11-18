import { describe, expect, it } from "vitest";

import { countryReadinessInputSchema } from "@/lib/ai/registry/agents/country-readiness";
import { getRequirements, READINESS_COUNTRIES, READINESS_SCOPES } from "./index";
import {
  acceptCountryReading,
  buildCountryReadingPayload,
  type CountryReadingPayload,
} from "./readiness-reading";

/**
 * Registry row 10.11 (owner decision 2026-10-25): the two deterministic walls
 * around the `country_readiness` reading — what may leave, and what may be
 * shown. The matrix is the answer; these pin that the reading can neither
 * carry a person out nor bring an invented requirement back in.
 */

const explain = (key: string) => `statement for ${key}`;

function payload(): CountryReadingPayload {
  const p = buildCountryReadingPayload("NL", "worker_posted", explain);
  if (!p) throw new Error("NL worker_posted has researched rows");
  return p;
}

function envelopeFor(p: CountryReadingPayload, override: Record<string, unknown> = {}) {
  const refs = p.sourceRecords.map((r) => r.ref);
  return {
    suggestion: true,
    agent: "country_readiness",
    confidence: "medium",
    evidence_refs: refs.map((ref) => ({ source: "country_readiness_matrix", ref })),
    missing_information: [],
    needs_human_review: true,
    blocked_claims: [],
    data: {
      summary: "Posted to the Netherlands: the A1 and the notification come first.",
      steps: refs.map((ref) => ({ ref, step: `do ${ref}` })),
      needs_legal_review: false,
      limitations: ["Not legal advice."],
      ...override,
    },
  };
}

describe("what leaves: matrix rows only", () => {
  it("every researched country × scope builds a payload the strict agent schema accepts", () => {
    for (const country of READINESS_COUNTRIES) {
      for (const scope of READINESS_SCOPES) {
        const p = buildCountryReadingPayload(country, scope, explain);
        expect(p, `${country}/${scope}`).not.toBeNull();
        expect(countryReadinessInputSchema.safeParse(p).success, `${country}/${scope}`).toBe(true);
      }
    }
  });

  it("carries exactly the scope's rows, keyed by the matrix key, with the page's own statement", () => {
    const p = payload();
    const rows = getRequirements("NL", "worker_posted");
    expect(p.sourceRecords.map((r) => r.ref)).toEqual([...new Set(rows.map((r) => r.key))]);
    for (const rec of p.sourceRecords) {
      const row = rows.find((r) => r.key === rec.ref)!;
      expect(rec.statement).toBe(`statement for ${row.explanationKey}`);
      expect(rec.grade).toBe(row.confidence);
      expect(rec.source).toBe(row.sourceTitle);
    }
  });

  it("names no person and no identifier — only matrix fields travel", () => {
    const p = payload();
    expect(Object.keys(p).sort()).toEqual(["country", "scope", "sourceRecords"]);
    for (const rec of p.sourceRecords) {
      expect(Object.keys(rec).sort()).toEqual(
        ["grade", "level", "ref", "risk", "source", "statement"].sort(),
      );
    }
  });

  it("an unresearched country is no payload at all — never a neighbour's rows", () => {
    expect(buildCountryReadingPayload("US", "worker_solo", explain)).toBeNull();
    expect(buildCountryReadingPayload("ZZ", "company_hiring", explain)).toBeNull();
  });

  it("accepts a lower-case country code the route may carry", () => {
    expect(buildCountryReadingPayload("nl", "worker_posted", explain)?.country).toBe("NL");
  });
});

describe("what is shown: every citation names a row that was sent", () => {
  it("a fully cited reading is accepted, and each step's source comes from the MATRIX", () => {
    const p = payload();
    const v = acceptCountryReading(envelopeFor(p), p);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const rows = getRequirements("NL", "worker_posted");
    for (const s of v.reading.steps) {
      const row = rows.find((r) => r.key === s.ref)!;
      expect(s.sourceUrl).toBe(row.sourceUrl);
      expect(s.sourceTitle).toBe(row.sourceTitle);
      expect(s.needsLegalCheck).toBe(row.confidence === "needs_legal_review");
    }
  });

  it("ONE invented step ref voids the whole reading", () => {
    const p = payload();
    const env = envelopeFor(p);
    env.data.steps = [...env.data.steps, { ref: "work_permit_fast_track", step: "made up" }];
    expect(acceptCountryReading(env, p)).toEqual({ ok: false, reason: "unsourced" });
  });

  it("an evidence ref outside the payload voids it too", () => {
    const p = payload();
    const env = { ...envelopeFor(p), evidence_refs: [{ source: "web", ref: "some-blog" }] };
    expect(acceptCountryReading(env, p)).toEqual({ ok: false, reason: "unsourced" });
  });

  it("a ref from ANOTHER scope of the same country is not a citation of this one", () => {
    const p = payload();
    const sent = new Set(p.sourceRecords.map((r) => r.ref));
    const otherScope = getRequirements("NL", "company_hiring").find((r) => !sent.has(r.key));
    expect(otherScope, "fixture: company_hiring has a key worker_posted lacks").toBeDefined();
    const env = envelopeFor(p);
    env.data.steps = [{ ref: otherScope!.key, step: "x" }];
    expect(acceptCountryReading(env, p)).toEqual({ ok: false, reason: "unsourced" });
  });

  it("the matrix's legal-review grade wins: the model may add the flag, never remove it", () => {
    const p = payload();
    const matrixFlags = p.sourceRecords.some((r) => r.grade === "needs_legal_review");
    expect(matrixFlags, "fixture: NL worker_posted carries a needs_legal_review row").toBe(true);
    const v = acceptCountryReading(envelopeFor(p, { needs_legal_review: false }), p);
    expect(v.ok && v.reading.needsLegalCheck).toBe(true);
  });

  it("an empty or shapeless envelope is malformed, never shown", () => {
    const p = payload();
    expect(acceptCountryReading(null, p)).toEqual({ ok: false, reason: "malformed" });
    expect(acceptCountryReading(envelopeFor(p, { summary: "  " }), p)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(acceptCountryReading(envelopeFor(p, { limitations: [] }), p)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
