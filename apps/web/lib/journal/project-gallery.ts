import "server-only";

import { countedOnceTotal, readCountedRows } from "@/lib/journal/counted-once-count";
import { createClient } from "@/lib/supabase/server";

/**
 * Project work gallery read service (CR train WAGON 8, areas 15/16).
 *
 * Reads the EXISTING journal photo evidence — journal_entry_photos rows whose
 * parent journal entry is auto-linked to the project (20260610213000) — for
 * the manager-only project stadium page. No second photo system: this is a
 * read-only projection of what workers attached to their own journal entries.
 *
 * Access model: the rows a session can read are decided ENTIRELY by RLS —
 * owner, admin, or (after 20260705250000 is applied) a manager of the entry's
 * engagement organization, exactly the journal_entries manager boundary.
 * Until that migration is applied a manager simply sees an honest empty
 * gallery; nothing here bypasses or widens a policy.
 *
 * Previews are short-lived signed URLs on the private bucket (avatar
 * pattern). When storage read is not granted yet, the metadata may list but
 * URL minting fails — reported honestly via `previewsUnavailable`, never a
 * broken image or a fake placeholder photo.
 */

export const PROJECT_GALLERY_LIMIT = 60;
export const PROJECT_GALLERY_SIGNED_URL_TTL_SECONDS = 60 * 60;
const ENTRY_SNIPPET_MAX = 140;

export type ProjectGalleryPhoto = {
  photoId: string;
  entryId: string;
  workerId: string;
  /** ISO timestamp of the parent journal entry (its created_at). */
  entryCreatedAt: string;
  /** Trimmed snippet of the worker's own entry text (evidence context). */
  entrySnippet: string;
  fileName: string;
  /** Short-lived signed URL, or null when storage read is not available. */
  signedUrl: string | null;
};

export type ProjectGallery = {
  photos: ProjectGalleryPhoto[];
  /** True when photo rows are readable but no preview URL could be minted
   *  (storage policy not applied yet in this environment). */
  previewsUnavailable: boolean;
};

const EMPTY: ProjectGallery = { photos: [], previewsUnavailable: false };

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
  } | null;
};

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > ENTRY_SNIPPET_MAX
    ? `${clean.slice(0, ENTRY_SNIPPET_MAX - 1)}…`
    : clean;
}

/** Real counts behind the gallery (control room PR G): how many journal
 *  entries are linked to the project and how many uploaded photos those
 *  entries carry. SAME tables, SAME RLS as getProjectGallery — head counts
 *  only, so the operations centre can summarize without loading a second
 *  gallery. Any error degrades to 0/0 (honest, never fabricated). */
export type ProjectGallerySummary = {
  entryCount: number;
  photoCount: number;
};

export async function getProjectGallerySummary(
  projectId: string,
): Promise<ProjectGallerySummary> {
  const supabase = await createClient();
  let entryCount = 0;
  let photoCount = 0;
  try {
    const [entriesRes, photosRes] = await Promise.all([
      readCountedRows(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("journal_entries")
          // id + correction_of: a corrected-and-resubmitted entry counts once.
          .select("id, correction_of")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .is("superseded_by", null)
          .order("id", { ascending: true }),
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("journal_entry_photos")
        .select("id, journal_entries!inner(project_id, deleted_at, superseded_by)", {
          count: "exact",
          head: true,
        })
        .eq("journal_entries.project_id", projectId)
        .is("journal_entries.deleted_at", null)
        .is("journal_entries.superseded_by", null)
        .eq("upload_status", "uploaded"),
    ]);
    const counted = countedOnceTotal(entriesRes);
    if (counted !== null) entryCount = counted;
    if (!photosRes.error && typeof photosRes.count === "number") {
      photoCount = photosRes.count;
    }
  } catch {
    // keep 0/0 — honest degradation
  }
  return { entryCount, photoCount };
}

/** Photo rows the batched count asks for in one request (the API's own row
 *  cap, `max_rows`, is 1000). The batch is accepted only when every matching
 *  row came back (rows read = exact count); otherwise the count falls back to
 *  one head count per project, so it stays exact under any server cap. */
export const PROJECT_PHOTO_COUNT_BATCH_CAP = 1000;

/** Uploaded-photo counts for several projects in ONE read — the projects page
 *  shows only this number per card, so it needs neither the entry count nor a
 *  request pair per project. SAME table, SAME filters, SAME RLS as
 *  getProjectGallerySummary. A failed batch falls back to the per-project
 *  reads, which degrade exactly as getProjectGallerySummary does. */
export async function getProjectPhotoCounts(
  projectIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return counts;
  const supabase = await createClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await (supabase as any)
      .from("journal_entry_photos")
      .select("journal_entries!inner(project_id, deleted_at, superseded_by)", { count: "exact" })
      .in("journal_entries.project_id", ids)
      .is("journal_entries.deleted_at", null)
      .is("journal_entries.superseded_by", null)
      .eq("upload_status", "uploaded")
      .limit(PROJECT_PHOTO_COUNT_BATCH_CAP);
    if (!error && Array.isArray(data) && typeof count === "number" && data.length === count) {
      for (const id of ids) counts.set(id, 0);
      for (const row of data as { journal_entries: { project_id: string } | null }[]) {
        const pid = row.journal_entries?.project_id;
        if (pid && counts.has(pid)) counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
      return counts;
    }
  } catch {
    // fall through to the exact per-project head counts
  }
  const each = await Promise.all(
    ids.map(async (id) => [id, (await getProjectGallerySummary(id)).photoCount] as const),
  );
  for (const [id, n] of each) counts.set(id, n);
  return counts;
}

export async function getProjectGallery(
  projectId: string,
): Promise<ProjectGallery> {
  const supabase = await createClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("journal_entry_photos")
      .select(
        "id, entry_id, file_name, storage_path, created_at, journal_entries!inner(id, worker_id, original_text, created_at, project_id, deleted_at)",
      )
      .eq("journal_entries.project_id", projectId)
      .is("journal_entries.deleted_at", null)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: false })
      .limit(PROJECT_GALLERY_LIMIT);
    if (error || !Array.isArray(data) || data.length === 0) return EMPTY;

    const rows = (data as PhotoRow[]).filter((r) => r.journal_entries);
    if (rows.length === 0) return EMPTY;

    // Batch-mint short-lived signed URLs; a failure degrades per-photo to
    // null (honest "preview unavailable"), never a broken image.
    const paths = rows.map((r) => r.storage_path);
    const urlByPath = new Map<string, string>();
    try {
      const { data: signed } = await supabase.storage
        .from("journal-entry-photos")
        .createSignedUrls(paths, PROJECT_GALLERY_SIGNED_URL_TTL_SECONDS);
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }
    } catch {
      // keep urlByPath empty — previewsUnavailable reports it honestly
    }

    const photos: ProjectGalleryPhoto[] = rows.map((r) => ({
      photoId: r.id,
      entryId: r.entry_id,
      workerId: r.journal_entries?.worker_id ?? "",
      entryCreatedAt: r.journal_entries?.created_at ?? "",
      entrySnippet: snippet(r.journal_entries?.original_text ?? ""),
      fileName: r.file_name,
      signedUrl: urlByPath.get(r.storage_path) ?? null,
    }));

    return {
      photos,
      previewsUnavailable:
        photos.length > 0 && photos.every((p) => p.signedUrl === null),
    };
  } catch {
    return EMPTY; // honest degradation — table/relation not provisioned
  }
}
