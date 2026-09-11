import { describe, expect, it } from "vitest";

import {
  FRAGMENT_SKILL_METRIC_SLUG,
  formatFragmentSkillValue,
  fragmentSkillsByIndex,
  mapRecognitionToPersistedFragments,
  parseFragmentSkillValue,
  parsePersistedFragments,
} from "./fragment-skill-evidence";
import { deriveJournalRecognition } from "./journal-recognition";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";

const NO_REJECTIONS = { slugs: new Set<string>(), claimLabels: new Set<string>() };

/** What the composer / chat intake persist for a text, as parsed_fragment rows. */
function persistedFor(text: string) {
  return extractJournalSuggestions(text).fragments.map((f, i) => ({
    metric_slug: "parsed_fragment",
    value_text: `${i + 1}|${f.rawPhrase}`,
  }));
}

describe("fragment_skill value format", () => {
  it("round-trips `<index>|<slug>` and refuses malformed values", () => {
    expect(parseFragmentSkillValue("2|skim-coating")).toEqual({ index: 2, slug: "skim-coating" });
    expect(formatFragmentSkillValue({ index: 2, slug: "skim-coating" })).toBe("2|skim-coating");
    expect(parseFragmentSkillValue("0|tiling")).toBeNull();
    expect(parseFragmentSkillValue("x|tiling")).toBeNull();
    expect(parseFragmentSkillValue("1|not a slug!")).toBeNull();
    expect(parseFragmentSkillValue("1|")).toBeNull();
    expect(parseFragmentSkillValue(null)).toBeNull();
  });

  it("groups an entry's rows by fragment index and ignores other metrics", () => {
    const m = fragmentSkillsByIndex([
      { metric_slug: FRAGMENT_SKILL_METRIC_SLUG, value_text: "1|tiling" },
      { metric_slug: FRAGMENT_SKILL_METRIC_SLUG, value_text: "1|tiling" },
      { metric_slug: FRAGMENT_SKILL_METRIC_SLUG, value_text: "2|skim-coating" },
      { metric_slug: FRAGMENT_SKILL_METRIC_SLUG, value_text: "broken" },
      { metric_slug: "fragment_activity", value_text: "1|tiler" },
    ]);
    expect([...m.get(1)!]).toEqual(["tiling"]);
    expect([...m.get(2)!]).toEqual(["skim-coating"]);
    expect(m.size).toBe(2);
  });

  it("parses persisted fragments in index order, first row per index wins", () => {
    expect(
      parsePersistedFragments([
        { metric_slug: "parsed_fragment", value_text: "2|glaisčiau sienas 2 val" },
        { metric_slug: "parsed_fragment", value_text: "1|Klijavau plyteles 6 val" },
        { metric_slug: "parsed_fragment", value_text: "1|duplicate" },
        { metric_slug: "parsed_fragment", value_text: "|no index" },
        { metric_slug: "fragment_time", value_text: "1" },
      ]),
    ).toEqual([
      { index: 1, phrase: "Klijavau plyteles 6 val" },
      { index: 2, phrase: "glaisčiau sienas 2 val" },
    ]);
  });
});

describe("mapRecognitionToPersistedFragments — the join between the two fragmenters", () => {
  it("the production walk entry: tiling sits on fragment 1, skim-coating on fragment 2", () => {
    const text = "Klijavau plyteles 6 val., glaisčiau sienas 2 val.";
    const rec = deriveJournalRecognition(text, {
      declaredSlugs: new Set(),
      entryRejections: NO_REJECTIONS,
    });
    // Both skills are recognised EXACTLY (the "glaisč" stem — before this
    // fix "glaisčiau" only reached the fuzzy tier and stayed a candidate).
    expect(rec.recognizedSkills.map((r) => [r.slug, r.via]).sort()).toEqual([
      ["skim-coating", "exact"],
      ["tiling", "exact"],
    ]);
    const rows = mapRecognitionToPersistedFragments({
      persisted: parsePersistedFragments(persistedFor(text)),
      derivationFragments: rec.fragments,
      skills: rec.recognizedSkills,
    });
    expect(rows).toEqual([
      { index: 1, slug: "tiling" },
      { index: 2, slug: "skim-coating" },
    ]);
  });

  it("a phrase the extractor trimmed ('ir klojau laminatą') still joins by its end-anchored text", () => {
    const text = "Mūrijau sieną 5 val. ir klojau laminatą 2 val.";
    const rec = deriveJournalRecognition(text, {
      declaredSlugs: new Set(),
      entryRejections: NO_REJECTIONS,
    });
    const persisted = parsePersistedFragments(persistedFor(text));
    expect(persisted.map((p) => p.phrase)).toEqual(["Mūrijau sieną 5 val", "klojau laminatą 2 val"]);
    const rows = mapRecognitionToPersistedFragments({
      persisted,
      derivationFragments: rec.fragments,
      skills: rec.recognizedSkills,
    });
    expect(rows).toEqual([
      { index: 1, slug: "bricklaying" },
      { index: 2, slug: "flooring" },
    ]);
  });

  it("a skill recognised on NO persisted phrase yields no row (fails closed, never guesses)", () => {
    const rows = mapRecognitionToPersistedFragments({
      persisted: [{ index: 1, phrase: "Klijavau plyteles 6 val" }],
      derivationFragments: [{ id: "aaaaaaaa", normalized: "something else entirely" }],
      skills: [{ slug: "tiling", fragmentIds: ["aaaaaaaa"] }],
    });
    expect(rows).toEqual([]);
  });

  it("two persisted phrases that join to the SAME derivation fragment claim nothing (ambiguous)", () => {
    const rec = deriveJournalRecognition("Klijavau plyteles 6 val", {
      declaredSlugs: new Set(),
      entryRejections: NO_REJECTIONS,
    });
    const rows = mapRecognitionToPersistedFragments({
      persisted: [
        { index: 1, phrase: "Klijavau plyteles 6 val" },
        { index: 2, phrase: "Klijavau plyteles 6 val" },
      ],
      derivationFragments: rec.fragments,
      skills: rec.recognizedSkills,
    });
    expect(rows).toEqual([]);
  });

  it("is deterministic, duplicate-free and only emits slug-shaped values", () => {
    const rec = deriveJournalRecognition("Klijavau plyteles 6 val., glaisčiau sienas 2 val.", {
      declaredSlugs: new Set(),
      entryRejections: NO_REJECTIONS,
    });
    const persisted = parsePersistedFragments(persistedFor("Klijavau plyteles 6 val., glaisčiau sienas 2 val."));
    const a = mapRecognitionToPersistedFragments({
      persisted,
      derivationFragments: rec.fragments,
      skills: [...rec.recognizedSkills, ...rec.recognizedSkills, { slug: "bad slug!", fragmentIds: rec.fragments.map((f) => f.id) }],
    });
    const b = mapRecognitionToPersistedFragments({
      persisted: [...persisted].reverse(),
      derivationFragments: [...rec.fragments].reverse(),
      skills: [...rec.recognizedSkills].reverse(),
    });
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
  });
});

describe("recognizer coverage — the walk's missed form", () => {
  it("'glaisčiau sienas' (with and without diacritics) is an EXACT skim-coating match, not a fuzzy candidate", () => {
    for (const text of ["glaisčiau sienas 2 val.", "glaisciau sienas 2 val", "Glaisčiau lubas 3 val"]) {
      const hit = recognizeSkills(text, 8).find((r) => r.slug === "skim-coating");
      expect(hit, text).toBeDefined();
      expect(hit!.via, text).toBe("exact");
    }
  });
});
