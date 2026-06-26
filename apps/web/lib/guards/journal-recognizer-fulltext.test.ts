import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";
import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";
import { dedupeSignalsByLabel } from "@/lib/structuring/signal-dedupe";

const SKILL_NAMES_LT = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "messages/lt/skill-names.json"), "utf8"),
) as Record<string, string>;

/**
 * Full-text recognition guard (work-journal-perfect-flow-p0).
 *
 * The owner's reality test: a worker writes a normal sentence and the system
 * must understand it across sectors WITHOUT hallucinating construction. These
 * cases pin the four hard rules from the sprint spec:
 *   1. website / web-design text must NOT produce construction (or interior)
 *      skills — it is IT work.
 *   2. excavator / earthworks text may produce earthworks/equipment signals
 *      only — never an unrelated trade.
 *   3. mixed multi-task text must produce the relevant MULTIPLE signals.
 *   4. an understood work item must never be shown as "Nesuprasta /
 *      patikslinkite" (isUnknown) — that false alarm is the bug.
 *
 * The recogniser is deterministic (lexicon + dictionary), so these examples
 * are exact: a regression flips a value and the test fails.
 */

/** Every construction SKILL slug the recogniser knows. None of these may be
 *  recognised from a website/web-design entry. */
const CONSTRUCTION_SLUGS = new Set(SKILL_HINTS_LT.map((h) => h.slug));

/** Construction / interior labels that must never label a web-design entry. */
const CONSTRUCTION_OR_INTERIOR_LABELS = [
  "Mūrijimas",
  "Plytelių klojimas",
  "Dažymas",
  "Gipso kartono montavimas",
  "Betonavimas",
  "Stogo dengimas",
  "Staliaus darbai",
  "Interjero dizainas",
  "Statybos darbai",
  "Namų statyba",
];

function recognizedSlugs(text: string): string[] {
  return recognizeSkills(text, 8).map((r) => r.slug);
}
function fragmentLabels(text: string): string[] {
  return extractJournalSuggestions(text)
    .fragments.map((f) => f.activityLabel)
    .filter((l): l is string => !!l);
}
function capabilityLabels(text: string): string[] {
  return extractProfileSkillClaims(text).map((c) => c.label);
}

describe("Guard: website / web-design text never yields construction", () => {
  const WEB_CASES = [
    "Dirbau su svetainės dizainu 9 h",
    "Dirbau su web dizainu 9 valandas",
    "Kūriau svetainės dizainą",
  ];
  for (const text of WEB_CASES) {
    it(`"${text}" → IT, not construction`, () => {
      // No construction skill chip at all.
      for (const slug of recognizedSlugs(text)) {
        expect(CONSTRUCTION_SLUGS.has(slug), `unexpected construction skill ${slug}`).toBe(false);
      }
      // The understood label is the web/design one, never a construction/interior one.
      const labels = fragmentLabels(text);
      expect(labels).toContain("Interneto svetainės dizainas");
      for (const forbidden of CONSTRUCTION_OR_INTERIOR_LABELS) {
        expect(labels, `${forbidden} must not label a web entry`).not.toContain(forbidden);
        expect(capabilityLabels(text)).not.toContain(forbidden);
      }
    });
  }

  it("understood web entry is NOT flagged unknown", () => {
    const s = extractJournalSuggestions("Dirbau su svetainės dizainu 9 h");
    expect(s.fragments.length).toBeGreaterThan(0);
    expect(s.fragments.every((f) => f.isUnknown === false)).toBe(true);
  });
});

