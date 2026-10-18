import type { RecognitionRow } from "@/lib/skills/recognition-model";
import { deriveRecognitionsView } from "@/lib/qualification/recognitions-view";

/**
 * "RECOGNISED BY <institution>" - the person-facing, downstream reading of an
 * independent assessor's act (SKL-9, ARCH-2).
 *
 * EVIDENCE CLASS. A recognition is its own class: `assessor_recognition`. It
 * is NOT worker-verified (no confirmation by the work's counterparty), NOT a
 * credential (SEP-6), and NOT a score. Doctrine section 7 and SEP-6: nothing
 * here changes a confidence, a trust figure or any matching rank - this view
 * is a labelled statement of who decided what, and it is PURE and read-only.
 *
 * Only skill and profession recognitions appear here. Document-type
 * recognitions answer formal requirements and are consumed by the requirement
 * ledger (`recognitionAnswersDocumentTypes`), not by a profile.
 * Only CURRENT, positive, un-revoked decisions are shown: a lapsed, revoked or
 * negative decision is never presented as a recognition.
 */
export const RECOGNITION_EVIDENCE_CLASS = "assessor_recognition" as const;

export interface RecognisedByItem {
  readonly id: string;
  readonly kind: "skill" | "profession";
  readonly key: string;
  /** Assessing institution's name; null when it could not be read. */
  readonly institutionName: string | null;
  readonly validUntil: string | null;
  readonly evidenceClass: typeof RECOGNITION_EVIDENCE_CLASS;
}

export function deriveRecognisedByItems(
  rows: readonly RecognitionRow[] | null,
  institutionNames: Readonly<Record<string, string>>,
  today: string,
): RecognisedByItem[] {
  const view = deriveRecognitionsView(rows, today);
  if (view.kind !== "rows") return [];
  const items: RecognisedByItem[] = [];
  for (const i of view.items) {
    if (i.state !== "current") continue;
    if (i.requirementKind !== "skill" && i.requirementKind !== "profession") continue;
    const row = rows!.find((r) => r.id === i.id);
    items.push({
      id: i.id,
      kind: i.requirementKind,
      key: i.requirementKey,
      institutionName: row ? (institutionNames[row.assessorOrganizationId] ?? null) : null,
      validUntil: i.validUntil,
      evidenceClass: RECOGNITION_EVIDENCE_CLASS,
    });
  }
  return items.sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}
