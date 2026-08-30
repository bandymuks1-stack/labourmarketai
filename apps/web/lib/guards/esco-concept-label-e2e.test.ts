import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi, beforeEach } from "vitest";

import { computeContextFit } from "@/lib/market/fit";
import { labelSetSource } from "@/lib/structuring/concept-resolution/term-sources";
import { unseededSlugsIn } from "@/lib/structuring/concept-resolution";
import type { ConceptLabelSet } from "@/lib/structuring/concept-resolution/types";

/**
 * NON-CORE LANGUAGE E2E — ESCO labels as the concept-resolution data path
 * (LANGUAGE_MATRIX §4.1 step 3, proven at guard level before any curation
 * write). Three EU languages from different families:
 *
 *   POLISH (Slavic, catalog-only, has a needle pack — expressions chosen
 *     OUTSIDE it), GERMAN (Germanic, ACTIVE locale, has a pack — expressions
 *     outside it), SPANISH (Romance, no catalog, no pack, no code AT ALL).
 *
 * Chain proven per language:
 *   natural expression
 *     → official ESCO v1.2.1 preferred label (prod esco_labels, 2026-08-30)
 *     → canonical LabourMarket skill slug
 *          (the pair recorded EXACT/HIGH_CONFIDENCE in
 *           docs/taxonomy/esco-mapping-dryrun-2026-08-30.json — the same rows
 *           the 20260830100000 linkage migration writes)
 *     → the REAL recognizer through the seam's DATA path (no code per language)
 *     → the REAL matching engine (computeContextFit).
 *
 * What this deliberately does NOT do:
 *   - It does not ship these label sets into runtime sources — fixtures are
 *     injected the same way the seam guard injects its synthetic language.
 *   - It does not activate any locale (routing untouched).
 *   - It does not weaken the fast path: the shipped packs keep answering for
 *     the expressions they already cover (negative controls prove the chosen
 *     expressions are NOT among them).
 */

const ARTIFACT_PATH = resolve(
  process.cwd(),
  "../../docs/taxonomy/esco-mapping-dryrun-2026-08-30.json",
);

interface ArtifactRow {
  readonly type: string;
  readonly labourmarket_canonical_slug: string;
  readonly esco_uri: string | null;
  readonly confidence: string;
}

function artifactSkills(): readonly ArtifactRow[] {
  const parsed = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as {
    skills: ArtifactRow[];
  };
  return parsed.skills;
}

interface ProofCase {
  readonly slug: string;
  readonly escoUri: string;
  readonly label: string;
  readonly sentence: string;
}

/**
 * Official ESCO preferred labels copied verbatim from prod `esco_labels`
 * (verified 2026-08-30). Every slug ↔ esco_uri pair must be recorded EXACT or
 * HIGH_CONFIDENCE in the mapping artifact — the traceability test fails on
 * drift. None of these expressions exists in the shipped needle pack of its
 * language (that is what makes the negative controls meaningful).
 */
const LANGUAGE_PROOFS: Readonly<Record<string, readonly ProofCase[]>> = {
  pl: [
    {
      slug: "plastering",
      escoUri: "http://data.europa.eu/esco/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1",
      label: "tynkować powierzchnie",
      sentence: "Umiem tynkować powierzchnie w nowych budynkach.",
    },
    {
      slug: "forklift-operation",
      escoUri: "http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da",
      label: "obsługiwać podnośnik widłowy",
      sentence: "Potrafię obsługiwać podnośnik widłowy.",
    },
    {
      slug: "excavator-operator",
      escoUri: "http://data.europa.eu/esco/skill/978a76ca-0d14-43b5-a69d-1996dfeb22de",
      label: "obsługiwać czerparkę",
      sentence: "Na budowie mogę obsługiwać czerparkę.",
    },
  ],
  de: [
    {
      slug: "plastering",
      escoUri: "http://data.europa.eu/esco/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1",
      label: "Oberflächen verputzen",
      sentence: "Ich kann Oberflächen verputzen.",
    },
    {
      slug: "excavator-operator",
      escoUri: "http://data.europa.eu/esco/skill/978a76ca-0d14-43b5-a69d-1996dfeb22de",
      label: "Bagger bedienen",
      sentence: "Auf der Baustelle kann ich einen Bagger bedienen.",
    },
    {
      slug: "demolition",
      escoUri: "http://data.europa.eu/esco/skill/a68d4de0-99a3-4c26-b84a-040e706e4714",
      label: "Bauwerke abreißen",
      sentence: "Wir können alte Bauwerke abreißen.",
    },
  ],
  es: [
    {
      slug: "plastering",
      escoUri: "http://data.europa.eu/esco/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1",
      label: "enyesar superficies",
      sentence: "Puedo enyesar superficies.",
    },
    {
      slug: "forklift-operation",
      escoUri: "http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da",
      label: "manejar carretillas elevadoras",
      sentence: "Sé manejar carretillas elevadoras.",
    },
    {
      slug: "demolition",
      escoUri: "http://data.europa.eu/esco/skill/a68d4de0-99a3-4c26-b84a-040e706e4714",
      label: "demoler estructuras",
      sentence: "Puedo demoler estructuras en obra.",
    },
  ],
};

const labelSetFor = (language: string): ConceptLabelSet => ({
  language,
  provenance:
    `guard fixture — ESCO v1.2.1 ${language} preferred labels (prod esco_labels, verified 2026-08-30) ` +
    "for concepts mapped in docs/taxonomy/esco-mapping-dryrun-2026-08-30.json; never shipped",
  labels: Object.fromEntries(
    LANGUAGE_PROOFS[language].map((p) => [p.slug, { exact: [p.label] }]),
  ),
});

