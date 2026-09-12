/**
 * Render-time detected skill signals for an EXISTING journal entry
 * (owner smoke follow-up 2026-07-02, fix/journal-skills-manual-picker-ux).
 *
 * Recognition used to be compose-time only: suggestions were shown once in the
 * composer and discarded, so an entry saved before a lexicon fix (or whose
 * detected skills are outside the worker's declared set) rendered a card with
 * ZERO detected skills — the manual profile-skill picker became the de-facto
 * default content. This helper re-runs the SAME pure recognition pipeline the
 * composer uses (`classifyEntryRecognition` → `extractJournalSuggestions`)
 * over the saved entry text at render time. Pure + deterministic, NO DB write,
 * NO auto-attach — the output is display-only suggestions plus the exact
 * recognized-slug set the stale-link classifier (`buildEntrySkillSources`)
 * already consumes, so one computation serves both.
 */
import { classifyEntryRecognition } from "@/lib/structuring/recognition-tiers";
import { localizeCapabilityLabel } from "@/lib/structuring/capability-labels";

/** Cap the recognizer input for very long saved entries. The pipeline is a
 *  linear lexicon scan, but the entry card renders in a list of many entries,
 *  so we bound the per-entry work; real journal entries are far shorter. */
export const ENTRY_RECOGNITION_TEXT_CAP = 4000;

export interface EntryDetectedSignals {
  /** Detected skills the worker has DECLARED on their profile (id + localized
   *  name). These can reuse the existing per-entry link-toggle affordance —
   *  the worker may associate them by hand; nothing is auto-attached. */
  readonly skills: { id: string; name: string }[];
  /** Display-only detected labels grounded in THIS entry's text: capability /
   *  activity labels (localized) + recognized taxonomy skills the worker has
   *  NOT declared. Suggestions, never facts. */
  readonly labels: string[];
  /** Recognized taxonomy slugs — feed `buildEntrySkillSources` so the stale
   *  classification and the detected section come from ONE computation. */
  readonly recognizedSlugs: ReadonlySet<string>;
}

export function buildEntryDetectedSignals(input: {
  /** The entry's saved original text. */
  text: string;
  /** UI locale — capability labels localize through the existing map. */
  locale: string;
  /** The worker's declared profile skills (id + localized name + slug). */
  declaredSkills: readonly { id: string; name: string; slug: string }[];
  /** Localized taxonomy name for a recognized slug the worker has NOT
   *  declared; return null to skip (never leak a raw slug into the UI). */
  skillNameOf?: (slug: string) => string | null;
}): EntryDetectedSignals {
  const text = (input.text ?? "").slice(0, ENTRY_RECOGNITION_TEXT_CAP);
  const recognition = classifyEntryRecognition(text);
  const recognizedSlugs = new Set(recognition.autoSignalSlugs);

  const declaredBySlug = new Map(input.declaredSkills.map((s) => [s.slug, s]));
  const skills: { id: string; name: string }[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const slug of recognition.autoSignalSlugs) {
    const declared = declaredBySlug.get(slug);
    if (declared) {
      if (!seen.has(declared.name)) {
        seen.add(declared.name);
        skills.push({ id: declared.id, name: declared.name });
      }
      continue;
    }
    const name = input.skillNameOf?.(slug) ?? null;
    if (name && !seen.has(name)) {
      seen.add(name);
      labels.push(name);
    }
  }

  for (const ltLabel of recognition.autoCapabilityLabels) {
    const display = localizeCapabilityLabel(ltLabel, input.locale);
    if (display && !seen.has(display)) {
      seen.add(display);
      labels.push(display);
    }
  }

  return { skills, labels, recognizedSlugs };
}

/**
 * What Section A ("skills recognized from this entry") may say once the
 * linked chips above it have been taken out of the detected set.
 *
 *   chips       — something recognized is NOT yet linked: show it (linkable
 *                 declared skill / display-only label), or the entry has a
 *                 CANDIDATE the worker decides on the card (#1689,
 *                 2026-09-12: decidable here now, not only right after the
 *                 save) — an offer is recognition waiting on a person, never
 *                 "nothing recognized".
 *   all_linked  — recognition DID read this entry, and every recognized skill
 *                 already sits in the linked list above. Saying "nothing was
 *                 recognized" here would be false: measured on production
 *                 2026-09-12 (build 5e5c2aaf, QA worker) four of six entry
 *                 cards — tiling entries whose pipeline rows read `1|tiling` —
 *                 said "Iš šio įrašo teksto įgūdžių atpažinti nepavyko".
 *   none        — the recognizer read nothing from the text (a manual link may
 *                 still exist above; that is not recognition).
 *
 * Pure, so the component and its guard read ONE rule.
 */
export type DetectedSectionState = "chips" | "all_linked" | "none";

export function detectedSectionState(input: {
  /** Detected skills the worker has declared (`EntryDetectedSignals.skills`). */
  detectedSkills: readonly { id: string; name: string }[];
  /** Display-only detected labels (`EntryDetectedSignals.labels`). */
  detectedLabels: readonly string[];
  /** Skill ids currently linked to the entry (live client state). */
  selectedIds: ReadonlySet<string>;
  /** Names of the linked chips rendered above Section A. */
  linkedNames: ReadonlySet<string>;
  /** Names of this entry's candidates — pending or decided on this card.
   *  Their rows carry their own result ("✓ Pridėta" / "Atmesta"), so while
   *  any exist Section A shows them and never a sentence beneath them; a
   *  display-only label that names a candidate is the candidate, not a
   *  second signal. */
  candidateNames?: ReadonlySet<string>;
}): DetectedSectionState {
  if ((input.candidateNames?.size ?? 0) > 0) return "chips";
  const unlinkedSkills = input.detectedSkills.filter(
    (s) => !input.selectedIds.has(s.id),
  );
  const unlinkedLabels = input.detectedLabels.filter(
    (l) =>
      !input.linkedNames.has(l) &&
      !unlinkedSkills.some((s) => s.name === l) &&
      !(input.candidateNames?.has(l) ?? false),
  );
  if (unlinkedSkills.length > 0 || unlinkedLabels.length > 0) return "chips";
  const anyRecognized =
    input.detectedSkills.length > 0 || input.detectedLabels.length > 0;
  return anyRecognized ? "all_linked" : "none";
}
