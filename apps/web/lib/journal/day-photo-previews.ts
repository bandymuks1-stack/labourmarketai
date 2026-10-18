import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * THE DAY'S OWN PHOTOS, as short-lived previews.
 *
 * The same table, the same private bucket and the same signing pattern as
 * `personal-gallery.ts` — there is no second photo store. It runs under the
 * VIEWER'S session, so the owner-scoped RLS on `journal_entry_photos` and on
 * the `journal-entry-photos` bucket decides what can be read: a person gets
 * their own day's photos and nothing else. No service key, no public bucket.
 *
 * Real work evidence only. A failed read or a failed signing degrades to
 * `unavailable` / an unsigned row the UI names honestly — never a stand-in
 * picture, never generated imagery.
 */

export const DAY_PHOTO_PREVIEW_LIMIT = 8;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface DayPhotoPreview {
  readonly photoId: string;
  readonly entryId: string;
  readonly fileName: string;
  readonly signedUrl: string | null;
}

export type DayPhotoPreviews =
  | { readonly status: "ok"; readonly photos: readonly DayPhotoPreview[]; readonly total: number }
  | { readonly status: "unavailable" };

export async function readDayPhotoPreviews(
  entryIds: readonly string[],
): Promise<DayPhotoPreviews> {
  if (entryIds.length === 0) return { status: "ok", photos: [], total: 0 };
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("journal_entry_photos")
      .select("id, entry_id, file_name, storage_path, created_at")
      .in("entry_id", entryIds as string[])
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: true })
      .limit(DAY_PHOTO_PREVIEW_LIMIT + 40);
    if (error || !Array.isArray(data)) return { status: "unavailable" };

    const rows = data as {
      id: string;
      entry_id: string;
      file_name: string;
      storage_path: string;
    }[];
    const shown = rows.slice(0, DAY_PHOTO_PREVIEW_LIMIT);
    if (shown.length === 0) return { status: "ok", photos: [], total: 0 };

    const urlByPath = new Map<string, string>();
    try {
      const { data: signed } = await supabase.storage
        .from("journal-entry-photos")
        .createSignedUrls(
          shown.map((r) => r.storage_path),
          SIGNED_URL_TTL_SECONDS,
        );
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }
    } catch {
      // previews stay unsigned — the UI names the count without a picture
    }

    return {
      status: "ok",
      total: rows.length,
      photos: shown.map((r) => ({
        photoId: r.id,
        entryId: r.entry_id,
        fileName: r.file_name,
        signedUrl: urlByPath.get(r.storage_path) ?? null,
      })),
    };
  } catch {
    return { status: "unavailable" };
  }
}
