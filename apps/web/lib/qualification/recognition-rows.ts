import type { RecognitionRow } from "@/lib/skills/recognition-model";

/**
 * The columns `competency_recognitions` is read with. ONE string, so the
 * reader and the fixtures that pin its shape cannot drift apart.
 */
export const RECOGNITION_ROW_COLUMNS =
  "id, decision, valid_from, valid_until, assessor_organization_id, requirement_kind, requirement_key, revoked_at";

/**
 * Pure mapping of a `competency_recognitions` read (snake_case, as PostgREST
 * returns it) to the model's `RecognitionRow`. No IO. The same function maps
 * the rows captured from a real rolled-back production chain walk in
 * `recognition-rows.test.ts`.
 */
export function mapRecognitionRows(data: readonly Record<string, unknown>[]): RecognitionRow[] {
  return data.map((r) => ({
    id: r.id as string,
    decision: r.decision as RecognitionRow["decision"],
    validFrom: (r.valid_from as string | null) ?? null,
    validUntil: (r.valid_until as string | null) ?? null,
    assessorOrganizationId: r.assessor_organization_id as string,
    requirementKind: r.requirement_kind as RecognitionRow["requirementKind"],
    requirementKey: r.requirement_key as string,
    revokedAt: (r.revoked_at as string | null) ?? null,
  }));
}
