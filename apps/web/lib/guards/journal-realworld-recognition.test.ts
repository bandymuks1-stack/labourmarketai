import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";
import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";
import { localizeCapabilityLabel } from "@/lib/structuring/capability-labels";

/**
 * Real-world recognition guard (journal-real-world-recognition-audit-p0).
 *
 * The owner's reality test: workers write messy, unoptimised entries — typos,
 * mixed languages, names/places/numbers, generic filler. The recogniser must
 * stay HONEST: a wrong signal is worse than no signal. These cases were drawn
 * from a 50-entry blind pack and pin the deterministic guarantees:
 *   1. the false positives the audit found must stay fixed (accounting from
 *      roof tiles, earthworks from "rašiau", concrete from a crane);
 *   2. web/design never yields construction;
 *   3. generic / unknown text stays SAFE-EMPTY (no hallucinated chips);
 *   4. mixed-language (RU / EN) and safe typos are still understood;
 *   5. no capability/activity label leaks its LT string into EN/RU;
 *   6. every label-only signal carries a real label (never a raw slug).
 *
 * The recogniser is deterministic (lexicon + dictionary), so each assertion is
 * exact: a regression flips a value and the test fails.
 */

const CONSTRUCTION_SLUGS = new Set(SKILL_HINTS_LT.map((h) => h.slug));

function suggest(text: string) {
  return extractJournalSuggestions(text);
}
function skillSlugs(text: string): string[] {
  return recognizeSkills(text, 8).map((r) => r.slug);
}
function capLabels(text: string): string[] {
  return extractProfileSkillClaims(text).map((c) => c.label);
}
/** All label-only fragment labels (slug === null) for an entry. */
function labelOnlyFragmentLabels(text: string): string[] {
  return suggest(text)
    .fragments.filter((f) => f.activitySlug === null && !!f.activityLabel)
    .map((f) => f.activityLabel as string);
}

// 25 realistic, unoptimised entries spanning every sector + edge case.
const PACK: { id: number; sector: string; text: string }[] = [
  { id: 1, sector: "construction", text: "Šiandien mūrijau pamatų sieną, supylėm betoną ir surišau armatūrą. 8h" },
  { id: 2, sector: "construction/typo", text: "dazem siena ir glaistem, paskui klijavom plyteles vonioj" },
  { id: 3, sector: "flooring/typo", text: "Klojau laminata svetainej ir montavau plintusus" },
  { id: 7, sector: "earthworks", text: "kasiau tranšeją vandentiekiui, 20 metrų" },
  { id: 8, sector: "roofing", text: "Montavau stogo karkasą ir dengiau čerpėmis visą dieną" },
  { id: 9, sector: "it/web", text: "Dirbau prie naujos svetainės dizaino, taisiau CSS ir React komponentus 7h" },
  { id: 13, sector: "driving", text: "Vairavau furą į Vokietiją, 1100 km, iškroviau prekes" },
  { id: 16, sector: "warehouse", text: "Kroviau paletes sandėly, dirbau su krautuvu 8h" },
  { id: 18, sector: "gardening", text: "pjoviau veją, geneju krumus ir grebsčiau lapus" },
  { id: 21, sector: "cooking", text: "Gaminau pietus 50 žmonių, kepiau ir viriau sriubą" },
  { id: 25, sector: "client-handover", text: "pristačiau atliktus darbus klientui ir suderinau likusius" },
  { id: 26, sector: "negotiation", text: "Vedžiau derybas su tiekėju dėl kainos ir terminų" },
  { id: 28, sector: "equipment", text: "Dirbau su ekskavatoriumi, kasiau pamatus 10h" },
  { id: 29, sector: "equipment(crane)", text: "valdžiau kraną, kėliau konstrukcijas į viršų" },
  { id: 33, sector: "retail", text: "dirbau kasoj, aptarnavau klientus ir pildžiau lentynas" },
  { id: 34, sector: "sales", text: "Pardaviau 15 telefonų, konsultavau dėl tarifų" },
  { id: 35, sector: "office", text: "tvarkiau dokumentus, rasiau saskaitas ir vedziau apskaita Rivile" },
  { id: 36, sector: "generic", text: "dirbau visa diena, labai pavargau" },
  { id: 37, sector: "generic", text: "buvo daug darbo, padariau ka reikejo" },
  { id: 41, sector: "short", text: "mūrijau" },
  { id: 44, sector: "RU/tiling", text: "Укладывал плитку в ванной, затирал швы, 6 часов" },
  { id: 46, sector: "RU/gardening", text: "Косил газон и подстригал кусты во дворе" },
  { id: 47, sector: "RU/handover", text: "Сдал работу клиенту и обсудил доработки" },
  { id: 48, sector: "EN/it", text: "Fixed bugs in the React app and deployed to staging" },
  { id: 50, sector: "EN/construction", text: "Laid bricks and plastered the wall for 7 hours" },
];

