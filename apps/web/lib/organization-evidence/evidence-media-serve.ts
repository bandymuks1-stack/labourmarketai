import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { untypedClient } from "./evidence-store";

/**
 * SIGNED URLS FOR HISTORICAL WORK PHOTOS.
 *
 * Authority chain, all with the CALLER's OWN session (no service role):
 *   1. `organization_evidence_media` must answer under its RLS (supplying
 *      organization's managers; the linked subject only for rows marked
 *      visible to them; admin);
 *   2. a SHORT-LIVED signed URL is minted - the `evidence-media` bucket's read
 *      policy delegates to that same table RLS, so storage enforces the same
 *      predicate again at signing time.
 *
 * No public URL, no path guessing, no long-lived link. A photo whose URL could
 * not be minted (bucket not provisioned, object missing, not admitted) simply
 * has no entry in the returned map - the UI says "preview unavailable"; it is
 * never rendered as a broken image and never as "no photo".
 */
export const EVIDENCE_MEDIA_SIGNED_URL_TTL_SECONDS = 900;
const MAX_SIGN = 200;

export async function signEvidenceMediaUrls(
  caller: DomainCaller,
  mediaIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const out = new Map<string, string>();
  const ids = mediaIds.slice(0, MAX_SIGN);
  if (ids.length === 0) return out;

  const db = untypedClient(caller.supabase);
  const rows = await db
    .from("organization_evidence_media")
    .select("id, storage_bucket, storage_path")
    .in("id", [...ids]);
  if (rows.error) return out;

  const byBucket = new Map<string, { id: string; path: string }[]>();
  for (const r of (rows.data ?? []) as { id: string; storage_bucket: string; storage_path: string }[]) {
    const list = byBucket.get(r.storage_bucket) ?? [];
    list.push({ id: r.id, path: r.storage_path });
    byBucket.set(r.storage_bucket, list);
  }

  for (const [bucket, list] of byBucket) {
    try {
      const signed = await caller.supabase.storage
        .from(bucket)
        .createSignedUrls(
          list.map((l) => l.path),
          EVIDENCE_MEDIA_SIGNED_URL_TTL_SECONDS,
        );
      if (signed.error || !signed.data) continue;
      for (const s of signed.data) {
        const hit = list.find((l) => l.path === s.path);
        if (hit && s.signedUrl && !s.error) out.set(hit.id, s.signedUrl);
      }
    } catch {
      // unmintable -> absent from the map -> "preview unavailable"
    }
  }
  return out;
}
