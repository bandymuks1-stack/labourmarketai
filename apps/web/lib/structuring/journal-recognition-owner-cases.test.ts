import { describe, it, expect } from "vitest";
import { classifyEntryRecognition } from "./recognition-tiers";

/**
 * Owner Work-Journal root-cause guards (fix/work-journal-recognition-root-cause-v1).
 *
 * Locks the proven fix: non-construction journal text must NEVER surface a
 * construction default (carpentry / door-window installation / roofing / crane /
 * cargo signalling / drawings reading / construction leadership), and the 10
 * required cross-sector examples must each resolve to a relevant signal.
 *
 * Asserted against `classifyEntryRecognition` — the exact signal source the
 * journal composer renders (auto signal slugs + auto capability labels).
 * "Wrong skills are worse than missing skills": the negative guards are the
 * load-bearing ones.
 */

const NO_DECLARED = new Set<string>();

function signalsOf(text: string) {
  const t = classifyEntryRecognition(text, NO_DECLARED);
  return {
    tier: t.tier,
    slugs: t.autoSignalSlugs,
    labels: t.autoCapabilityLabels,
    candidates: (t.candidates ?? []).map((c) => c.slug),
    all: [
      ...t.autoSignalSlugs,
      ...t.autoCapabilityLabels,
      ...(t.candidates ?? []).map((c) => c.slug),
    ].join(" | ").toLowerCase(),
  };
}

/** Construction-default fingerprints the owner explicitly forbids on
 *  non-construction text. `montavimas` covers "Durų ir langų montavimas". */
const FORBIDDEN_CONSTRUCTION =
  /carpentr|carpenter|\broofing\b|stogo|montavimas|krano|kran operat|signaliz|krovini signal|brėžin|brezin|blueprint|statyb vadov|construction/i;

const FORBIDDEN_SLUGS = new Set([
  "carpentry",
  "carpenter",
  "roofing",
  "crane-operator",
  "cargo-signalling",
]);

describe("owner case — no construction defaults on non-construction text", () => {
  const cases: { text: string; expectLabel: RegExp }[] = [
    { text: "vedžiojau šunį", expectLabel: /gyvūn|priežiūra/i },
    { text: "dažiau tvorą", expectLabel: /daž|tvor/i },
    { text: "keičiau skaitliuką", expectLabel: /skaitik|skaitli/i },
    { text: "viriau sriubą ir ruošiau maistą", expectLabel: /maist|virtuv/i },
    { text: "vairavau mikroautobusą ir vežiau žmones", expectLabel: /vairav|pavež/i },
    { text: "kroviau paletes sandėlyje", expectLabel: /sandėl|logist/i },
    { text: "pjoviau žolę ir tvarkiau kiemą", expectLabel: /sodinink|aplink/i },
    { text: "prižiūrėjau vaiką", expectLabel: /vaik|slaug/i },
    { text: "prižiūrėjau senolį", expectLabel: /elderly-care|senjor|slaug|priežiūr/i },
    { text: "tvarkiau kambarius ir valiau langus", expectLabel: /valym/i },
  ];

  for (const { text, expectLabel } of cases) {
    it(`recognizes "${text}" without construction noise`, () => {
      const s = signalsOf(text);
      // Relevant signal present (auto label OR offered candidate slug).
      expect(s.all).toMatch(expectLabel);
      // No construction default leaked.
      expect(s.all).not.toMatch(FORBIDDEN_CONSTRUCTION);
      for (const slug of s.slugs) expect(FORBIDDEN_SLUGS.has(slug)).toBe(false);
    });
  }

  it("owner combined case → animal/meter/fence only, no construction", () => {
    const s = signalsOf(
      "vedžiojau šunį\nKeičiau skaitliuką ir dažiau tvorą valandą laiko.",
    );
    expect(s.labels.join(" ")).toMatch(/gyvūn/i);
    expect(s.labels.join(" ")).toMatch(/skaitik/i);
    expect(s.labels.join(" ")).toMatch(/daž/i);
    expect(s.all).not.toMatch(FORBIDDEN_CONSTRUCTION);
    for (const slug of s.slugs) expect(FORBIDDEN_SLUGS.has(slug)).toBe(false);
  });
});

describe("negative guards", () => {
  it("'Baigta' / status words never become a skill", () => {
    for (const text of ["Baigta", "Baigiau darbą", "Atlikta", "Padaryta"]) {
      const s = signalsOf(text);
      expect(s.slugs).toHaveLength(0);
      expect(s.labels).toHaveLength(0);
    }
  });

  it("empty / weak / gibberish text yields no default skills", () => {
    for (const text of ["", "   ", "asdf qwerty", "aaa"]) {
      const s = signalsOf(text);
      expect(s.tier).toBe("manual_only");
      expect(s.slugs).toHaveLength(0);
      expect(s.labels).toHaveLength(0);
      expect(s.all).not.toMatch(FORBIDDEN_CONSTRUCTION);
    }
  });

  it("bare window/door noun (cleaning context) never resolves to installation", () => {
    for (const text of [
      "valiau langus",
      "ploviau langus muilu",
      "šluosčiau langus",
      "praviau duris ir ėjau namo",
    ]) {
      const s = signalsOf(text);
      expect(s.all).not.toMatch(/montavimas|carpentr|carpenter/i);
    }
  });
});

describe("legitimate installation is preserved (no over-correction)", () => {
  it("explicit install verb + window/door still recognizes installation", () => {
    for (const text of [
      "montavau duris ir langus",
      "stačiau langus visą dieną",
      "dėjau duris bute",
    ]) {
      const s = signalsOf(text);
      expect(s.labels.join(" ") + s.all).toMatch(/montav/i);
    }
  });
});
