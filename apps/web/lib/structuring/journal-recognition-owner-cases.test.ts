import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEntryRecognition } from "./recognition-tiers";

/**
 * Work-Journal recognition guards — root-cause fix + maximal activity layer
 * (fix/work-journal-recognition-root-cause-v1, PR #562).
 *
 * Two contracts, both asserted against `classifyEntryRecognition` (the exact
 * signal source the journal composer renders):
 *
 *   1. MAXIMAL — every real activity in an entry surfaces as a signal (slug,
 *      capability label, or offered candidate). Multi-activity entries surface
 *      ALL their activities, not just the strongest. Nothing is auto-confirmed.
 *   2. HONEST — non-construction text NEVER pulls a construction default;
 *      status words / empty / gibberish produce nothing; a faucet ("kraną")
 *      never becomes crane operation without machinery/site context.
 *
 * "Wrong skills are worse than missing skills" — but a recognized activity kept
 * as a suggested/review-needed signal is exactly what the owner asked for.
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
    ]
      .join(" | ")
      .toLowerCase(),
  };
}

/** Construction-default fingerprints forbidden on non-construction text.
 *  `montavimas` covers "Durų ir langų montavimas" (door/window installation). */
const FORBIDDEN_CONSTRUCTION =
  /carpentr|carpenter|\broofing\b|stogo|montavimas|krano operat|crane operat|signaliz|krovini signal|brėžin|brezin|blueprint|statyb vadov/i;

const FORBIDDEN_SLUGS = new Set([
  "carpentry",
  "carpenter",
  "roofing",
  "crane-operator",
  "cargo-signalling",
  "blueprint-reading",
]);

function assertNoConstruction(text: string) {
  const s = signalsOf(text);
  expect(s.all, text).not.toMatch(FORBIDDEN_CONSTRUCTION);
  for (const slug of s.slugs) expect(FORBIDDEN_SLUGS.has(slug), `${text}: ${slug}`).toBe(false);
}

describe("maximal cross-sector recognition — every activity surfaces", () => {
  const MATRIX: { text: string; expect: RegExp }[] = [
    // animal / pet care
    { text: "vedžiojau šunį", expect: /gyvūn|priežiūr/i },
    { text: "šėriau gyvūnus", expect: /gyvūn/i },
    { text: "prižiūrėjau katę", expect: /gyvūn/i },
    // maintenance / repair / devices
    { text: "keičiau skaitliuką", expect: /skaitik|skaitli/i },
    { text: "taisiau spyną", expect: /remont/i },
    { text: "montavau lentyną", expect: /remont/i },
    { text: "remontavau kraną", expect: /remont/i },
    // painting / surfaces
    { text: "dažiau tvorą", expect: /daž|tvor/i },
    { text: "dažiau sieną", expect: /daž/i },
    { text: "šlifavau paviršių", expect: /šlifav/i },
    // cleaning / housekeeping
    { text: "valiau langus", expect: /valym/i },
    { text: "tvarkiau kambarius", expect: /valym/i },
    { text: "ploviau grindis", expect: /valym/i },
    // gardening / grounds
    { text: "pjoviau žolę", expect: /sodinink|aplink/i },
    { text: "ravėjau daržą", expect: /sodinink|aplink/i },
    { text: "tvarkiau kiemą", expect: /sodinink|aplink/i },
    // cooking
    { text: "viriau sriubą", expect: /maist|virtuv/i },
    { text: "ruošiau maistą", expect: /maist/i },
    { text: "kepiau bandeles", expect: /maist|virtuv/i },
    // driving / transport
    { text: "vairavau mikroautobusą", expect: /vairav|pavež/i },
    { text: "vežiau žmones", expect: /vairav|pavež/i },
    { text: "pristačiau siuntas", expect: /delivery|pristat|vairav/i },
    // warehouse / loading
    { text: "kroviau paletes", expect: /sandėl|logist/i },
    { text: "rūšiavau prekes", expect: /sandėl|logist/i },
    { text: "dirbau sandėlyje", expect: /sandėl|logist/i },
    // care
    { text: "prižiūrėjau vaiką", expect: /vaik|slaug|priežiūr/i },
    { text: "prižiūrėjau senolį", expect: /priežiūr|globa|elderly/i },
    { text: "padėjau žmogui apsirengti", expect: /priežiūr|globa/i },
    // customer / communication
    { text: "atsakinėjau klientams", expect: /klient/i },
    { text: "priėmiau užsakymus", expect: /klient/i },
    { text: "skambinau klientams", expect: /klient/i },
    // office / documents
    { text: "pildžiau dokumentus", expect: /dokument/i },
    { text: "rūšiavau sąskaitas", expect: /apskait|dokument|sąskait/i },
    { text: "vedžiau apskaitą", expect: /apskait/i },
  ];

  for (const { text, expect: re } of MATRIX) {
    it(`recognizes "${text}" (no construction noise)`, () => {
      const s = signalsOf(text);
      expect(s.tier, text).not.toBe("manual_only"); // never silently dropped
      expect(s.all, text).toMatch(re);
      assertNoConstruction(text);
    });
  }
});

