import { describe, expect, it } from "vitest";

import { extractJournalSuggestions } from "./extract-journal-suggestions";

/**
 * RECOGNITION COVERAGE ACROSS SIX DOMAINS — a measurement, and one invariant.
 *
 * ── WHAT THE MEASUREMENT ACTUALLY SAID, AND A CLAIM IT CORRECTED ─────────
 *
 * From a two-sentence sample I reported that the lexicon was
 * "construction-weighted". Measured properly across 15 real sentences in six
 * domains on 2026-09-08, that was an over-generalisation:
 *
 *   none 3 · correct 12 · ambiguous 0 · WRONG 0
 *
 *   construction   4 / 4 correct
 *   hospitality    2 / 2 correct
 *   healthcare     2 / 2 correct
 *   manufacturing  2 / 2 correct
 *   warehouse      2 / 3 correct — "Surinkau 128 užsakymus" finds nothing
 *   automotive     0 / 2 — the ONLY domain with no coverage at all
 *
 * So the real gap is narrow and actionable: AUTOMOTIVE, plus order-picking
 * phrasing in warehouse. Hospitality, healthcare and manufacturing already
 * work. And the canonical taxonomy already carries `order-picking`,
 * `warehouse-operations` and `auto-repair` — so the gap is in the LEXICON,
 * not in the taxonomy and not in ESCO.
 *
 * The most valuable number is the last one: ZERO wrong, and zero misleading
 * top candidates. The recognizer is silent where it does not know, which is
 * the property worth protecting while coverage is improved.
 *
 * ── THE ONE THING THIS FILE ASSERTS ───────────────────────────────────────
 *
 * ZERO WRONG CANDIDATES. Not a coverage percentage — a coverage threshold
 * would be a ratchet, and the cheapest way to satisfy a ratchet is to bolt on
 * hand-written keywords until the number goes up, which is exactly what the
 * owner ruled out. What must never regress is honesty:
 *
 *   no candidate   fine. "We did not recognise anything" is a true statement
 *                  and the person can link a skill by hand.
 *   correct        good.
 *   ambiguous      acceptable — the right concept is among the candidates and
 *                  the human confirms.
 *   WRONG          not acceptable. A confident wrong skill on a person's
 *                  record is worse than silence, because they may never see it
 *                  and an employer might.
 *
 * The counts are printed in the failure message of the last test so a future
 * reader can see the real distribution without this becoming a target.
 */

type Outcome = "none" | "correct" | "ambiguous" | "wrong";

interface Case {
  readonly domain: string;
  readonly text: string;
  /** Canonical slugs any of which would be a CORRECT reading of this sentence.
   *  Empty means: nothing in the taxonomy fits, so silence is correct. */
  readonly accept: readonly string[];
}

