import "server-only";

/**
 * HISTORICAL DOCUMENT → JOURNAL DRAFT — server seam (value train 2, C1).
 *
 * The missing middle of the import chain (2026-08-23 audit): the upload
 * primitive and the canonical journal write both exist and are live, but
 * nothing could read a REGISTERED file's bytes back and structure them. This
 * seam closes exactly that hole by COMPOSITION of canonical pieces — it
 * introduces no second store, no second extractor, no second journal:
 *
 *   document_files row (RLS answers, caller's own client — same predicate as
 *   the download route) → storage download from the ONE `document-files`
 *   bucket → `extractCvText` (pure pdf/docx text, magic-byte checked, output
 *   bounded) → `extractJournalSuggestions` + `recognizeEntryDepth` (the same
 *   deterministic offline structuring the composer uses).
 *
 * The result is a REVIEW-ONLY draft (§7.1: machine suggests → human
 * confirms): nothing is persisted here. The UI wagon feeds this into the
 * EXISTING composer flow, whose save (`create_journal_entry_full`) then
 * carries the provenance metric rows from `document-journal-draft-model.ts`.
 *
 * HONEST REFUSALS, never silent degradation:
 *   - classified org documents are refused (their download is an audited act
 *     wired to the human download route; machine extraction of classified
 *     material is a separate owner decision, not a default);
 *   - image MIME types are refused — no OCR exists in the product (§18: a
 *     capability we do not have is not pretended).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_FILES_BUCKET } from "@/lib/documents/document-file-model";
import { extractCvText } from "@/lib/cv/extract";
import {
  extractJournalSuggestions,
  type JournalSuggestions,
} from "@/lib/structuring/extract-journal-suggestions";
import {
  recognizeEntryDepth,
  type EntryRecognition,
} from "@/lib/structuring/recognize-entry";
import {
  DOCUMENT_EXTRACTOR_NAME,
  DOCUMENT_EXTRACTOR_VERSION,
  isExtractableDocumentMime,
} from "./document-journal-draft-model";

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type DocumentJournalDraft =
  | { readonly kind: "no-user" }
  /** Missing OR not yours — RLS answers with one silence for both. */
  | { readonly kind: "not-found" }
  /** Honest refusal with the reason a UI can localize. */
  | {
      readonly kind: "refused";
      readonly reason: "classified" | "image_no_ocr" | "unsupported_type";
    }
  | { readonly kind: "empty" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "ok";
      readonly documentFileId: string;
      readonly originalFilename: string;
      /** Extracted text the worker reviews — never persisted by this seam. */
      readonly text: string;
      readonly suggestions: JournalSuggestions;
      readonly recognition: EntryRecognition;
      readonly extractor: { readonly name: string; readonly version: string };
    };

/**
 * Read one registered document back under the CALLER'S RLS and structure it
 * into review-only journal suggestions. Persists nothing.
 */
export async function draftJournalSuggestionsFromDocument(
  documentFileId: string,
): Promise<DocumentJournalDraft> {
  if (!UUID_RX.test(documentFileId)) return { kind: "not-found" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-user" };

  const { data, error } = await asAny(supabase)
    .from("document_files")
    .select(
      "id, storage_path, original_filename, mime_type, org_document_id, org_documents(classification)",
    )
    .eq("id", documentFileId)
    .maybeSingle();
  if (error || !data) return { kind: "not-found" };
  const row = data as {
    id: string;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    org_document_id: string | null;
    org_documents: { classification?: string } | null;
  };

  if (
    row.org_document_id &&
    row.org_documents?.classification === "classified"
  ) {
    return { kind: "refused", reason: "classified" };
  }
  if (!isExtractableDocumentMime(row.mime_type)) {
    return {
      kind: "refused",
      reason: row.mime_type.startsWith("image/")
        ? "image_no_ocr"
        : "unsupported_type",
    };
  }

  const download = await supabase.storage
    .from(DOCUMENT_FILES_BUCKET)
    .download(row.storage_path);
  if (download.error || !download.data) return { kind: "failed" };

  const buffer = await download.data.arrayBuffer();
  const extracted = await extractCvText(
    buffer,
    row.original_filename,
    row.mime_type,
  );
  if (extracted.kind === "empty") return { kind: "empty" };
  if (extracted.kind !== "ok") return { kind: "failed" };

  return {
    kind: "ok",
    documentFileId: row.id,
    originalFilename: row.original_filename,
    text: extracted.text,
    suggestions: extractJournalSuggestions(extracted.text),
    recognition: recognizeEntryDepth(extracted.text),
    extractor: {
      name: DOCUMENT_EXTRACTOR_NAME,
      version: DOCUMENT_EXTRACTOR_VERSION,
    },
  };
}