describe("construction recognized ONLY when explicit", () => {
  const EXPLICIT: { text: string; re: RegExp }[] = [
    { text: "montavau langus", re: /carpentry|montavimas/i },
    { text: "mūrijau sieną", re: /bricklaying|mūrij/i },
    { text: "betonavau pamatą", re: /concrete|betonav/i },
    { text: "skaičiau brėžinius", re: /blueprint/i },
    { text: "valdžiau kraną statybvietėje", re: /statyb|technik/i },
  ];
  for (const { text, re } of EXPLICIT) {
    it(`"${text}" → construction signal`, () => {
      expect(signalsOf(text).all, text).toMatch(re);
    });
  }
});

describe("multi-activity entries surface ALL activities", () => {
  it("owner combined → animal + meter + fence, no construction", () => {
    const s = signalsOf(
      "vedžiojau šunį, keičiau skaitliuką ir dažiau tvorą valandą laiko",
    );
    expect(s.all).toMatch(/gyvūn/i);
    expect(s.all).toMatch(/skaitik/i);
    expect(s.all).toMatch(/daž/i);
    assertNoConstruction(
      "vedžiojau šunį, keičiau skaitliuką ir dažiau tvorą valandą laiko",
    );
  });

  it("cleaning + housekeeping + elderly care, no construction", () => {
    const text = "valiau langus, tvarkiau kambarius ir prižiūrėjau senolį";
    const s = signalsOf(text);
    expect(s.all).toMatch(/valym/i);
    expect(s.all).toMatch(/priežiūr|globa/i);
    assertNoConstruction(text);
  });

  it("driving + warehouse + delivery", () => {
    const s = signalsOf(
      "vairavau mikroautobusą, kroviau paletes ir pristačiau siuntas",
    );
    expect(s.all).toMatch(/vairav|pavež/i);
    expect(s.all).toMatch(/sandėl|logist/i);
  });
});

describe("negative guards — no wrong defaults", () => {
  it("'kraną' as a faucet (repair) never becomes crane operation", () => {
    const s = signalsOf("remontavau kraną");
    expect(s.all).toMatch(/remont/i);
    expect(s.all).not.toMatch(/crane|krano operat|technik|statyb/i);
  });

  it("bare window/door noun (cleaning context) never resolves to installation", () => {
    for (const text of [
      "valiau langus",
      "ploviau langus muilu",
      "šluosčiau langus",
      "praviau duris ir ėjau namo",
    ]) {
      expect(signalsOf(text).all, text).not.toMatch(/montavimas|carpentr|carpenter/i);
    }
  });

  it("'Baigta' / status words never become a skill", () => {
    for (const text of ["Baigta", "Baigiau darbą", "Atlikta", "Padaryta"]) {
      const s = signalsOf(text);
      expect(s.slugs, text).toHaveLength(0);
      expect(s.labels, text).toHaveLength(0);
    }
  });

  it("empty / weak / gibberish text yields no default skills", () => {
    for (const text of ["", "   ", "asdf qwerty", "aaa"]) {
      const s = signalsOf(text);
      expect(s.tier, text).toBe("manual_only");
      expect(s.slugs, text).toHaveLength(0);
      expect(s.labels, text).toHaveLength(0);
      assertNoConstruction(text);
    }
  });

  it("legitimate installation (install verb + noun) is preserved", () => {
    for (const text of [
      "montavau duris ir langus",
      "stačiau langus visą dieną",
      "dėjau duris bute",
    ]) {
      expect(signalsOf(text).all, text).toMatch(/montav/i);
    }
  });
});

