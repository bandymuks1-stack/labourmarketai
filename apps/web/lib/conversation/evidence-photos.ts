"use server";

import "server-only";

import {
  getPersonalGallery,
  type PersonalGalleryPhoto,
} from "@/lib/journal/personal-gallery";
import { createClient } from "@/lib/supabase/server";

/**
 * "PARODYK ĮKELTĄ NUOTRAUKĄ, AR TIKRAI IŠSISAUGOJO" — the photo the person
 * just put in their journal, shown back in the chat (issue #1689, defect G).
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────
 * A worker uploaded a work photo in the journal (saved, receipt shown), then
 * asked the chat to show it. The deterministic router had no photo / file /
 * gallery vocabulary at all, so the sentence scored 0; the proposer then
 * picked the nearest CV door and the chat answered that the CV was empty —
 * "nothing uploaded" — about a photo that WAS persisted.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────
 * A THIN ADAPTER over the ONE personal-gallery read (`getPersonalGallery`,
 * F13): the same `journal_entry_photos` rows under the same owner-scoped
 * RLS, the same private bucket, the same short-lived signed URLs, the same
 * honest `previewsUnavailable`. No second query, no new table, no new
 * bucket. It only bounds the list to the few most recent photos the chat
 * can show and names the states the chat must answer differently:
 *
 *   ok        — photos exist; show them, say how many
 *   none      — no stored photo was FOUND (the gallery read collapses a
 *               failed read into an empty list, so the chat copy for this
 *               state must say "found none", never "nothing uploaded")
 *   no-worker — the account has no worker record, so it has no journal
 *               and therefore no photo could have been stored
 *
 * It never fabricates a photo and never claims verification of anything.
 */

export const CHAT_PHOTO_LIMIT = 3;

export type EvidencePhotosRead =
  | {
      readonly kind: "ok";
      readonly photos: readonly PersonalGalleryPhoto[];
      /** Every row is stored but not one preview URL could be minted. */
      readonly previewsUnavailable: boolean;
      /** How many stored photos the gallery holds in total (bounded by the
       *  gallery's own limit) — so the chat can say "3 of 12". */
      readonly total: number;
    }
  | { readonly kind: "none" }
  | { readonly kind: "no-worker" };

export async function readRecentPhotosForChat(
  args: { readonly limit?: number } = {},
): Promise<EvidencePhotosRead> {
  const limit = Math.max(1, Math.min(args.limit ?? CHAT_PHOTO_LIMIT, 12));

  // The SAME owner-scoped worker lookup the gallery read performs itself —
  // not a second photo read. It exists only because the gallery collapses
  // "no worker record" into an empty list, and the chat must not tell an
  // account without a journal that its journal holds no photo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };
  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "no-worker" };

  const gallery = await getPersonalGallery();
  if (gallery.photos.length === 0) return { kind: "none" };

  // The gallery is already newest-first; the chat shows the head of it.
  const photos = gallery.photos.slice(0, limit);
  return {
    kind: "ok",
    photos,
    previewsUnavailable:
      gallery.previewsUnavailable || photos.every((p) => p.signedUrl === null),
    total: gallery.photos.length,
  };
}
