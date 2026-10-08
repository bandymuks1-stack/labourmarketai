import type { RecognitionRow } from "@/lib/skills/recognition-model";

/**
 * Pure view-model for the subject-facing "Recognitions" block (SKL-9).
 *
 * Three honest states, never collapsed (SEP-7):
 *   - `unavailable`: the read failed (`null`) — unknown, claims nothing;
 *   - `empty`: the read succeeded and nobody has recorded a recognition
 *     (the relation is APPLIED on production, #2184; until an assessor records one this is the honest state);
 *   - `rows`: the assessor's own records, shown as what they are.
 *
 * A recognition is an independent assessor's act. It is distinct from
 * declared, evidenced and qualified (SEP-6), and nothing here ever labels a
 * row "verified".
 */
export type RecognitionItemState = "current" | "lapsed" | "not_recognised" | "revoked" | "not_yet_valid";

export interface RecognitionItem {
  readonly id: string;
  readonly requirementKind: RecognitionRow["requirementKind"];
  readonly requirementKey: string;
  readonly state: RecognitionItemState;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
}

export type RecognitionsView =
  | { readonly kind: "unavailable" }
  | { readonly kind: "empty" }
  | { readonly kind: "rows"; readonly items: readonly RecognitionItem[] };

export function deriveRecognitionsView(
  rows: readonly RecognitionRow[] | null,
  today: string,
): RecognitionsView {
  if (rows === null) return { kind: "unavailable" };
  if (rows.length === 0) return { kind: "empty" };
  const items = rows.map((r): RecognitionItem => {
    let state: RecognitionItemState;
    if (r.revokedAt !== null || r.decision === "revoked") state = "revoked";
    else if (r.decision === "not_recognised") state = "not_recognised";
    else if (r.validFrom !== null && r.validFrom > today) state = "not_yet_valid";
    else if (r.validUntil !== null && r.validUntil < today) state = "lapsed";
    else state = "current";
    return {
      id: r.id,
      requirementKind: r.requirementKind,
      requirementKey: r.requirementKey,
      state,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
    };
  });
  return { kind: "rows", items };
}
