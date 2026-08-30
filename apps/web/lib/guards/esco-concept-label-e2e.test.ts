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
 * write).
 *
 * Chain proven here, with POLISH — a catalog-only locale (not routed, not
 * LT/EN/RU) whose needle pack does NOT contain these expressions:
 *
 *   natural PL expression
 *     → official ESCO v1.2.1 preferred label (prod esco_labels, 2026-08-30)
 *     → canonical LabourMarket skill slug
 *          (the link recorded in docs/taxonomy/esco-mapping-dryrun-2026-08-30.json)
 *     → the REAL recognizer through the seam's DATA path (no code per language)
 *     → the REAL matching engine (computeContextFit).
 *
 * What this deliberately does NOT do:
 *   - It does not ship the PL label set into runtime sources — the fixture is
 *     injected the same way the seam guard injects its synthetic language.
 *     Shipping ESCO label data for real is the step-3 slice, after the owner
 *     reviews the mapping artifact.
 *   - It does not activate the `pl` locale anywhere (routing untouched).
 *   - It does not weaken the fast path: the PL pack keeps answering for the
 *     expressions it already covers.
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

function artifactRows(): readonly ArtifactRow[] {
  const parsed = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as {
    skills: ArtifactRow[];
    professions: ArtifactRow[];
  };
  return [...parsed.skills, ...parsed.professions];
}

/**
 * The proof concepts. Every label is an OFFICIAL ESCO preferred label copied
 * verbatim from prod `esco_labels` (locale `pl`, verified 2026-08-30), and
 * every slug ↔ esco_uri pair must be recorded EXACT or HIGH_CONFIDENCE in the
 * mapping artifact — the test fails if the artifact and the fixture drift.
 *
 * None of these PL expressions exists in the shipped PL needle pack
 * (`lib/structuring/language-packs/pl.ts`) — that is what makes the negative
 * control meaningful.
 */
const PROOF = [
  {
    slug: "plastering",
    escoUri: "http://data.europa.eu/esco/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1",
    plLabel: "tynkować powierzchnie",
    sentence: "Umiem tynkować powierzchnie w nowych budynkach.",
  },
  {
    slug: "forklift-operation",
    escoUri: "http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da",
    plLabel: "obsługiwać podnośnik widłowy",
    sentence: "Potrafię obsługiwać podnośnik widłowy.",
  },
  {
    slug: "excavator-operator",
    escoUri: "http://data.europa.eu/esco/skill/978a76ca-0d14-43b5-a69d-1996dfeb22de",
    plLabel: "obsługiwać czerparkę",
    sentence: "Na budowie mogę obsługiwać czerparkę.",
  },
] as const;

const PL_ESCO_LABELS: ConceptLabelSet = {
  language: "pl",
  provenance:
    "guard fixture — ESCO v1.2.1 PL preferred labels (prod esco_labels, verified 2026-08-30) " +
    "for concepts mapped in docs/taxonomy/esco-mapping-dryrun-2026-08-30.json; never shipped",
  labels: Object.fromEntries(PROOF.map((p) => [p.slug, { exact: [p.plLabel] }])),
};

describe("ESCO PL labels — the mapping artifact is the source of the fixture", () => {
  it("every proof pair is recorded EXACT or HIGH_CONFIDENCE in the dry-run artifact", () => {
    const rows = artifactRows();
    for (const p of PROOF) {
      const row = rows.find(
        (r) => r.type === "skill" && r.labourmarket_canonical_slug === p.slug,
      );
      expect(row, `${p.slug} missing from artifact`).toBeDefined();
      expect(row?.esco_uri, `${p.slug} artifact esco_uri`).toBe(p.escoUri);
      expect(["EXACT", "HIGH_CONFIDENCE"], `${p.slug} confidence`).toContain(row?.confidence);
    }
  });

  it("the PL label data may only express seeded concepts, never invent one", () => {
    expect(unseededSlugsIn(labelSetSource([PL_ESCO_LABELS]))).toEqual([]);
  });

  it("label data never joins the fuzzy tier", () => {
    expect(labelSetSource([PL_ESCO_LABELS]).terms().every((t) => !t.fuzzyEligible)).toBe(true);
  });
});

describe("ESCO PL labels — end-to-end through the real recognizer and matcher", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("NEGATIVE CONTROL: without the ESCO data, none of the PL expressions resolves its concept", async () => {
    const fresh = await import("@/lib/structuring/concept-resolution");
    for (const p of PROOF) {
      const got = fresh.resolveExpressionToConcepts(p.sentence, { limit: 8 }).map((c) => c.slug);
      expect(got, `"${p.sentence}" must not resolve ${p.slug} without data`).not.toContain(p.slug);
    }
  });

  it("with the ESCO PL labels as DATA, the real recognizer resolves every expression", async () => {
    vi.doMock("@/lib/structuring/concept-resolution/labels", () => ({
      KA_LABELS: { language: "ka", provenance: "test", labels: {} },
      CONCEPT_LABEL_SETS: [PL_ESCO_LABELS],
    }));
    const { resolveExpressionToConcepts: resolveWithData } = await import(
      "@/lib/structuring/concept-resolution"
    );

    for (const p of PROOF) {
      const got = resolveWithData(p.sentence, { limit: 8 });
      const hit = got.find((c) => c.slug === p.slug);
      expect(hit, `"${p.sentence}" should resolve ${p.slug}`).toBeDefined();
      expect(hit?.tier).toBe("exact");
      expect(hit?.resolver).toBe("lexicon");
    }

    vi.doUnmock("@/lib/structuring/concept-resolution/labels");
  });

  it("a PL employer need reaches the real matching engine on canonical slugs", async () => {
    vi.doMock("@/lib/structuring/concept-resolution/labels", () => ({
      KA_LABELS: { language: "ka", provenance: "test", labels: {} },
      CONCEPT_LABEL_SETS: [PL_ESCO_LABELS],
    }));
    const { resolveExpressionToConcepts: resolveWithData } = await import(
      "@/lib/structuring/concept-resolution"
    );

    const need =
      "Potrzebujemy pracownika: tynkować powierzchnie, obsługiwać podnośnik widłowy.";
    const needSlugs = resolveWithData(need, { limit: 8 }).map((c) => c.slug);
    expect(needSlugs).toContain("plastering");
    expect(needSlugs).toContain("forklift-operation");

    // The REAL fit engine, keyed on the same canonical slugs the recognizer
    // emitted — no ESCO URI needed anywhere downstream (PR4 invariant holds).
    const fit = computeContextFit(needSlugs, [
      { uri: "plastering", verified: true },
      { uri: "forklift-operation", verified: false },
    ]);
    expect(fit).not.toBeNull();
    expect(fit?.pct).toBe(100);
    expect(fit?.matchedTotal).toBe(needSlugs.length);
    expect(fit?.matchedConfirmed).toBe(1);
    expect(fit?.matchedConfirmedUris).toEqual(["plastering"]);

    vi.doUnmock("@/lib/structuring/concept-resolution/labels");
  });
});
