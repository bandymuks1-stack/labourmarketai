/**
 * HISTORICAL DOCUMENT → JOURNAL DRAFT — pure half (value train 2, Wagon C1).
 *
 * The provenance vocabulary of the document-import seam: when a worker turns
 * an uploaded work report (a `document_files` row) into a Work Journal entry,
 * the entry must stay ATTRIBUTABLE to its source forever — original file,
 * extractor identity + version, import path — without inventing any new
 * store. The carrier is the EXISTING `journal_entry_metrics` rows written
 * atomically by `create_journal_entry_full` (0017), so provenance rides the
 * same append-only, hash-chained truth as every other journal fact.
 *
 * HONESTY (§7 / §7.1): the extraction is DETERMINISTIC (the offline
 * structuring packs — no AI provider, no network). The metrics `source`
 * vocabulary is a closed CHECK ('worker_input' | 'ai_extracted' |
 * 'manager_corrected'); provenance facts are machine-recorded, not typed by
 * the worker, so they carry the machine-origin value `ai_extracted` — and
 * the `extractor_version` row spells out `deterministic-structuring@…` so
 * the audit trail can never be read as a vendor-AI claim.
 *
 * Pure. No IO, no env, no server-only.
 */

/** Extractor identity recorded on every imported entry. Bump the version
 *  when the structuring behaviour changes in a way that affects output. */
export const DOCUMENT_EXTRACTOR_NAME = "deterministic-structuring";
export const DOCUMENT_EXTRACTOR_VERSION = "v1";

/** `metric_slug`s of the provenance rows. Slugs are free-form by design
 *  (0013 has no CHECK on metric_slug — §10: new facts must not need schema
 *  changes); these two are the canonical import-provenance vocabulary. */
export const SOURCE_DOCUMENT_METRIC_SLUG = "source_document_file";
export const EXTRACTOR_VERSION_METRIC_SLUG = "extractor_version";

export interface JournalProvenanceMetricRow {
  readonly metric_slug: string;
  readonly value_text: string;
  readonly source: "ai_extracted";
}

/** The two provenance rows an imported entry carries. */
export function documentProvenanceMetrics(
  documentFileId: string,
): readonly JournalProvenanceMetricRow[] {
  return [
    {
      metric_slug: SOURCE_DOCUMENT_METRIC_SLUG,
      value_text: documentFileId,
      source: "ai_extracted",
    },
    {
      metric_slug: EXTRACTOR_VERSION_METRIC_SLUG,
      value_text: `${DOCUMENT_EXTRACTOR_NAME}@${DOCUMENT_EXTRACTOR_VERSION}`,
      source: "ai_extracted",
    },
  ];
}

/**
 * Which stored document MIME types the deterministic text extraction can
 * honestly serve. `document_files` admits pdf/jpeg/png/webp/docx; the
 * extractor reads pdf + docx. Images are refused HONESTLY — no OCR exists
 * anywhere in the product, and pretending otherwise would be a fake
 * capability (§18).
 */
export const EXTRACTABLE_DOCUMENT_MIMES: readonly string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function isExtractableDocumentMime(mime: string): boolean {
  return EXTRACTABLE_DOCUMENT_MIMES.includes(mime);
}
