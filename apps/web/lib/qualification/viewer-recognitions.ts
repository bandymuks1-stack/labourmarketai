import { createClient } from "@/lib/supabase/server";
import {
  RECOGNITION_EVIDENCE_CLASS,
  type RecognisedByItem,
} from "@/lib/qualification/recognised-by-view";

/**
 * COMPANY-SIDE READ of a person's skill / profession recognitions.
 *
 * Goes through `worker_recognitions_for_viewer_v1`, which answers only for a
 * worker the caller may ALREADY VIEW (`can_view_worker`) and returns only
 * current, positive, un-revoked skill / profession decisions. RLS on the table
 * itself is unchanged. Evidence class `assessor_recognition`: not
 * worker-verified, not a score; no ranking reads this (guard:
 * recognition-is-not-a-score).
 *
 * The function is a RED migration (draft, not applied). Where it is absent
 * (42883 / PGRST202) the answer is `[]` - the surface simply does not appear.
 * Any other failure is `null` (unknown), which also renders nothing: an
 * unreadable register is never turned into a claim in either direction.
 */
export async function getViewerRecognisedByItems(
  workerId: string,
): Promise<readonly RecognisedByItem[] | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase as any).rpc("worker_recognitions_for_viewer_v1", { p_worker_id: workerId });
  if (res.error) {
    const code = (res.error as { code?: string }).code;
    return code === "42883" || code === "PGRST202" ? [] : null;
  }
  return mapViewerRecognitionRows((res.data ?? []) as Record<string, unknown>[]);
}

export function mapViewerRecognitionRows(data: readonly Record<string, unknown>[]): RecognisedByItem[] {
  return data
    .filter((r) => r.requirement_kind === "skill" || r.requirement_kind === "profession")
    .map((r) => ({
      id: r.id as string,
      kind: r.requirement_kind as "skill" | "profession",
      key: r.requirement_key as string,
      institutionName: (r.assessor_name as string | null) ?? null,
      validUntil: (r.valid_until as string | null) ?? null,
      evidenceClass: RECOGNITION_EVIDENCE_CLASS,
    }));
}