describe("owner smoke P0 2026-07-02 — the exact owner entry is understood honestly", () => {
  const OWNER_TEXT =
    "Šiandien rinkome laikrodžius pasaulio lietuvių dainų šventei 5 h, " +
    "Tvarkiau ofisą – 1 h, tęsiau programavimą projekto labour market ai – 3 h";

  /** The stale construction catalogue skills the owner saw offered on this
   *  entry. NONE of them may ever come out of recognition for this text —
   *  neither as their LT display name nor as their taxonomy slug. */
  const FORBIDDEN_NAMES = [
    "Brėžinių skaitymas",
    "Durų ir langų montavimas",
    "Grindų dangos",
    "Klojinių stalystė",
    "Medinių karkasų statyba",
    "Nuotekų sistemų montavimas",
    "Santechnikos darbai",
    "Vėdinimo sistemos",
  ];
  const FORBIDDEN_OWNER_SLUGS = [
    "blueprint-reading",
    "door-window-install",
    "flooring",
    "formwork",
    "formwork-carpentry",
    "drainage",
    "plumbing",
    "timber-framing",
    "ventilation",
  ];

  it("yields programming + office-organizing + event/inventory-prep signals", () => {
    const s = signalsOf(OWNER_TEXT);
    expect(s.tier).toBe("auto_signal");
    expect(s.all).toMatch(/programav/i); // "Programavimas"
    expect(s.all).toMatch(/valym/i); // "Valymo darbai" (tvarkiau ofisą)
    expect(s.all).toMatch(/rengin|inventori/i); // "Renginių / inventoriaus paruošimas"
  });

  it("yields ZERO of the stale construction catalogue skills", () => {
    const s = signalsOf(OWNER_TEXT);
    // No construction skill slug is recognised from this text at all.
    expect(s.slugs).toHaveLength(0);
    for (const name of FORBIDDEN_NAMES) {
      expect(s.all, `must not surface "${name}"`).not.toContain(
        name.toLowerCase(),
      );
    }
    for (const slug of FORBIDDEN_OWNER_SLUGS) {
      expect(s.all, `must not surface slug "${slug}"`).not.toContain(slug);
    }
  });

  it("real construction text still detects construction skills", () => {
    // Existing case from the explicit-construction matrix — the honesty fix
    // must not weaken true construction recognition.
    const s = signalsOf("mūrijau sieną");
    expect(s.all).toMatch(/bricklaying|mūrij/i);
  });

  it("nonsense / unknown text yields no construction defaults", () => {
    for (const text of ["asdf qwerty", "xyzzy plugh 123", "aaa"]) {
      const s = signalsOf(text);
      expect(s.slugs, text).toHaveLength(0);
      expect(s.labels, text).toHaveLength(0);
      for (const name of FORBIDDEN_NAMES) {
        expect(s.all, `${text}: must not default to "${name}"`).not.toContain(
          name.toLowerCase(),
        );
      }
    }
  });

  it("the generic event-prep row is not hardcoded to the owner sentence", () => {
    // Other event/inventory phrasings resolve to the same generic label…
    for (const text of [
      "ruošėme salę renginiui",
      "rinkome inventorių šventei",
      "vežiau įrangą renginiui",
    ]) {
      expect(signalsOf(text).all, text).toMatch(/rengin|inventori/i);
    }
    // …and bare "rinkome" (picking mushrooms, votes, …) does NOT fire it.
    expect(signalsOf("rinkome grybus miške").all).not.toMatch(
      /rengin|inventori/i,
    );
  });
});

describe("owner smoke P0 2026-07-02 — picker close control is not a skill chip", () => {
  // Component-level guard (static source + copy check, same style as
  // lib/guards/journal-card-clarity.test.ts): the "Susieti įgūdį" picker's
  // close control must not render inside the skill-chip <ul>, and its label
  // must never be the status word "Baigta" (the owner read it as a suggested
  // skill chip).
  const ROOT = join(__dirname, "..", "..");
  const links = readFileSync(
    join(ROOT, "components/app/journal-entry-skill-links.tsx"),
    "utf8",
  );

  it("renders the picker toggle OUTSIDE the chips <ul>", () => {
    // The clean-chips list block: from its testid to its closing </ul>.
    const listStart = links.indexOf("entry-skill-links-${entryId}");
    expect(listStart).toBeGreaterThan(-1);
    const listEnd = links.indexOf("</ul>", listStart);
    expect(listEnd).toBeGreaterThan(-1);
    const chipList = links.slice(listStart, listEnd);
    expect(chipList).not.toContain("entry-skill-picker-toggle");
    // The toggle exists, after the chip list, and is not chip-styled.
    const toggleAt = links.indexOf("entry-skill-picker-toggle");
    expect(toggleAt).toBeGreaterThan(listEnd);
    const toggleBlock = links.slice(
      links.lastIndexOf("<button", toggleAt),
      links.indexOf("</button>", toggleAt),
    );
    expect(toggleBlock).not.toContain("rounded-full");
  });

  it("the manual picker is labelled as the worker's own profile skills", () => {
    expect(links).toMatch(/t\("pickerHint"\)/);
  });

  it("linkDone copy is a close action, never the status word 'Baigta'", () => {
    for (const [loc, expected] of [
      ["lt", "Uždaryti sąrašą"],
      ["en", "Close list"],
      ["ru", "Закрыть список"],
    ] as const) {
      const messages = JSON.parse(
        readFileSync(join(ROOT, `messages/${loc}.json`), "utf8"),
      ) as { journalSkillLinks: Record<string, string> };
      expect(messages.journalSkillLinks.linkDone).toBe(expected);
      expect(messages.journalSkillLinks.linkDone).not.toBe("Baigta");
      expect(messages.journalSkillLinks.pickerHint).toBeTruthy();
    }
  });
});