/** Real sentences, in the languages people actually write them in. */
const CASES: readonly Case[] = [
  // ── CONSTRUCTION — the domain the lexicon was built for ──────────────────
  { domain: "construction", text: "Šiandien montavau PERI sienų klojinius.", accept: ["formwork"] },
  { domain: "construction", text: "Klojau laminatą ir parketą.", accept: ["flooring"] },
  { domain: "construction", text: "Suvirinau metalo konstrukcijas.", accept: ["structural-steel", "welding-blueprint", "mig-mag-welding", "tig-welding", "arc-welding"] },
  { domain: "construction", text: "Mūrijau sienas iš blokelių.", accept: ["bricklaying", "blockwork"] },  // blocks, not bricks - the recognizer is MORE precise than the first fixture was

  // ── WAREHOUSE / LOGISTICS ────────────────────────────────────────────────
  { domain: "warehouse", text: "Surinkau 128 užsakymus.", accept: ["order-picking", "warehouse-operations"] },
  { domain: "warehouse", text: "Dirbau sandėlyje, kroviau padėklus.", accept: ["warehouse-operations", "forklift-operation", "forklift-operator"] },
  { domain: "warehouse", text: "Vairavau krautuvą visą pamainą.", accept: ["forklift-operation", "forklift-operator", "driving"] },

  // ── AUTOMOTIVE ───────────────────────────────────────────────────────────
  { domain: "automotive", text: "Keičiau stabdžių diskus ir kaladėles.", accept: ["auto-repair"] },
  { domain: "automotive", text: "Dariau automobilio variklio remontą.", accept: ["auto-repair"] },

  // ── HOSPITALITY ──────────────────────────────────────────────────────────
  { domain: "hospitality", text: "Paruošiau pietus virtuvėje.", accept: ["cooking", "kitchen-help"] },
  { domain: "hospitality", text: "Ruošiau kavą ir aptarnavau klientus.", accept: ["barista-work", "customer-service"] },

  // ── HEALTHCARE ───────────────────────────────────────────────────────────
  { domain: "healthcare", text: "Slaugiau senyvo amžiaus pacientus.", accept: ["elderly-care"] },
  { domain: "healthcare", text: "Prižiūrėjau vaikus darželyje.", accept: ["childcare"] },

  // ── MANUFACTURING ────────────────────────────────────────────────────────
  { domain: "manufacturing", text: "Dirbau prie surinkimo linijos.", accept: ["assembly-work", "production-line"] },
  { domain: "manufacturing", text: "Tikrinau gaminių kokybę.", accept: ["quality-control"] },
];

function classify(c: Case): { outcome: Outcome; got: readonly string[] } {
  const got = extractJournalSuggestions(c.text).skillSlugs ?? [];
  if (got.length === 0) return { outcome: "none", got };
  const hit = got.some((s) => c.accept.includes(s));
  if (!hit) return { outcome: "wrong", got };
  return { outcome: got[0] === undefined || c.accept.includes(got[0]) ? "correct" : "ambiguous", got };
}

describe("recognition coverage across six domains", () => {
  it("NEVER produces a wrong candidate — silence is allowed, a false skill is not", () => {
    const wrong = CASES.map((c) => ({ c, ...classify(c) })).filter((r) => r.outcome === "wrong");
    expect(
      wrong.map((r) => `${r.c.domain}: "${r.c.text}" → ${r.got.join(", ")} (expected one of ${r.c.accept.join(", ") || "nothing"})`),
      "a confident wrong skill on a person's record is worse than silence",
    ).toEqual([]);
  });

  it("the top candidate, when there is one, is an acceptable reading", () => {
    // Ambiguity is fine — the human confirms. Being confidently first and wrong
    // is not, because the first candidate is the one a person is most likely to
    // accept without reading.
    const misled = CASES.map((c) => ({ c, ...classify(c) })).filter(
      (r) => r.got.length > 0 && !r.c.accept.includes(r.got[0]),
    );
    expect(misled.map((r) => `${r.c.domain}: "${r.c.text}" → top=${r.got[0]}`)).toEqual([]);
  });

  it("records the measured distribution, so the gap stays visible", () => {
    const counts: Record<Outcome, number> = { none: 0, correct: 0, ambiguous: 0, wrong: 0 };
    const byDomain: Record<string, string[]> = {};
    for (const c of CASES) {
      const { outcome, got } = classify(c);
      counts[outcome] += 1;
      (byDomain[c.domain] ??= []).push(`${outcome}${got.length ? `(${got.join("|")})` : ""}`);
    }
    // Deliberately NOT a threshold. This asserts only that the fixture set
    // still spans six domains — the numbers are carried in the message so a
    // reader sees them without anyone being pushed to game them.
    expect(
      Object.keys(byDomain).sort(),
      `measured: ${JSON.stringify(counts)} — ${JSON.stringify(byDomain)}`,
    ).toEqual([
      "automotive",
      "construction",
      "healthcare",
      "hospitality",
      "manufacturing",
      "warehouse",
    ]);
  });
});