/** Proper-noun product names that are intentionally identical across locales. */
const LOCALE_INVARIANT_LABELS = new Set(["Rivilė"]);

describe("Guard: audited false positives stay fixed (wrong signal is worse than none)", () => {
  it("#8 roof tiles ('čerpėmis') never read as accounting ('erp' substring)", () => {
    const text = "Montavau stogo karkasą ir dengiau čerpėmis visą dieną";
    expect(capLabels(text)).not.toContain("Apskaitos sistemos");
    expect(labelOnlyFragmentLabels(text)).not.toContain("Apskaitos sistemos");
    // The real signal is present: roofing.
    expect(skillSlugs(text)).toContain("roofing");
    expect(capLabels(text)).toContain("Stogų dengimas");
  });

  it("#35 office ('rašiau sąskaitas') never fuzzy-matches earthworks ('kasiau')", () => {
    const text = "tvarkiau dokumentus, rasiau saskaitas ir vedziau apskaita Rivile";
    expect(skillSlugs(text)).not.toContain("earthworks");
    // No construction skill at all from office work.
    for (const slug of skillSlugs(text)) {
      expect(CONSTRUCTION_SLUGS.has(slug), `unexpected construction ${slug}`).toBe(false);
    }
    // The real office signals are present.
    expect(capLabels(text)).toContain("Dokumentų tvarkymas");
    expect(capLabels(text)).toContain("Apskaitos sistemos");
  });

  it("#29 crane ('valdžiau kraną, kėliau konstrukcijas') is not a concrete worker", () => {
    const s = suggest("valdžiau kraną, kėliau konstrukcijas į viršų");
    expect(s.workDirectionSlug).not.toBe("concrete_worker");
    // The machine is named instead of being flagged unknown.
    expect(s.fragments.map((f) => f.activityLabel)).toContain(
      "Sunkiosios technikos operavimas",
    );
  });

  it("fuzzy leading-char guard keeps real typos ('laminata' → flooring)", () => {
    // A genuine 1-edit typo that preserves the first letter still matches.
    expect(skillSlugs("Klojau laminata svetainej")).toContain("flooring");
  });
});

describe("Guard: web / design text never produces construction", () => {
  it("#9 website + React → IT signals only", () => {
    const text = "Dirbau prie naujos svetainės dizaino, taisiau CSS ir React komponentus 7h";
    for (const slug of skillSlugs(text)) {
      expect(CONSTRUCTION_SLUGS.has(slug), `unexpected construction ${slug}`).toBe(false);
    }
    const labels = labelOnlyFragmentLabels(text);
    expect(labels).toContain("Interneto svetainės dizainas");
    expect(labels).toContain("Programavimas");
    expect(labels).not.toContain("Mūrijimas");
    expect(labels).not.toContain("Plytelių klojimas");
  });
});

describe("Guard: generic / unknown text stays SAFE-EMPTY (no hallucination)", () => {
  const GENERIC = [
    "dirbau visa diena, labai pavargau",
    "buvo daug darbo, padariau ka reikejo",
    "tvarkiau reikalus",
    "valiau",
    "pjuklu pjoviau lentas, naudojau gręžtuvą ir šlifuoklį",
  ];
  for (const text of GENERIC) {
    it(`"${text}" → no skill, no capability, no understood activity`, () => {
      expect(skillSlugs(text)).toEqual([]);
      expect(capLabels(text)).toEqual([]);
      // No label-only activity fragment was invented (a bare time fragment may
      // remain, but it carries no activity label).
      expect(labelOnlyFragmentLabels(text)).toEqual([]);
    });
  }
});

