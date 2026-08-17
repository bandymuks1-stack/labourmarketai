/**
 * Pure document-file model (Document & Evidence Engine v1) — shared by the
 * server read layer, the server actions, the download route, the guard test
 * and the documents page. No server-only imports, no IO.
 *
 * Codes against the contract of the human-gated migration pair
 * 20260817140000_document_file_layer_v1 + 20260817140100_notification_
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

/* ── Register delta v1 (20260817240000) ─────────────────────────────────── */

/** Bounds mirroring the delta migration's column CHECKs — ONE contract. */
export const ORG_DOCUMENT_COUNTERPARTY_MAX = 200;
export const ORG_DOCUMENT_COUNTERPARTY_REF_MAX = 120;
export const ORG_DOCUMENT_RETENTION_NOTE_MAX = 500;
export const ORG_DOCUMENT_EXTERNAL_REF_MAX = 200;

/** The two correspondence type slugs. Direction is DERIVED from the slug —
 *  the register stores it nowhere (never store derivable data twice). */
export const ORG_CORRESPONDENCE_SLUGS = {
  incoming: "org_correspondence_incoming",
  outgoing: "org_correspondence_outgoing",
} as const;

export const CORRESPONDENCE_DIRECTIONS = ["incoming", "outgoing"] as const;
export type CorrespondenceDirection = (typeof CORRESPONDENCE_DIRECTIONS)[number];

export function correspondenceDirectionForSlug(
  slug: string,
): CorrespondenceDirection | null {
  if (slug === ORG_CORRESPONDENCE_SLUGS.incoming) return "incoming";
  if (slug === ORG_CORRESPONDENCE_SLUGS.outgoing) return "outgoing";
  return null;
}

export function isCorrespondenceSlug(slug: string): boolean {
  return correspondenceDirectionForSlug(slug) !== null;
}

export function isValidCorrespondenceDirection(
  v: string,
): v is CorrespondenceDirection {
  return (CORRESPONDENCE_DIRECTIONS as readonly string[]).includes(v);
}

/** The approval MIRROR vocabulary. `null` = no approval was ever requested.
 *  Nothing here decides anything: the Workflow & Approval Engine owns the
 *  decision and these values only reflect its terminal truth. */
export const ORG_DOCUMENT_APPROVAL_STATES = [
  "submitted",
  "approved",
  "returned",
] as const;
export type OrgDocumentApprovalState =
  (typeof ORG_DOCUMENT_APPROVAL_STATES)[number];

export function isValidOrgDocumentApprovalState(
  v: string,
): v is OrgDocumentApprovalState {
  return (ORG_DOCUMENT_APPROVAL_STATES as readonly string[]).includes(v);
}

/** The engine context this module rides. The engine's vocabulary is CLOSED
 *  and is deliberately NOT widened — see the migration header for why
 *  'document_ack' and 'management_decision' were rejected. */
export const ORG_DOCUMENT_WORKFLOW_CONTEXT = "generic_request" as const;

/** Register search: bounded and SANITIZED before it reaches PostgREST's
 *  `or=` grammar, where `,` `(` `)` `.` and `*` are structural. Anything
 *  outside letters/digits/space/dash/underscore is dropped — this is a
 *  metadata search box, never a query language, and never searches inside
 *  file contents. */
export const ORG_REGISTER_SEARCH_MAX = 80;

export function sanitizeRegisterSearch(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ORG_REGISTER_SEARCH_MAX);
}

/** Retention presentation state — pure date arithmetic over what the
 *  organization itself recorded. NOTHING deletes on this state; it is a
 *  register fact, not a job. */
export const RETENTION_STATES = ["none", "scheduled", "due"] as const;
export type RetentionState = (typeof RETENTION_STATES)[number];

export function retentionState(
  retentionUntil: string | null,
  todayIso: string,
): RetentionState {
  if (!retentionUntil) return "none";
  return retentionUntil <= todayIso ? "due" : "scheduled";
}

/** Register filter axes, all optional. `q` is already sanitized. */
export type OrgRegisterFilters = {
  readonly status: OrgDocumentStatus | null;
  readonly direction: CorrespondenceDirection | null;
  readonly objectId: string | null;
  readonly retention: RetentionState | null;
  readonly q: string;
};

export const EMPTY_ORG_REGISTER_FILTERS: OrgRegisterFilters = {
  status: null,
  direction: null,
  objectId: null,
  retention: null,
  q: "",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the register's searchParams. Every unknown value degrades to
 *  "no filter" — a bad URL never produces an error surface. */
export function parseOrgRegisterFilters(sp: {
  regStatus?: string;
  regDirection?: string;
  regObject?: string;
  regRetention?: string;
  regQ?: string;
}): OrgRegisterFilters {
  const status = (ORG_DOCUMENT_STATUSES as readonly string[]).includes(
    sp.regStatus ?? "",
  )
    ? (sp.regStatus as OrgDocumentStatus)
    : null;
  const direction = isValidCorrespondenceDirection(sp.regDirection ?? "")
    ? (sp.regDirection as CorrespondenceDirection)
    : null;
  const objectId = UUID_RE.test(sp.regObject ?? "")
    ? (sp.regObject as string)
    : null;
  const retention =
    sp.regRetention === "scheduled" || sp.regRetention === "due"
      ? (sp.regRetention as RetentionState)
      : null;
  return {
    status,
    direction,
    objectId,
    retention,
    q: sanitizeRegisterSearch(String(sp.regQ ?? "")),
  };
}

/** Href back onto the EXISTING documents page with the register anchor —
 *  no new route, filters are searchParams only. */
export const ORG_REGISTER_ANCHOR = "#org-register";

export function orgRegisterHref(
  filters: Partial<OrgRegisterFilters>,
): string {
  const p = new URLSearchParams();
  if (filters.status) p.set("regStatus", filters.status);
  if (filters.direction) p.set("regDirection", filters.direction);
  if (filters.objectId) p.set("regObject", filters.objectId);
  if (filters.retention && filters.retention !== "none") {
    p.set("regRetention", filters.retention);
  }
  const q = sanitizeRegisterSearch(filters.q ?? "");
  if (q) p.set("regQ", q);
  const qs = p.toString();
  return `/dashboard/documents${qs ? `?${qs}` : ""}${ORG_REGISTER_ANCHOR}`;
}

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
  /* ── Register delta v1 — null everywhere until 20260817240000 applies. */
  readonly objectId: string | null;
  readonly counterpartyName: string | null;
  readonly correspondenceDate: string | null;
  readonly counterpartyReference: string | null;
  readonly retentionUntil: string | null;
  readonly retentionNote: string | null;
  readonly approvalState: OrgDocumentApprovalState | null;
};

/** Direction of a register row, derived — never read from a column. */
export function orgDocumentDirection(
  row: Pick<OrgDocumentRow, "documentTypeSlug">,
): CorrespondenceDirection | null {
  return correspondenceDirectionForSlug(row.documentTypeSlug);
}

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
  /* ── Register delta v1 outcomes. */
  | "updated"
  | "submitted"
  | "repaired_approved"
  | "repaired_returned"
  | "unchanged"
  | "no_pending_workflow"
  | "no_approval_definition"
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
  "updated",
  "submitted",
  "repaired_approved",
  "repaired_returned",
  "unchanged",
  "no_pending_workflow",
  "no_approval_definition",
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
