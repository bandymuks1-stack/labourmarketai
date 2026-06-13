/**
 * Unknown-phrase improvement loop (Work Journal Text-to-Skill Recognition v1,
 * Layer F) — pure, read-only.
 *
 * "Unknown" must be an active improvement loop, not a dead end (owner). This
 * runs the deterministic recognizer over a set of worker phrases and buckets
 * them so we can see WHICH phrases the dictionaries miss and improve them. It
 * NEVER writes to the DB and NEVER invents a skill — it only reports.
 *
 * Input phrases can come from the existing `journal_entry_metrics`
 * `unknown_phrase` rows (exported to a file) and/or a sample corpus. This module
 * is the tested core; the runtime report writer is scripts/recognition-unknown-report.ts.
 */
import { recognizeSkills, type SkillConfidence } from "./skill-recognition";
import { foldText } from "./normalize";

export type PhraseBucket = "recognized" | "weak" | "unknown";

export interface PhraseOutcome {
  readonly phrase: string;
  readonly bucket: PhraseBucket;
  readonly topConfidence: SkillConfidence | "none";
  readonly slugs: readonly string[];
}

export interface UnknownReport {
  readonly total: number;
  readonly recognized: number;
  readonly weak: number;
  readonly unknown: number;
  readonly outcomes: readonly PhraseOutcome[];
  /** Distinct unknown phrases by frequency — the dictionary-improvement list. */
  readonly unknownByFrequency: ReadonlyArray<{ phrase: string; count: number }>;
}

function classify(phrase: string): PhraseOutcome {
  const skills = recognizeSkills(phrase);
  if (skills.length === 0) {
    return { phrase, bucket: "unknown", topConfidence: "none", slugs: [] };
  }
  const hasStrong = skills.some(
    (s) => s.confidence === "high" || s.confidence === "medium",
  );
  const top = skills[0].confidence;
  return {
    phrase,
    bucket: hasStrong ? "recognized" : "weak",
    topConfidence: top,
    slugs: skills.map((s) => s.slug),
  };
}

/**
 * Summarise recognition over a list of phrases. Pure + deterministic; unknown
 * phrases are grouped (folded) by frequency, highest first, so dictionary work
 * targets the most common gaps.
 */
export function summarizeRecognition(
  phrases: readonly string[],
): UnknownReport {
  const outcomes = phrases
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(classify);

  const counts = new Map<string, { phrase: string; count: number }>();
  for (const o of outcomes) {
    if (o.bucket !== "unknown") continue;
    const key = foldText(o.phrase);
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { phrase: o.phrase, count: 1 });
  }
  const unknownByFrequency = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase),
  );

  return {
    total: outcomes.length,
    recognized: outcomes.filter((o) => o.bucket === "recognized").length,
    weak: outcomes.filter((o) => o.bucket === "weak").length,
    unknown: outcomes.filter((o) => o.bucket === "unknown").length,
    outcomes,
    unknownByFrequency,
  };
}
