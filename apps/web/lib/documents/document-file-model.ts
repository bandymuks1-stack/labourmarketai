/**
 * Pure document-file model (Document & Evidence Engine v1) — shared by the
 * server read layer, the server actions, the download route, the guard test
 * and the documents page. No server-only imports, no IO.
 *
 * Codes against the contract of the human-gated migration pair
 * 20260817120000_document_file_layer_v1 + 20260817121000_notification_
 * document_types_v3. Until the lead applies them, every consumer degrades
 * honestly (the established follow-up pattern): the page keeps its truthful
 * "file upload is not available yet" note and no control pretends to work.
 *
 * DOCTRINE (binding, from the lead design):
 *   - worker_documents stays canonical for worker scope; document_files is
 *     the single FILE truth for both scopes.
 *   - An acknowledgement binds to a FILE VERSION: acknowledging version N
 *     never covers version N+1.
 *   - No public bucket; access only via RLS-scoped reads + short-lived
 *     signed URLs minted server-side after the row-level check.
 */

/** Mirrors the migration's CHECK + the bucket MIME allowlist — ONE contract. */
export const DOCUMENT_FILE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** 5 MB — the repo's established upload cap (journal photos, CV extract). */
export const DOCUMENT_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Mirrors the migration's version CHECK (1..50). */
export const DOCUMENT_FILE_MAX_VERSIONS = 50;

/** Short-lived signed download URL TTL (seconds). */
export const DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS = 60;

/** The private bucket id — created BY the migration, never public. */
export const DOCUMENT_FILES_BUCKET = "document-files";

export type DocumentFileScope = "worker" | "organization";

export const ORG_DOCUMENT_STATUSES = ["active", "archived", "revoked"] as const;
export type OrgDocumentStatus = (typeof ORG_DOCUMENT_STATUSES)[number];

export const ORG_DOCUMENT_CLASSIFICATIONS = ["standard", "classified"] as const;
export type OrgDocumentClassification =
  (typeof ORG_DOCUMENT_CLASSIFICATIONS)[number];

/** The seven org-register type slugs the migration seeds (category
 *  'organization'); worker slugs stay in the existing registry untouched. */
export const ORG_DOCUMENT_TYPE_SLUGS = [
  "org_policy",
  "org_procedure",
  "org_instruction",
  "org_correspondence_incoming",
  "org_correspondence_outgoing",
  "org_internal",
  "org_agreement_attachment",
] as const;

export const ORG_DOCUMENT_TITLE_MIN = 3;
export const ORG_DOCUMENT_TITLE_MAX = 200;
export const ORG_DOCUMENT_DESCRIPTION_MAX = 2000;

/** Postgres/PostgREST codes proving the file layer is ABSENT (migration not
 *  applied), as distinct from broken — the shared repo set. */
export const DOCUMENT_FILE_ABSENT_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
  "PGRST205",
] as const;

export function isDocumentFileAbsentCode(code: string | undefined): boolean {
  return (DOCUMENT_FILE_ABSENT_CODES as readonly string[]).includes(code ?? "");
}

export function isValidDocumentFileMime(mime: string): boolean {
  return (DOCUMENT_FILE_MIME_TYPES as readonly string[]).includes(mime);
}

export function isValidOrgDocumentTypeSlug(slug: string): boolean {
  return (ORG_DOCUMENT_TYPE_SLUGS as readonly string[]).includes(slug);
}

export function isValidOrgDocumentClassification(
  v: string,
): v is OrgDocumentClassification {
  return (ORG_DOCUMENT_CLASSIFICATIONS as readonly string[]).includes(v);
}

/** File-level validity check shared by the upload actions (server re-checks
 *  again inside register_document_file_v1 — single contract, two fences). */
export function isValidDocumentFile(file: {
  type: string;
  size: number;
}): boolean {
  return (
    isValidDocumentFileMime(file.type) &&
    file.size > 0 &&
    file.size <= DOCUMENT_FILE_MAX_BYTES
  );
}

/** Storage-safe filename: same normalisation the journal photo path uses. */
export function safeDocumentFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-100) || "document.pdf";
}

/**
 * Canonical storage paths — pinned by register_document_file_v1 AND the
 * storage.objects policies. Building them anywhere else is a bug.
 *   worker/<worker_id>/doc/<worker_document_id>/v<version>/<filename>
 *   org/<organization_id>/doc/<org_document_id>/v<version>/<filename>
 */
