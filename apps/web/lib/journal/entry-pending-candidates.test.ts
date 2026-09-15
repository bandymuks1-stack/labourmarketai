import { describe, expect, it } from "vitest";
import { pendingEntryCandidates } from "./entry-pending-candidates";
import {
  ENTRY_MARKER_SLUGS,
  readEntryRecognitionMarkers,
} from "./entry-recognition-markers";
import { deriveJournalRecognition } from "./journal-recognition";

/**
 * A SAVED entry's pending candidates are decidable on its card (#1689,
 * 2026-09-12). These are the ONE derivation's `fuzzy_skill` rows over the
 * saved text and the entry's own markers — exactly what the decision actions
 * accept — so the card can never offer something the server would refuse.
 */

// The owner's own sentence: programming + partnership-development are
// recognized; "2 val. testavau" is the catalogue's OFFER (a fuzzy candidate).
const OWNER_SENTENCE =
  "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau, 2 val. ieškojau partnerių";

const NAMES: Record<string, string> = {
  "qa-testing": "Programinės įrangos testavimas",
  programming: "Programavimas",
};
const nameOf = (slug: string): string | null => NAMES[slug] ?? null;

describe("pendingEntryCandidates — the saved entry's decidable offers", () => {
  it("returns the derivation's fuzzy candidates with their localized names, nothing else", () => {
    const got = pendingEntryCandidates({
      text: OWNER_SENTENCE,
      metrics: [],
      declaredSlugs: new Set(),
      linkedSlugs: new Set(),
      skillNameOf: nameOf,
    });
    expect(got).toEqual([{ slug: "qa-testing", name: "Programinės įrangos testavimas" }]);
    // the same rows the server's own derivation would accept
    const derived = deriveJournalRecognition(OWNER_SENTENCE, {
      declaredSlugs: new Set(),
      entryRejections: { slugs: new Set(), claimLabels: new Set() },
    });
    expect(
      derived.candidates.filter((c) => c.kind === "fuzzy_skill").map((c) => c.slug),
    ).toEqual(["qa-testing"]);
  });

  it("a candidate the worker REJECTED on this entry is never offered again", () => {
    const got = pendingEntryCandidates({
      text: OWNER_SENTENCE,
      metrics: [
        { metric_slug: ENTRY_MARKER_SLUGS.skillRejected, value_text: "qa-testing", value_numeric: null },
      ],
      declaredSlugs: new Set(),
      linkedSlugs: new Set(),
      skillNameOf: nameOf,
    });
    expect(got).toEqual([]);
  });

  it("a candidate already LINKED to this entry is moot; a declared-but-unlinked one is still the catalogue's offer for these hours (lane 4b)", () => {
    expect(
      pendingEntryCandidates({
        text: OWNER_SENTENCE,
        metrics: [],
        declaredSlugs: new Set(["qa-testing"]),
        linkedSlugs: new Set(["qa-testing"]),
        skillNameOf: nameOf,
      }),
    ).toEqual([]);
    expect(
      pendingEntryCandidates({
        text: OWNER_SENTENCE,
        metrics: [],
        declaredSlugs: new Set(["qa-testing"]),
        linkedSlugs: new Set(),
        skillNameOf: nameOf,
      }),
    ).toEqual([{ slug: "qa-testing", name: "Programinės įrangos testavimas" }]);
  });

  it("a slug with no localized name is skipped — a raw slug never reaches the card", () => {
    const got = pendingEntryCandidates({
      text: OWNER_SENTENCE,
      metrics: [],
      declaredSlugs: new Set(),
      linkedSlugs: new Set(),
      skillNameOf: () => null,
    });
    expect(got).toEqual([]);
  });

  it("empty text → nothing", () => {
    expect(
      pendingEntryCandidates({
        text: "   ",
        metrics: null,
        declaredSlugs: new Set(),
        linkedSlugs: new Set(),
        skillNameOf: nameOf,
      }),
    ).toEqual([]);
  });
});

describe("readEntryRecognitionMarkers — the ONE reader of an entry's markers", () => {
  it("reads every marker kind, skips malformed rows, keeps the latest pipeline version", () => {
    const m = readEntryRecognitionMarkers([
      { metric_slug: "skill_rejected", value_text: " tiling ", value_numeric: null },
      { metric_slug: "skill_claim_rejected", value_text: "Sienų Glaistymas", value_numeric: null },
      { metric_slug: "skill_claim", value_text: "Lazerinis nivelyras", value_numeric: null },
      { metric_slug: "unresolved_fragment", value_text: "testavau", value_numeric: null },
      { metric_slug: "unresolved_dismissed", value_text: "kažkas", value_numeric: null },
      { metric_slug: "ambiguous_resolved", value_text: "kranas=>crane-operation", value_numeric: 2 },
      { metric_slug: "ambiguous_resolved", value_text: "malformed", value_numeric: 2 },
      { metric_slug: "fragment_skill", value_text: "1|programming", value_numeric: null },
      { metric_slug: "fragment_skill", value_text: "garbage", value_numeric: null },
      { metric_slug: "pipeline_version", value_text: null, value_numeric: 1 },
      { metric_slug: "pipeline_version", value_text: null, value_numeric: 2 },
      { metric_slug: "work_date", value_text: "2026-09-10", value_numeric: null },
    ]);
    expect([...m.rejectedSlugs]).toEqual(["tiling"]);
    expect(m.rejectedClaims.size).toBe(1);
    expect(m.existingClaimSet.size).toBe(1);
    expect(m.existingUnresolvedSet.size).toBe(1);
    expect(m.dismissedUnresolvedSet.size).toBe(1);
    expect([...m.entryResolutions.entries()]).toEqual([["kranas", "crane-operation"]]);
    expect([...m.existingFragmentSkillSet]).toEqual(["1|programming"]);
    expect(m.latestPipelineVersion).toBe(2);
  });
});
