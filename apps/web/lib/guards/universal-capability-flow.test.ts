import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Universal human capability flow — guard v1 (audit:
 * docs/audits/universal-capability-flow-audit-v1.md).
 *
 * LabourMarket.ai must serve every human capability, not only construction
 * workers or formal job-seekers: a student, crafter, hobbyist, volunteer,
 * seller/creator, and service provider must all see entry copy written for
 * them. This guard pins the universal framing so a future copy edit cannot
 * silently regress the entry surfaces back to a construction-only / work-only
 * product — and that none of these surfaces claims automatic verification or
 * matching.
 *
 * Token-based (cumulative keywords), so honest rewording stays green while a
 * regression to a single vertical fails. Pure message assertions; runs in CI
 * via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

// Domains that prove the entry flow is NOT construction-only / NOT work-only.
const DOMAIN_TOKENS = {
  en: {
    learning: /stud(y|ied|ying)|school|lesson|learn|taught/i,
    craft: /knit|sew|handmade|craft|socks|made\b/i,
    selling: /\bsold\b|\bsell\b|\bitems?\b|product/i,
    volunteering: /volunteer/i,
  },
  lt: {
    learning: /moki|mokykl|pamok|studij|mokym/i,
    craft: /mezg|kojin|siuv|rankų darb|gamin/i,
    selling: /pardav|prek/i,
    volunteering: /savanor/i,
  },
} as const;

// Automatic verification / matching claims that must never appear on these
// surfaces. Honest negations ("not verified") and human-earned confirmations
// ("earn confirmations" / "gauk patvirtinimų") are deliberately NOT matched.
//
// Two detectors, because JS `\b` is ASCII-only: a Lithuanian letter like `š`
// in "įrašai" forms a spurious boundary, so a case-insensitive `\bAI\b` would
// falsely fire on the lowercase "ai" tail. The literal-AI claim is therefore
// matched CASE-SENSITIVELY (real marketing copy writes "AI"), while the
// automation/matching phrases stay case-insensitive.
const AI_CLAIM = /(?<![A-Za-z])AI(?![A-Za-z])/;
const AUTO_MATCH_VERIFY =
  /automati(?:c|cally|nis|škai)\s*\w*\s*(?:verif|patvirtin|match|atitik)|automatically\s+(?:verified|matched)|guaranteed\s+(?:match|job|result)|auto[-\s]?match/i;
function autoClaim(s: string): string | null {
  return (s.match(AI_CLAIM)?.[0] ?? s.match(AUTO_MATCH_VERIFY)?.[0]) ?? null;
}

function journalBlob(loc: "lt" | "en"): string {
  const j = loadJson(`messages/${loc}/journal.json`) as Record<string, unknown>;
  const inbox = (j.inbox ?? {}) as Record<string, string>;
  return [
    j.whatDidYouDo,
    j.textPlaceholder,
    j.example1,
    j.example2,
    j.example3,
    j.example4,
    inbox.writeConcreteWorks,
  ]
    .filter(Boolean)
    .join(" • ");
}

// ── 1. Journal entry surface spans many domains (not construction-only) ────

describe("Guard: the journal entry flow is not construction-only", () => {
  for (const loc of ["lt", "en"] as const) {
    const blob = journalBlob(loc);
    for (const [domain, re] of Object.entries(DOMAIN_TOKENS[loc])) {
      it(`${loc}: journal entry copy includes the ${domain} domain`, () => {
        expect(re.test(blob), `${loc} journal copy missing ${domain}: "${blob}"`).toBe(true);
      });
    }
  }
});

// ── 2. Onboarding + profile are not worker/employment-only ────────────────

describe("Guard: onboarding + profile read for every human, not just workers", () => {
  for (const loc of ["lt", "en"] as const) {
    it(`${loc}: the worker role description goes beyond job-seeking`, () => {
      const desc = (
        (((loadJson(`messages/${loc}.json`).auth as Record<string, unknown>)
          .onboarding as Record<string, unknown>)
          .rolePicker as Record<string, Record<string, string>>).worker
      ).desc;
      const broad = loc === "lt" ? /moksl|veikl/i : /stud|activit/i;
      expect(broad.test(desc), `${loc} worker.desc not broadened: "${desc}"`).toBe(true);
    });

    it(`${loc}: the profile hub frames evidence as activity, not work-only`, () => {
      const hub = loadJson(`messages/${loc}.json`).profileHub as {
        lead: string;
        evidence: { intro: string };
      };
      const blob = `${hub.lead} ${hub.evidence.intro}`;
      const broad = loc === "lt" ? /veikl|mokym/i : /activit|learning/i;
      expect(broad.test(blob), `${loc} profileHub not broadened: "${blob}"`).toBe(true);
    });
  }
});

// ── 3. No automatic verification / matching claim on these surfaces ───────

describe("Guard: entry surfaces claim no automatic verification or matching", () => {
  for (const loc of ["lt", "en"] as const) {
    it(`${loc}: journal + role + profile copy makes no auto verify/match claim`, () => {
      const root = loadJson(`messages/${loc}.json`);
      const hub = root.profileHub as { lead: string; evidence: { intro: string } };
      const desc = (
        (((root.auth as Record<string, unknown>).onboarding as Record<string, unknown>)
          .rolePicker as Record<string, Record<string, string>>).worker
      ).desc;
      const blob = [journalBlob(loc), hub.lead, hub.evidence.intro, desc].join(" • ");
      const m = autoClaim(blob);
      expect(m, `${loc} auto verify/match claim: ${m}`).toBeNull();
    });
  }
});

// ── Negative controls — the detectors are real ────────────────────────────

describe("Guard: detectors are real", () => {
  it("DOMAIN_TOKENS fire on their domain and not on construction-only copy", () => {
    expect(DOMAIN_TOKENS.en.learning.test("Studied 2 hours")).toBe(true);
    expect(DOMAIN_TOKENS.en.craft.test("knitted socks")).toBe(true);
    expect(DOMAIN_TOKENS.lt.selling.test("pardaviau 5 prekes")).toBe(true);
    // a pure construction sentence has none of the universal domains
    const constructionOnly = "dažiau sienas, montavau gegnes, kasiau smėlį";
    const anyLtDomain = Object.values(DOMAIN_TOKENS.lt).some((re) => re.test(constructionOnly));
    expect(anyLtDomain).toBe(false);
  });

  it("autoClaim flags automation but passes honest human confirmation", () => {
    expect(autoClaim("automatically verified")).toBeTruthy();
    expect(autoClaim("guaranteed job")).toBeTruthy();
    expect(autoClaim("auto-match")).toBeTruthy();
    expect(autoClaim("AI verified")).toBeTruthy();
    expect(autoClaim("earn confirmations")).toBeNull();
    expect(autoClaim("gauk patvirtinimų")).toBeNull();
    expect(autoClaim("Not verified yet")).toBeNull();
    // the LT word "įrašai" must NOT trip the literal-AI detector
    expect(autoClaim("tikri darbo įrašai")).toBeNull();
  });
});