describe("Guard: excavator / earthworks stays in its own sector", () => {
  const text = "Kasiau žemes su ekskavatoriumi 10h";
  it("recognises earthworks only (no unrelated trade)", () => {
    const slugs = recognizedSlugs(text);
    expect(slugs).toContain("earthworks");
    const allowed = new Set(["earthworks"]);
    for (const slug of slugs) {
      expect(allowed.has(slug), `unexpected skill ${slug}`).toBe(true);
    }
  });
  it("names the machine and is not flagged unknown", () => {
    const s = extractJournalSuggestions(text);
    expect(s.fragments.map((f) => f.activityLabel)).toContain(
      "Sunkiosios technikos operavimas",
    );
    expect(s.fragments.every((f) => f.isUnknown === false)).toBe(true);
  });
});

describe("Guard: mixed multi-task text yields multiple relevant signals", () => {
  it("React + brick + client → IT and masonry, nothing unrelated", () => {
    const text =
      "Dirbau su React svetaine, mūrijau sieną ir pristačiau darbą klientui";
    const labels = fragmentLabels(text);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Mūrijimas");
    // No hallucinated tiling / painting / interior on this entry.
    expect(labels).not.toContain("Plytelių klojimas");
    expect(labels).not.toContain("Dažymas");
    expect(labels).not.toContain("Interjero dizainas");
    expect(recognizedSlugs(text)).toContain("bricklaying");
  });

  it("mixed example: visible signals are deduped + localized (no slug, no twin)", () => {
    // Reproduce the composer's display set: fragment labels (what you did) +
    // the deduped new-skill/capability chips. The SAME concept must appear once
    // and never as a raw English slug ("bricklaying" → "Mūrijimas").
    const text =
      "Dirbau su React svetaine, mūrijau sieną ir pristačiau darbą klientui";
    const s = extractJournalSuggestions(text);
    const fragmentLabels = s.fragments
      .map((f) => f.activityLabel)
      .filter((l): l is string => !!l);
    // localized capability + undeclared-skill chips, as the composer builds them
    const capability = extractProfileSkillClaims(text).map((c) => ({
      slug: `claim:${c.normalizedLabel}`,
      name: c.label,
    }));
    const undeclared = recognizeSkills(text, 8).map((r) => ({
      slug: r.slug,
      name: SKILL_NAMES_LT[r.slug] ?? r.slug, // always resolves (no-raw-slug guard)
    }));
    const newChips = dedupeSignalsByLabel([...capability, ...undeclared], fragmentLabels);

    // The full visible signal set = fragments + deduped new chips.
    const visible = [...fragmentLabels, ...newChips.map((c) => c.name)];
    const norm = visible.map((v) => v.toLowerCase());
    // No duplicate concept anywhere on screen.
    expect(new Set(norm).size).toBe(norm.length);
    // bricklaying surfaces ONLY as the localized "Mūrijimas", once.
    expect(norm.filter((v) => v === "mūrijimas")).toHaveLength(1);
    expect(visible).not.toContain("bricklaying");
    // Relevant multiple signals are still present (IT + masonry).
    expect(visible).toContain("Programavimas");
    expect(visible).toContain("Mūrijimas");
  });

  it("long cross-sector entry understands every named task", () => {
    const text =
      "Šiandien rytą kroviau prekes sandėlyje 3h, tada vairavau mikroautobusą į objektą, mūrijau sieną, sutvarkiau React svetainės klaidą, vedžiau derybas su klientu ir pjausčiau gyvatvorę sode.";
    const labels = fragmentLabels(text);
    // Warehouse, driving, masonry, programming, communication, gardening.
    for (const expected of [
      "Sandėlio / logistikos darbai",
      "Pavežėjimas / vairavimas",
      "Mūrijimas",
      "Programavimas",
      "Komunikacija",
      "Sodininkystė / aplinkos tvarkymas",
    ]) {
      expect(labels, `missing ${expected}`).toContain(expected);
    }
    // Distinct sectors → real full-text understanding, not a single guess.
    expect(new Set(labels).size).toBeGreaterThanOrEqual(5);
    // Every fragment is understood — no false "patikslinkite".
    expect(
      extractJournalSuggestions(text).fragments.every((f) => f.isUnknown === false),
    ).toBe(true);
  });
});