export function buildWorkerDocumentFilePath(
  workerId: string,
  workerDocumentId: string,
  version: number,
  filename: string,
): string {
  return `worker/${workerId}/doc/${workerDocumentId}/v${version}/${safeDocumentFilename(filename)}`;
}

export function buildOrgDocumentFilePath(
  organizationId: string,
  orgDocumentId: string,
  version: number,
  filename: string,
): string {
  return `org/${organizationId}/doc/${orgDocumentId}/v${version}/${safeDocumentFilename(filename)}`;
}

/** One version row as the read layer returns it. */
export type DocumentFileRow = {
  readonly id: string;
  readonly scope: DocumentFileScope;
  readonly workerDocumentId: string | null;
  readonly orgDocumentId: string | null;
  readonly version: number;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly uploadedAt: string;
  readonly supersededAt: string | null;
};

/** The current (non-superseded) version among a parent's rows, or null. */
export function currentDocumentFile(
  rows: readonly DocumentFileRow[],
): DocumentFileRow | null {
  return rows.find((r) => r.supersededAt === null) ?? null;
}

/** Next version = max + 1 — mirrors the RPC's monotonic assignment so the
 *  upload path can be built BEFORE the blob upload. The RPC re-derives and
 *  rejects a mismatched prefix ('path_mismatch' / unique-index conflict). */
export function nextDocumentFileVersion(
  rows: readonly Pick<DocumentFileRow, "version">[],
): number {
  let max = 0;
  for (const r of rows) if (r.version > max) max = r.version;
  return max + 1;
}

export type OrgDocumentRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentTypeSlug: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: OrgDocumentStatus;
  readonly classification: OrgDocumentClassification;
  readonly responsibleProfileId: string | null;
  readonly workerId: string | null;
  readonly projectId: string | null;
  readonly externalRef: string | null;
  readonly validFrom: string | null;
  readonly expiresOn: string | null;
  readonly createdAt: string;
};

export type DocumentAcknowledgementRow = {
  readonly id: string;
  readonly documentFileId: string;
  readonly assigneeProfileId: string;
  readonly organizationId: string;
  readonly requiredBy: string | null;
  readonly acknowledgedAt: string | null;
  readonly assignedBy: string;
  readonly createdAt: string;
};

/** Ack progress for ONE file version — pure counting, nothing invented. */
export type AckProgress = {
  readonly assigned: number;
  readonly acknowledged: number;
};

export function deriveAckProgress(
  acks: readonly Pick<DocumentAcknowledgementRow, "acknowledgedAt">[],
): AckProgress {
  let acknowledged = 0;
  for (const a of acks) if (a.acknowledgedAt !== null) acknowledged += 1;
  return { assigned: acks.length, acknowledged };
}

/** RPC outcome strings (single contract with the migration) → notices. */
export type DocumentEngineNotice =
  | "uploaded"
  | "created"
  | "archived"
  | "revoked"
  | "assigned"
  | "acknowledged"
  | "invalid"
  | "invalid_state"
  | "invalid_assignee"
  | "already_assigned"
  | "already_acknowledged"
  | "not_current"
  | "not_allowed"
  | "not_found"
  | "limit_reached"
  | "version_limit_reached"
  | "path_mismatch"
  | "file_too_large"
  | "unsupported_type"
  | "needs_migration"
  | "error";

const PASSTHROUGH_OUTCOMES: readonly DocumentEngineNotice[] = [
  "created",
  "archived",
  "revoked",
  "assigned",
  "acknowledged",
  "invalid",
  "invalid_state",
  "invalid_assignee",
  "already_assigned",
  "already_acknowledged",
  "not_current",
  "not_allowed",
  "not_found",
  "limit_reached",
  "version_limit_reached",
  "path_mismatch",
  "file_too_large",
  "unsupported_type",
];

export function noticeForDocumentRpcOutcome(
  outcome: string,
  okOutcome: string,
  okNotice: DocumentEngineNotice,
): DocumentEngineNotice {
  if (outcome === okOutcome) return okNotice;
  if ((PASSTHROUGH_OUTCOMES as readonly string[]).includes(outcome)) {
    return outcome as DocumentEngineNotice;
  }
  return "error";
}