const ALL_SETS = Object.keys(LANGUAGE_PROOFS).map(labelSetFor);

describe("ESCO labels — fixtures are pinned to the mapping artifact (all languages)", () => {
  it("every proof pair is recorded EXACT or HIGH_CONFIDENCE in the dry-run artifact", () => {
    const rows = artifactSkills();
    for (const [lang, proofs] of Object.entries(LANGUAGE_PROOFS)) {
      for (const p of proofs) {
        const row = rows.find((r) => r.labourmarket_canonical_slug === p.slug);
        expect(row, `${lang}/${p.slug} missing from artifact`).toBeDefined();
        expect(row?.esco_uri, `${lang}/${p.slug} artifact esco_uri`).toBe(p.escoUri);
        expect(["EXACT", "HIGH_CONFIDENCE"], `${lang}/${p.slug}`).toContain(row?.confidence);
      }
    }
  });

  it("NO CROSS-NAMESPACE: every proof URI is a SKILL URI, never an occupation URI", () => {
    for (const proofs of Object.values(LANGUAGE_PROOFS)) {
      for (const p of proofs) {
        expect(p.escoUri.startsWith("http://data.europa.eu/esco/skill/"), p.escoUri).toBe(true);
      }
    }
  });

  it("the label data may only express seeded concepts, never invent one", () => {
    expect(unseededSlugsIn(labelSetSource(ALL_SETS))).toEqual([]);
  });

  it("label data never joins the fuzzy tier", () => {
    expect(labelSetSource(ALL_SETS).terms().every((t) => !t.fuzzyEligible)).toBe(true);
  });
});

describe.each(Object.keys(LANGUAGE_PROOFS))(
  "ESCO %s labels — end-to-end through the real recognizer",
  (lang) => {
    const proofs = LANGUAGE_PROOFS[lang];

    beforeEach(() => {
      vi.resetModules();
    });

    it("NEGATIVE CONTROL: without the ESCO data, no expression resolves its concept", async () => {
      const fresh = await import("@/lib/structuring/concept-resolution");
      for (const p of proofs) {
        const got = fresh.resolveExpressionToConcepts(p.sentence, { limit: 8 }).map((c) => c.slug);
        expect(got, `"${p.sentence}" must not resolve ${p.slug} without data`).not.toContain(p.slug);
      }
    });

    it("with the ESCO labels as DATA, the real recognizer resolves every expression — exactly once", async () => {
      vi.doMock("@/lib/structuring/concept-resolution/labels", () => ({
        KA_LABELS: { language: "ka", provenance: "test", labels: {} },
        CONCEPT_LABEL_SETS: [labelSetFor(lang)],
      }));
      const { resolveExpressionToConcepts: resolveWithData } = await import(
        "@/lib/structuring/concept-resolution"
      );

      for (const p of proofs) {
        const got = resolveWithData(p.sentence, { limit: 8 });
        const hits = got.filter((c) => c.slug === p.slug);
        expect(hits, `"${p.sentence}" should resolve ${p.slug}`).toHaveLength(1);
        expect(hits[0]?.tier).toBe("exact");
        expect(hits[0]?.resolver).toBe("lexicon");
        // NO DUPLICATE CANONICAL OUTPUT: no other proof concept fires on this
        // sentence, and the merged result never repeats a slug.
        const slugs = got.map((c) => c.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const other of proofs) {
          if (other.slug !== p.slug) {
            expect(slugs, `"${p.sentence}" leaked ${other.slug}`).not.toContain(other.slug);
          }
        }
      }

      vi.doUnmock("@/lib/structuring/concept-resolution/labels");
    });
  },
);

describe("ESCO labels — a foreign-language employer need reaches the real matcher", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each([
    ["pl", "Potrzebujemy pracownika: tynkować powierzchnie, obsługiwać podnośnik widłowy.", ["plastering", "forklift-operation"]],
    ["de", "Gesucht: Oberflächen verputzen und Bauwerke abreißen.", ["plastering", "demolition"]],
    ["es", "Buscamos a alguien para enyesar superficies y manejar carretillas elevadoras.", ["plastering", "forklift-operation"]],
  ] as const)("%s need → canonical slugs → computeContextFit", async (lang, need, expected) => {
    vi.doMock("@/lib/structuring/concept-resolution/labels", () => ({
      KA_LABELS: { language: "ka", provenance: "test", labels: {} },
      CONCEPT_LABEL_SETS: [labelSetFor(lang)],
    }));
    const { resolveExpressionToConcepts: resolveWithData } = await import(
      "@/lib/structuring/concept-resolution"
    );

    const needSlugs = resolveWithData(need, { limit: 8 }).map((c) => c.slug);
    for (const slug of expected) expect(needSlugs).toContain(slug);

    // The REAL fit engine, keyed on the same canonical slugs the recognizer
    // emitted — no ESCO URI needed anywhere downstream (PR4 invariant holds).
    const fit = computeContextFit(
      needSlugs,
      needSlugs.map((slug, i) => ({ uri: slug, verified: i === 0 })),
    );
    expect(fit).not.toBeNull();
    expect(fit?.pct).toBe(100);
    expect(fit?.matchedTotal).toBe(needSlugs.length);
    expect(fit?.matchedConfirmed).toBe(1);

    vi.doUnmock("@/lib/structuring/concept-resolution/labels");
  });
});
