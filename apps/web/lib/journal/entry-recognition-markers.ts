/**
 * The entry's append-only recognition MARKERS, read from its metric rows —
 * ONE pure reader (issue #1689, 2026-09-12).
 *
 * The pipeline (`skill-pipeline.ts`, server-only) and the confirm / reject
 * trust boundary read these markers before every derivation so a rejected
 * skill is never resurrected and a resolved ambiguity is never re-offered.
 * The journal page now reads them too, at render time, so a saved entry's
 * PENDING candidates can be decided from the entry card — not only in the
 * minute after the save. Before, the reader lived inside the server-only
 * pipeline module (`node:crypto`, `next/cache`), where a render-time caller
 * could not reach it; this module has no IO and no server import, so both
 * sides read the same switch.
 *
 * Nothing here decides anything: it turns rows into the sets the derivation
 * takes. Marker VALUES are never invented — a malformed row is skipped.
 */
import { normalizeClaimLabel } from "@/lib/profile/skill-claim-extractor";
import {
  FRAGMENT_SKILL_METRIC_SLUG,
  formatFragmentSkillValue,
  parseFragmentSkillValue,
} from "@/lib/journal/fragment-skill-evidence";

export const ENTRY_MARKER_SLUGS = {
  skillRejected: "skill_rejected",
  claimRejected: "skill_claim_rejected",
  claim: "skill_claim",
  unresolvedFragment: "unresolved_fragment",
  unresolvedDismissed: "unresolved_dismissed",
  pipelineVersion: "pipeline_version",
  /** Worker's ambiguity decision (P2 integrity fix): entry-scoped,
   *  append-only. value_text = `<normalized candidate label>=><chosen slug>`,
   *  value_numeric = pipeline version at decision time, source =
   *  worker_input (the worker's own decision on their own entry). The
   *  derivation reads it so a resolved ambiguity is never re-offered on
   *  reprocess/restore/upgrade — and a decision on one entry can never
   *  leak into another (entry_id scoped). */
  ambiguousResolved: "ambiguous_resolved",
} as const;

export function parseAmbiguousResolvedMarker(
  valueText: string,
): { normalizedLabel: string; slug: string } | null {
  const idx = valueText.indexOf("=>");
  if (idx <= 0) return null;
  const normalizedLabel = valueText.slice(0, idx).trim();
  const slug = valueText.slice(idx + 2).trim();
  if (!normalizedLabel || !slug) return null;
  return { normalizedLabel, slug };
}

export type EntryMarkerRow = {
  metric_slug: string | null;
  value_text: string | null;
  value_numeric: number | null;
};

export type EntryRecognitionMarkers = {
  /** Slugs the worker rejected on THIS entry (`skill_rejected`). */
  rejectedSlugs: Set<string>;
  /** Normalized claim labels the worker rejected (`skill_claim_rejected`). */
  rejectedClaims: Set<string>;
  /** Normalized labels already saved as `skill_claim` rows. */
  existingClaimSet: Set<string>;
  /** Normalized texts already saved as `unresolved_fragment` rows. */
  existingUnresolvedSet: Set<string>;
  /** Normalized texts the worker dismissed (`unresolved_dismissed`). */
  dismissedUnresolvedSet: Set<string>;
  /** Ambiguity decisions: normalized candidate label → chosen slug. */
  entryResolutions: Map<string, string>;
  /** `fragment_skill` values (`"<index>|<slug>"`) already on the entry. */
  existingFragmentSkillSet: Set<string>;
  /** Latest `pipeline_version` on the entry (0 when absent). */
  latestPipelineVersion: number;
};

/** Read every recognition marker of one entry from its metric rows. */
export function readEntryRecognitionMarkers(
  rows: readonly EntryMarkerRow[],
): EntryRecognitionMarkers {
  const out: EntryRecognitionMarkers = {
    rejectedSlugs: new Set(),
    rejectedClaims: new Set(),
    existingClaimSet: new Set(),
    existingUnresolvedSet: new Set(),
    dismissedUnresolvedSet: new Set(),
    entryResolutions: new Map(),
    existingFragmentSkillSet: new Set(),
    latestPipelineVersion: 0,
  };
  for (const r of rows) {
    switch (r.metric_slug) {
      case FRAGMENT_SKILL_METRIC_SLUG: {
        const parsed = parseFragmentSkillValue(r.value_text);
        if (parsed) out.existingFragmentSkillSet.add(formatFragmentSkillValue(parsed));
        break;
      }
      case ENTRY_MARKER_SLUGS.skillRejected:
        if (r.value_text) out.rejectedSlugs.add(r.value_text.trim());
        break;
      case ENTRY_MARKER_SLUGS.claimRejected:
        if (r.value_text) out.rejectedClaims.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.claim:
        if (r.value_text) out.existingClaimSet.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.unresolvedFragment:
        if (r.value_text)
          out.existingUnresolvedSet.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.unresolvedDismissed:
        if (r.value_text)
          out.dismissedUnresolvedSet.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.ambiguousResolved: {
        const parsed = r.value_text
          ? parseAmbiguousResolvedMarker(r.value_text)
          : null;
        if (parsed) {
          out.entryResolutions.set(
            normalizeClaimLabel(parsed.normalizedLabel),
            parsed.slug,
          );
        }
        break;
      }
      case ENTRY_MARKER_SLUGS.pipelineVersion:
        if (
          typeof r.value_numeric === "number" &&
          r.value_numeric > out.latestPipelineVersion
        ) {
          out.latestPipelineVersion = r.value_numeric;
        }
        break;
    }
  }
  return out;
}
