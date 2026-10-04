import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseEntryDetail,
  parseEntryReviewStates,
  parseLinkCandidates,
  parseQueueRows,
  type EntryDetail,
  type EntryReviewState,
  type LinkCandidate,
  type QueueRow,
} from "./counterparty-review-model";

/**
 * COUNTERPARTY REVIEW - the READ side (EVID-2 slice 2).
 *
 * Every read goes through a SECURITY DEFINER door that re-derives the caller
 * (`auth.uid()`) and answers only for the party that holds authority:
 *
 *   entry_review_states_v1               the SUBJECT's own entries
 *   list_counterparty_link_candidates_v1 the PROJECT's own representative
 *   list_counterparty_review_queue_v1    the COUNTERPARTY's submitted entries
 *   counterparty_review_entry_detail_v1  ONE submitted entry, counterparty only
 *
 * `journal_entries` RLS is NOT widened: a submission is the explicit grant.
 * A failed read is UNKNOWN, never "empty": every reader returns `null` on an
 * error (including the function not being applied yet) so a surface can say
 * "could not load" instead of "nothing to review".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const STATE_CHUNK = 200;

/** The subject's review state per entry id. `null` = unreadable. */
export async function readEntryReviewStates(
  supabase: Db,
  entryIds: readonly string[],
): Promise<Map<string, EntryReviewState> | null> {
  const ids = [...new Set(entryIds)];
  const out = new Map<string, EntryReviewState>();
  if (ids.length === 0) return out;
  try {
    for (let i = 0; i < ids.length; i += STATE_CHUNK) {
      const { data, error } = await supabase.rpc("entry_review_states_v1", {
        p_entry_ids: ids.slice(i, i + STATE_CHUNK),
      });
      if (error) return null;
      for (const [k, v] of parseEntryReviewStates(data)) out.set(k, v);
    }
    return out;
  } catch {
    return null;
  }
}

/** Workers with a real relationship on the project + their active link. */
export async function readLinkCandidates(
  supabase: Db,
  projectId: string,
): Promise<LinkCandidate[] | null> {
  try {
    const { data, error } = await supabase.rpc("list_counterparty_link_candidates_v1", {
      p_project_id: projectId,
    });
    if (error) return null;
    return parseLinkCandidates(data);
  } catch {
    return null;
  }
}

/** The counterparty's queue (submitted entries, any decision state). */
export async function readCounterpartyQueue(supabase: Db): Promise<QueueRow[] | null> {
  try {
    const { data, error } = await supabase.rpc("list_counterparty_review_queue_v1");
    if (error) return null;
    return parseQueueRows(data);
  } catch {
    return null;
  }
}

export interface SignedPhoto {
  readonly id: string;
  readonly fileName: string;
  /** Short-lived URL, or null when signing was unavailable (named honestly). */
  readonly signedUrl: string | null;
}

export interface CounterpartyEntryView {
  readonly detail: EntryDetail;
  readonly photos: readonly SignedPhoto[];
}

const SIGNED_URL_TTL_SECONDS = 60 * 30;
const MAX_PHOTOS = 8;

/**
 * ONE submitted entry as the counterparty may read it. The database door
 * answers `null` for anybody without counterparty authority over THIS entry.
 * The photo files are signed under the CALLER'S OWN session: the private
 * bucket carries one extra SELECT policy (counterparty_can_read_photo_v1,
 * 20261003150550) that opens exactly the uploaded photos of entries submitted
 * to a party the caller represents. No service role is involved; the URLs are
 * short-lived and never public, and a revoked link stops signing at once.
 */
export async function readCounterpartyEntryView(
  supabase: Db,
  entryId: string,
): Promise<CounterpartyEntryView | null> {
  let detail: EntryDetail | null = null;
  try {
    const { data, error } = await supabase.rpc("counterparty_review_entry_detail_v1", {
      p_entry_id: entryId,
    });
    if (error) return null;
    detail = parseEntryDetail(data);
  } catch {
    return null;
  }
  if (!detail) return null;

  const shown = detail.photos.slice(0, MAX_PHOTOS);
  const urlByPath = new Map<string, string>();
  if (shown.length > 0) {
    try {
      const { data: signed } = await supabase.storage
        .from("journal-entry-photos")
        .createSignedUrls(
          shown.map((p) => p.storagePath),
          SIGNED_URL_TTL_SECONDS,
        );
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }
    } catch {
      // unsigned: the card names the file without a picture
    }
  }
  return {
    detail,
    photos: shown.map((p) => ({
      id: p.id,
      fileName: p.fileName,
      signedUrl: urlByPath.get(p.storagePath) ?? null,
    })),
  };
}