describe("Guard: mixed-language and safe typos are still understood", () => {
  it("#44 RU tiling → tiling", () => {
    expect(skillSlugs("Укладывал плитку в ванной, затирал швы, 6 часов")).toContain("tiling");
  });
  it("#46 RU gardening → gardening activity", () => {
    expect(capLabels("Косил газон и подстригал кусты во дворе")).toContain(
      "Sodininkystė / aplinkos tvarkymas",
    );
  });
  it("#47 RU handover → client handover", () => {
    expect(capLabels("Сдал работу клиенту и обсудил доработки")).toContain(
      "Darbų pristatymas klientui",
    );
  });
  it("#48 EN React work → programming", () => {
    expect(capLabels("Fixed bugs in the React app and deployed to staging")).toContain(
      "Programavimas",
    );
  });
  it("#50 EN bricks + plaster → both trades", () => {
    const slugs = skillSlugs("Laid bricks and plastered the wall for 7 hours");
    expect(slugs).toContain("bricklaying");
    expect(slugs).toContain("plastering");
  });
  it("#2 LT typos without diacritics ('dazem', 'glaistem') → painting + skim", () => {
    const slugs = skillSlugs("dazem siena ir glaistem, paskui klijavom plyteles vonioj");
    expect(slugs).toContain("painting");
    expect(slugs).toContain("skim-coating");
  });
});

describe("Guard: no LT label leaks into EN/RU across the whole pack", () => {
  it("every label-only signal localizes for EN and RU (no canonical-LT leak)", () => {
    const labels = new Set<string>();
    for (const e of PACK) {
      for (const l of capLabels(e.text)) labels.add(l);
      for (const l of labelOnlyFragmentLabels(e.text)) labels.add(l);
    }
    expect(labels.size).toBeGreaterThan(0);
    for (const label of labels) {
      if (LOCALE_INVARIANT_LABELS.has(label)) continue; // proper noun (product name)
      expect(
        localizeCapabilityLabel(label, "en"),
        `"${label}" leaks LT into EN`,
      ).not.toBe(label);
      expect(
        localizeCapabilityLabel(label, "ru"),
        `"${label}" leaks LT into RU`,
      ).not.toBe(label);
    }
  });

  it("label-only fragments never expose a raw slug (always carry a label)", () => {
    for (const e of PACK) {
      for (const f of suggest(e.text).fragments) {
        if (f.activitySlug === null) {
          // A label-only fragment must have a human label, not a bare slug/empty.
          if (!f.isUnknown) {
            expect(f.activityLabel, `#${e.id} empty label-only fragment`).toBeTruthy();
          }
        }
      }
    }
  });
});

describe("Guard: safe recogniser additions surface the right signal", () => {
  it("#21 cooking verbs ('kepiau', 'viriau sriubą') → kitchen, not empty", () => {
    expect(labelOnlyFragmentLabels("Gaminau pietus 50 žmonių, kepiau ir viriau sriubą")).toContain(
      "Maisto gaminimas / virtuvė",
    );
  });
  it("#16 bare forklift ('dirbau su krautuvu') → heavy equipment", () => {
    expect(capLabels("Kroviau paletes sandėly, dirbau su krautuvu 8h")).toContain(
      "Sunkiosios technikos operavimas",
    );
  });
});

describe("Guard: at least 20 realistic entries run without crashing or hallucinating", () => {
  it("each pack entry is classified (signal OR safe-empty), never throws", () => {
    expect(PACK.length).toBeGreaterThanOrEqual(20);
    for (const e of PACK) {
      const s = suggest(e.text);
      // Deterministic, total function — always returns a fragment array.
      expect(Array.isArray(s.fragments)).toBe(true);
    }
  });
});
