import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Personal gallery read service (F13 — galleries must be discoverable).
 *
 * The caller's OWN photo evidence across ALL their journal entries —
 * a read-only projection of the existing journal_entry_photos rows
 * (owner-scoped RLS from 20260612091000; no second photo system, no new
 * table). Previews are short-lived signed URLs on the private bucket,
 * exactly the project-gallery pattern; a mint failure degrades honestly to
 * `previewsUnavailable`, never a broken image.
 */

export const PERSONAL_GALLERY_LIMIT = 90;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const ENTRY_SNIPPET_MAX = 140;

export type PersonalGalleryPhoto = {
  photoId: string;
  entryId: string;
  entryCreatedAt: string;
  entrySnippet: string;
  /** Project the parent entry is linked to, when any. */
  projectId: string | null;
  fileName: string;
  signedUrl: string | null;
};

export type PersonalGallery = {
  photos: PersonalGalleryPhoto[];
  previewsUnavailable: boolean;
};

const EMPTY: PersonalGallery = { photos: [], previewsUnavailable: false };

type PhotoRow = {
  id: string;
  entry_id: string;
  file_name: string;
  storage_path: string;
  journal_entries: {
    id: string;
    worker_id: string;
    original_text: string;
    created_at: string;
    project_id: string | null;
  } | null;
};

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > ENTRY_SNIPPET_MAX
    ? `${clean.slice(0, ENTRY_SNIPPET_MAX - 1)}…`
    : clean;
}

/** The caller's own worker id (owner-scoped read), or null. */
async function ownWorkerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getPersonalGallery(): Promise<PersonalGallery> {
  const workerId = await ownWorkerId();
  if (!workerId) return EMPTY;

  const supabase = await createClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("journal_entry_photos")
      .select(
        "id, entry_id, file_name, storage_path, created_at, journal_entries!inner(id, worker_id, original_text, created_at, project_id, deleted_at)",
      )
      .eq("journal_entries.worker_id", workerId)
      .is("journal_entries.deleted_at", null)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: false })
      .limit(PERSONAL_GALLERY_LIMIT);
    if (error || !Array.isArray(data) || data.length === 0) return EMPTY;

    const rows = (data as PhotoRow[]).filter((r) => r.journal_entries);
    if (rows.length === 0) return EMPTY;

    const paths = rows.map((r) => r.storage_path);
    const urlByPath = new Map<string, string>();
    try {
      const { data: signed } = await supabase.storage
        .from("journal-entry-photos")
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }
    } catch {
      // keep urlByPath empty — previewsUnavailable reports it honestly
    }

    const photos: PersonalGalleryPhoto[] = rows.map((r) => ({
      photoId: r.id,
      entryId: r.entry_id,
      entryCreatedAt: r.journal_entries?.created_at ?? "",
      entrySnippet: snippet(r.journal_entries?.original_text ?? ""),
      projectId: r.journal_entries?.project_id ?? null,
      fileName: r.file_name,
      signedUrl: urlByPath.get(r.storage_path) ?? null,
    }));

    return {
      photos,
      previewsUnavailable:
        photos.length > 0 && photos.every((p) => p.signedUrl === null),
    };
  } catch {
    return EMPTY; // honest degradation
  }
}

/**
 * ANOTHER PERSON'S WORK PHOTOS — the same table, the same bucket, the same
 * signing pattern. There is no second photo store and no portfolio model.
 *
 * PERMISSION IS THE DATABASE'S, AT BOTH LAYERS. `journal_entry_photos` carries
 * an org-manager select policy beside the owner one, and `storage.objects`
 * carries the MATCHING policy for the `journal-entry-photos` bucket — so a
 * manager of the organization the work was done for can read the row AND mint
 * a signed URL, and nobody else can do either. This adds no policy, no grant
 * and no service-role client; a viewer without standing simply gets nothing.
 *
 * NO JOURNAL TEXT. The personal gallery shows each photo beside the entry's
 * own words, because it is the author looking at their own diary. This page's
 * standing rule is that no private narrative is selected here, so the photos
 * arrive as work evidence with a date and nothing else. A photo of a finished
 * weld is not the sentence the person wrote about their day.
 *
 * A failed read is `unavailable`, never an empty gallery.
 */
export type WorkPhoto = {
  readonly photoId: string;
  readonly takenAt: string;
  readonly signedUrl: string | null;
};

export type WorkPhotoRead =
  | {
      readonly status: "ok";
      readonly photos: readonly WorkPhoto[];
      readonly previewsUnavailable: boolean;
    }
  | { readonly status: "unavailable" };

/** Bounded: a profile shows recent proof of work, not a photo archive. */
export const PROFILE_WORK_PHOTO_LIMIT = 6;

export async function readWorkPhotosFor(
  profileId: string,
  limit = PROFILE_WORK_PHOTO_LIMIT,
): Promise<WorkPhotoRead> {
  if (!profileId) return { status: "ok", photos: [], previewsUnavailable: false };
  const supabase = await createClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("journal_entry_photos")
      .select(
        "id, storage_path, created_at, journal_entries!inner(id, created_at, deleted_at)",
      )
      .eq("profile_id", profileId)
      .is("journal_entries.deleted_at", null)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { status: "unavailable" };

    const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(
      (r) => r.journal_entries,
    );
    if (rows.length === 0) {
      return { status: "ok", photos: [], previewsUnavailable: false };
    }

    const paths = rows.map((r) => String(r.storage_path));
    const urlByPath = new Map<string, string>();
    try {
      const { data: signed } = await supabase.storage
        .from("journal-entry-photos")
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const sig of signed ?? []) {
        if (sig.signedUrl && sig.path) urlByPath.set(sig.path, sig.signedUrl);
      }
    } catch {
      // keep the map empty — previewsUnavailable reports it honestly rather
      // than rendering broken images.
    }

    const photos: WorkPhoto[] = rows.map((r) => ({
      photoId: String(r.id),
      takenAt: String(
        (r.journal_entries as { created_at?: string } | null)?.created_at ?? "",
      ),
      signedUrl: urlByPath.get(String(r.storage_path)) ?? null,
    }));

    return {
      status: "ok",
      photos,
      previewsUnavailable: photos.every((ph) => ph.signedUrl === null),
    };
  } catch {
    return { status: "unavailable" };
  }
}
