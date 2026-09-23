import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import {
  normalizeLabel,
  type ResolveEntity,
} from "@/lib/timesheet-import/resolve-entities";
import { orgDisplayName } from "@/lib/company/org-display";
import {
  deriveEvidenceStanding,
  type ReportedEvidenceState,
  type RecordLifecycleEvent,
} from "./evidence-state";
import {
  SESSION_RECORD_PAGE,
  isEvidenceStore,
  supabaseEvidenceStore,
  untypedClient,
  type EvidenceCaller,
  type EvidenceStore,
  type SessionRecordWithEvents,
  type StoreRow,
} from "./evidence-store";
import { chainHash, recordFingerprint } from "./fingerprint";
import {
  deriveImportSessionStatus,
  type ImportSessionEvent,
  type ImportSessionStatus,
} from "./import-session-status";
import {
  matchPerson,
  personKey,
  type RosterPerson,
} from "./person-matching";
import {
  MAX_ROWS_PER_SESSION,
  MAX_ROWS_PER_SUBMIT,
  sourceWorkRowSchema,
  tidy,
  type SourceWorkRow,
} from "./source-rows";
import { HOURS_EXCEED_DAY_METHOD, mapHeaderRow } from "./parse-tabular";
import {
  classifyTimeSemantics,
  countsAsDailyHours,
  extractSourceTimeCues,
  periodFromHumanInput,
  sourceTimeConflicts,
  timeSemanticsOpen,
  withSourceCues,
  type TimeSemantics,
  type TimeSemanticsKind,
} from "./time-semantics";
import { committedFactFields } from "./record-fact-fields";
import {
  resolveEvidenceOrganization,
  type EvidenceOrgReason,
} from "./evidence-org-context";
import {
  competencySignalRows,
  deriveCompetencySignals,
} from "./competency-signals";
import {
  allocateHours,
  canonicalPlaces,
  extractSitesFromText,
  resolvePlace,
  segmentsOf,
  toSegment,
  type CanonicalPlace,
  type ContextSegment,
  type ContextSegmentKind,
  type HoursAllocation,
  type KnownPlace,
} from "./work-context";

/**
 * THE ORGANIZATION EVIDENCE IMPORT — one domain core, every transport.
 *
 * The web import UI, an authorized ChatGPT/Claude call over `/api/mcp`, and any
 * future ERP/payroll adapter all enter HERE. There is deliberately no second
 * implementation: a transport supplies a `DomainCaller` (its own RLS-scoped
 * client) and canonical `SourceWorkRow`s, and gets back the same results.
 *
 * ── THE SHAPE OF THE FLOW ──────────────────────────────────────────────────
 *
 *   createImportSession   the immutable envelope for ONE source. Idempotent on
 *                         (organization, source fingerprint): re-uploading the
 *                         same file resolves to the session that exists.
 *   submitRows            bounded batches of staged rows. Nothing here is
 *                         evidence, and no surface reads it as such.
 *   buildPreview          match people and places, detect duplicates, and say
 *                         for every field whether the SOURCE stated it or we
 *                         worked it out. Persists nothing new.
 *   resolveRow            a human (or an authorized agent) settles one
 *                         ambiguity by choosing a person or a place.
 *   commitImport          the ONE write that produces evidence. Atomic and
 *                         idempotent.
 *   withdrawImport /      the rollback path. It hides nothing and deletes
 *   reinstateImport       nothing — both are append-only events.
 *   attestRecord          the organization vouching for a record. Attesting
 *                         one's OWN work is allowed and derives SELF_ATTESTED,
 *                         which never counts as independent verification.
 *
 * ── WHAT THIS CORE REFUSES TO DO ───────────────────────────────────────────
 * It never invents a person. `unmatched` is a real, returnable outcome, and the
 * only thing that may follow is a question or an explicit, authorized "create
 * this roster person" call. Writing one human's work into another's history is
 * the worst failure available to this feature, and a matching name is not an
 * identity (owner correction §6).
 *
 * An IMPORT never produces attested or verified evidence. The record's own
 * `evidence_state` CHECK has no attested value; attestation and independent
 * verification are separate append-only events with separate policies, and
 * only the latter carries independence.
 *
 * ── HONEST DEGRADATION ─────────────────────────────────────────────────────
 * The migration ships RED and unapplied. Every entry point answers
 * `needs-migration` on the four "object does not exist" driver codes, and a
 * genuine outage stays `error` — an absent store and a broken store are not the
 * same event.
 */

// ── result vocabulary ───────────────────────────────────────────────────────

/** Every failure this core can name. Mapped by each transport onto its own
 *  existing envelope; no second result model is introduced. */
export type EvidenceImportFailure =
  | { readonly kind: "not-authorized"; readonly reason: EvidenceOrgReason }
  | {
      readonly kind: "choice-required";
      readonly options: readonly {
        readonly id: string;
        readonly name: string;
      }[];
    }
  /** The store is not provisioned in this environment. NOT "no data". */
  | { readonly kind: "needs-migration" }
  | { readonly kind: "invalid"; readonly problems: readonly string[] }
  | { readonly kind: "not-found" }
  | { readonly kind: "too-many-rows"; readonly limit: number }
  | { readonly kind: "error" };

export type EvidenceImportResult<T> =
  | ({ readonly kind: "ok" } & T)
  | EvidenceImportFailure;

const MISSING_OBJECT_CODES = new Set([
  "42P01",
  "42883",
  "PGRST202",
  "PGRST205",
]);

function classify(
  error: { code?: string | null } | null,
): EvidenceImportFailure {
  if (error && MISSING_OBJECT_CODES.has(error.code ?? ""))
    return { kind: "needs-migration" };
  return { kind: "error" };
}

// The reads not yet behind the store port use the caller's client directly,
// through the same untyped view the port uses.
const db = untypedClient;

/**
 * THE DATA PLANE for one call. A transport hands in its `DomainCaller` (the
 * caller's own RLS-scoped client) and gets the production store over it; the
 * synthetic fixture hands in a store directly. Either way the orchestration
 * below is the SAME code — there is no test-only path through it.
 */
function storeOf(caller: EvidenceCaller): EvidenceStore {
  return isEvidenceStore(caller) ? caller : supabaseEvidenceStore(caller);
}

function refuseOrg(org: {
  readonly reason: EvidenceOrgReason;
  readonly options?: readonly { readonly id: string; readonly name: string }[];
}): EvidenceImportFailure {
  return org.reason === "choice-required" || org.reason === "not-a-member"
    ? { kind: "choice-required", options: org.options ?? [] }
    : { kind: "not-authorized", reason: org.reason };
}

// ── session ─────────────────────────────────────────────────────────────────

export const SOURCE_KINDS = [
  "xlsx",
  "csv",
  "pdf",
  "api",
  "agent",
  "erp",
  "payroll",
  "sis",
  "lms",
  "email",
  "drive",
  "manual",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SUPPLIER_ROLES = [
  "employer",
  "agency",
  "client",
  "end_client",
  "project_owner",
  "subcontractor",
  "education_provider",
  "training_provider",
  "assessor",
  "placement_provider",
  "public_body",
  "sector_body",
  "other",
] as const;
export type SupplierRole = (typeof SUPPLIER_ROLES)[number];

export interface CreateSessionInput {
  /** Optional selector among the caller's OWN memberships — never a grant. */
  readonly organizationId?: string | null;
  readonly sourceKind: SourceKind;
  /** IN WHAT CAPACITY the organization supplies this. Required: an agency
   *  reporting its worker's hours on a client's site is neither the employer
   *  nor the client, and this is where it says so. */
  readonly supplierRole: SupplierRole;
  readonly sourceFingerprint: string;
  readonly sourceLanguage: string;
  readonly sourceFilename?: string | null;
  readonly sourceReference?: string | null;
  readonly notes?: string | null;
  /** `agent` when an authorized assistant is performing it. METADATA ONLY —
   *  authority came from the human OAuth identity behind the caller. */
  readonly actorKind?: "human" | "agent";
  readonly agentLabel?: string | null;
  /**
   * `sha256(bytes)` of an UPLOADED file, plain hex — the same form as
   * `document_files.content_sha256` (design v3 §9.1). Computed at intake for
   * every file, CSV included. It never replaces `sourceFingerprint` (a file
   * already imported keeps its session); until the session column exists
   * (M1e) it is recorded on the session's `created` event, append-only.
   */
  readonly sourceBytesSha256?: string | null;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * THE DEFAULT CAPACITY an organization speaks in when nobody stated one
 * (design v3 N1). `employer` first: an organization that declared it employs
 * people speaks as the employer of its own timesheets, even when it ALSO
 * supplies workforce — the old order read such an organization as an agency.
 * `other` stays the answer when the organization declared nothing: it claims
 * no capacity, and the organization is not asked to invent one.
 */
export function defaultSupplierRole(capabilities: readonly string[]): SupplierRole {
  if (capabilities.includes("employer") || capabilities.includes("project_operator")) return "employer";
  if (capabilities.includes("training_provider")) return "training_provider";
  if (capabilities.includes("workforce_provider") || capabilities.includes("recruitment_partner")) return "agency";
  return "other";
}

export interface SessionSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly sourceKind: string;
  readonly sourceFilename: string | null;
  readonly sourceLanguage: string;
  readonly supplierRole: string;
  readonly createdAt: string;
  /** True when this call found an existing session for the same source rather
   *  than creating one — the source-level idempotency answer. */
  readonly reused: boolean;
}

/**
 * Create (or find) the import session for one source.
 *
 * IDEMPOTENT AT THE SOURCE LEVEL. `(organization_id, source_fingerprint)` is
 * unique, so a re-upload of the same bytes — or an agent retrying a timed-out
 * call — resolves to the SAME session instead of starting a second import of
 * the same file. `reused: true` says which happened, so a client can tell the
 * human "you already imported this" rather than silently doing nothing.
 */
export async function createImportSession(
  caller: EvidenceCaller,
  input: CreateSessionInput,
): Promise<EvidenceImportResult<{ session: SessionSummary }>> {
  const store = storeOf(caller);
  const org = await store.resolveOrganization(input.organizationId);
  if (!org.ok) return refuseOrg(org);

  const existing = await store.findSessionByFingerprint(org.organizationId, input.sourceFingerprint);
  if (existing.error) return classify(existing.error);
  if (existing.data) {
    return {
      kind: "ok",
      session: {
        id: existing.data.id as string,
        organizationId: org.organizationId,
        organizationName: org.organizationName,
        sourceKind: existing.data.source_kind as string,
        sourceFilename:
          (existing.data.source_filename as string | null) ?? null,
        sourceLanguage: existing.data.source_language as string,
        supplierRole: existing.data.supplier_role as string,
        createdAt: existing.data.created_at as string,
        reused: true,
      },
    };
  }

  const inserted = await store.insertSession({
    organization_id: org.organizationId,
    source_kind: input.sourceKind,
    source_filename: input.sourceFilename ?? null,
    source_reference: input.sourceReference ?? null,
    source_fingerprint: input.sourceFingerprint,
    source_language: input.sourceLanguage,
    supplied_by_organization_id: org.organizationId,
    supplier_role: input.supplierRole,
    actor_kind: input.actorKind ?? "human",
    agent_label: input.agentLabel ?? null,
    created_by: store.userId,
    notes: input.notes ?? null,
  });
  if (inserted.error) return classify(inserted.error);

  const bytesSha256 =
    input.sourceBytesSha256 && SHA256_HEX.test(input.sourceBytesSha256) ? input.sourceBytesSha256 : null;
  await recordImportEvent(store, {
    organizationId: org.organizationId,
    sessionId: inserted.data.id,
    eventType: "created",
    actorKind: input.actorKind ?? "human",
    payload: {
      sourceKind: input.sourceKind,
      supplierRole: input.supplierRole,
      ...(bytesSha256 ? { sourceBytesSha256: bytesSha256 } : {}),
    },
  });

  return {
    kind: "ok",
    session: {
      id: inserted.data.id,
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      sourceKind: input.sourceKind,
      sourceFilename: input.sourceFilename ?? null,
      sourceLanguage: input.sourceLanguage,
      supplierRole: input.supplierRole,
      createdAt: inserted.data.created_at,
      reused: false,
    },
  };
}

type ImportEventType =
  | "created"
  | "rows_submitted"
  | "previewed"
  | "committed"
  | "rolled_back"
  | "reinstated"
  | "failed";

function importEventRow(
  store: EvidenceStore,
  e: {
    organizationId: string;
    sessionId: string;
    eventType: ImportEventType;
    actorKind?: "human" | "agent";
    payload?: Record<string, unknown>;
  },
): StoreRow {
  return {
    organization_id: e.organizationId,
    session_id: e.sessionId,
    event_type: e.eventType,
    actor_profile_id: store.userId,
    actor_kind: e.actorKind ?? "human",
    payload: e.payload ?? {},
  };
}

/** Append one audit row. Best-effort BY DESIGN: the audit trail must never be
 *  the reason a legitimate import fails, and a missing event is visible as a
 *  gap in an append-only log rather than as corrupted evidence. The rollback
 *  path is the exception — its session event IS the outcome, so it is written
 *  checked (see `lifecycleSweep`). */
async function recordImportEvent(
  store: EvidenceStore,
  e: Parameters<typeof importEventRow>[1],
): Promise<void> {
  try {
    await store.insertImportEvent(importEventRow(store, e));
  } catch {
    // Deliberately swallowed — see the doc comment.
  }
}

/** Read a session the caller may see, and the organization it belongs to. */
async function loadSession(
  caller: EvidenceCaller,
  sessionId: string,
): Promise<
  | {
      ok: true;
      organizationId: string;
      sourceKind: string;
      sourceLanguage: string;
      sourceFilename: string | null;
      sourceReference: string | null;
      supplierRole: string;
    }
  | { ok: false; failure: EvidenceImportFailure }
> {
  const res = await storeOf(caller).readSession(sessionId);
  if (res.error) return { ok: false, failure: classify(res.error) };
  if (!res.data) return { ok: false, failure: { kind: "not-found" } };
  return {
    ok: true,
    organizationId: res.data.organization_id as string,
    sourceKind: res.data.source_kind as string,
    sourceLanguage: res.data.source_language as string,
    sourceFilename: (res.data.source_filename as string | null) ?? null,
    sourceReference: (res.data.source_reference as string | null) ?? null,
    supplierRole: res.data.supplier_role as string,
  };
}

// ── staging ─────────────────────────────────────────────────────────────────

export interface SubmitRowsResult {
  readonly inserted: number;
  /** Rows whose source position was already staged — ignored, never duplicated. */
  readonly skipped: number;
  readonly totalInSession: number;
}

/**
 * WHERE each row sits IN ITS SOURCE — the staging key (design v3 §10, the
 * fix of N3). A parsed file states it per row (`rowIndexes`, the parser's own
 * source positions, gaps included where a line could not become a row); an
 * agent states where its batch starts (`startIndex`) and the batch's rows
 * follow on. Either way the same source row always lands on the same
 * `row_index`, so a resumed or repeated upload fills gaps and never
 * duplicates.
 */
export type RowPositions =
  | { readonly startIndex: number }
  | { readonly rowIndexes: readonly number[] };

function positionsOf(
  at: RowPositions,
  count: number,
): { ok: true; indexes: number[] } | { ok: false; problem: string } {
  const indexes =
    "rowIndexes" in at ? [...at.rowIndexes] : Array.from({ length: count }, (_, i) => at.startIndex + i);
  if (indexes.length !== count) return { ok: false, problem: "one source position per row" };
  const seen = new Set<number>();
  for (const i of indexes) {
    if (!Number.isInteger(i) || i < 0) return { ok: false, problem: `source position ${i} is not a row index` };
    if (i >= MAX_ROWS_PER_SESSION) return { ok: false, problem: "too-many-rows" };
    if (seen.has(i)) return { ok: false, problem: `source position ${i} appears twice` };
    seen.add(i);
  }
  return { ok: true, indexes };
}

/**
 * Stage a bounded batch of canonical rows.
 *
 * BOUNDED, RESUMABLE AND IDEMPOTENT. A batch is capped at
 * `MAX_ROWS_PER_SUBMIT` and a session at `MAX_ROWS_PER_SESSION` source
 * positions. `row_index` is the row's position IN THE SOURCE (never "what
 * the session already holds + i", which duplicated every row of a partial
 * retry), and `(session_id, row_index)` is unique with conflicts ignored — so
 * a retried batch, a resumed upload and a full repeat all converge on ONE
 * staged row per source row.
 */
export async function submitRows(
  caller: EvidenceCaller,
  sessionId: string,
  rows: readonly unknown[],
  at: RowPositions,
): Promise<EvidenceImportResult<SubmitRowsResult>> {
  if (rows.length === 0) return { kind: "invalid", problems: ["no rows"] };
  if (rows.length > MAX_ROWS_PER_SUBMIT) {
    return { kind: "too-many-rows", limit: MAX_ROWS_PER_SUBMIT };
  }
  const positions = positionsOf(at, rows.length);
  if (!positions.ok) {
    return positions.problem === "too-many-rows"
      ? { kind: "too-many-rows", limit: MAX_ROWS_PER_SESSION }
      : { kind: "invalid", problems: [positions.problem] };
  }

  const store = storeOf(caller);
  const session = await loadSession(store, sessionId);
  if (!session.ok) return session.failure;

  const parsed: SourceWorkRow[] = [];
  const problems: string[] = [];
  rows.forEach((raw, i) => {
    const r = sourceWorkRowSchema.safeParse(raw);
    if (r.success) parsed.push(r.data);
    else
      problems.push(
        `row ${i}: ${r.error.issues.map((x) => x.message).join("; ")}`,
      );
  });
  if (problems.length > 0) return { kind: "invalid", problems };

  const payload = parsed.map((row, i) => ({
    session_id: sessionId,
    organization_id: session.organizationId,
    row_index: positions.indexes[i],
    source_fact: row.raw,
    fact_fields: row.factFields,
    derived: row.derived,
    person_label: tidy(row.personLabel),
    context_label: row.projectLabel ? tidy(row.projectLabel) : null,
    activity_date: row.workDate ?? null,
    period_start: row.periodStart ?? null,
    period_end: row.periodEnd ?? null,
    hours: row.hours ?? null,
    activity_text: tidy(row.workText),
    record_fingerprint: recordFingerprint({
      organizationId: session.organizationId,
      organizationPersonId: null,
      personLabel: row.personLabel,
      workObjectId: null,
      projectLabel: row.projectLabel ?? null,
      workDate: row.workDate ?? null,
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      hours: row.hours ?? null,
      workText: row.workText,
    }),
  }));

  // ON CONFLICT DO NOTHING on (session_id, row_index): a retried batch is a
  // no-op rather than a duplicate.
  const ins = await store.insertStagedRows(payload);
  if (ins.error) return classify(ins.error);
  const inserted = ins.data.length;

  const total = await store.countStagedRows(sessionId);
  if (total.error) return classify(total.error);

  await recordImportEvent(store, {
    organizationId: session.organizationId,
    sessionId,
    eventType: "rows_submitted",
    payload: { submitted: parsed.length, inserted },
  });

  return {
    kind: "ok",
    inserted,
    skipped: parsed.length - inserted,
    totalInSession: total.data,
  };
}

/** A source line the parser could not turn into a row, at its position. */
export interface NotStagedSourceRow {
  readonly position: number;
  /** The parser's own reason slug (`no_date`, `no_person`). */
  readonly reason: string;
}

/** The payload stage of the `rows_submitted` event that names the source
 *  lines no row was staged for. The events CHECK admits seven types and
 *  "not staged" is none of them, so the stage is named in the payload. */
export const NOT_STAGED_STAGE = "source_rows_not_staged";

export interface StageSourceResult {
  readonly session: SessionSummary;
  /** Rows written by THIS upload. */
  readonly staged: number;
  /** Rows whose source position was already staged — a resumed or repeated
   *  upload, never a duplicate. */
  readonly alreadyStaged: number;
  readonly totalInSession: number;
  /** Source lines that could not become a row — said, never dropped. */
  readonly notStaged: number;
}

/**
 * ONE SOURCE, STAGED — the intake every file-carrying transport shares.
 *
 * Opens (or finds) the session for the source, then stages its rows in
 * bounded batches AT THEIR SOURCE POSITIONS. Re-uploading the same bytes
 * resolves to the same session and stages only the positions that are still
 * missing — so an upload that died after its first batch resumes, and a full
 * repeat writes no row at all. The source lines that could not become a row
 * are recorded on the session's trail and counted in the preview (FAILED is
 * not EMPTY).
 */
export async function stageImportSource(
  caller: EvidenceCaller,
  input: {
    readonly session: CreateSessionInput;
    readonly rows: readonly SourceWorkRow[];
    /** The parser's source position of every row, same order as `rows`. */
    readonly positions: readonly number[];
    readonly notStaged?: readonly NotStagedSourceRow[];
    /** Rows per submit; the core's bound unless a caller needs smaller. */
    readonly batchSize?: number;
  },
): Promise<EvidenceImportResult<StageSourceResult>> {
  if (input.positions.length !== input.rows.length) {
    return { kind: "invalid", problems: ["one source position per row"] };
  }
  const store = storeOf(caller);
  const session = await createImportSession(store, input.session);
  if (session.kind !== "ok") return session;

  const size = Math.min(Math.max(Math.trunc(input.batchSize ?? MAX_ROWS_PER_SUBMIT), 1), MAX_ROWS_PER_SUBMIT);
  let staged = 0;
  let alreadyStaged = 0;
  let totalInSession = 0;
  for (let i = 0; i < input.rows.length; i += size) {
    const res = await submitRows(store, session.session.id, input.rows.slice(i, i + size), {
      rowIndexes: input.positions.slice(i, i + size),
    });
    if (res.kind !== "ok") return res;
    staged += res.inserted;
    alreadyStaged += res.skipped;
    totalInSession = res.totalInSession;
  }

  const notStaged = input.notStaged ?? [];
  if (notStaged.length > 0) {
    await recordImportEvent(store, {
      organizationId: session.session.organizationId,
      sessionId: session.session.id,
      eventType: "rows_submitted",
      payload: {
        stage: NOT_STAGED_STAGE,
        count: notStaged.length,
        rows: notStaged.slice(0, 200).map((r) => ({ position: r.position, reason: r.reason })),
      },
    });
  }

  return {
    kind: "ok",
    session: session.session,
    staged,
    alreadyStaged,
    totalInSession,
    notStaged: notStaged.length,
  };
}

// ── preview ─────────────────────────────────────────────────────────────────

export type PersonState = "unmatched" | "matched" | "ambiguous" | "created";
export type ContextState =
  | "absent"
  | "unmatched"
  | "matched"
  | "ambiguous"
  | "created";
export type DuplicateState =
  | "new"
  | "duplicate"
  | "probable_duplicate"
  | "conflict";

export interface PreviewRow {
  readonly id: string;
  /** The row's position IN ITS SOURCE (0-based data line), not an upload
   *  counter — a resumed upload lands on the same index. */
  readonly rowIndex: number;
  readonly personLabel: string | null;
  /** The employee number the source states beside the name, re-read from
   *  the verbatim source line; `null` when it states none. */
  readonly externalRef?: string | null;
  readonly personState: PersonState;
  readonly personId: string | null;
  readonly personName: string | null;
  readonly personConfidence: number | null;
  readonly personCandidates: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly contextLabel: string | null;
  readonly contextState: ContextState;
  readonly workObjectId: string | null;
  readonly workObjectName: string | null;
  readonly contextCandidates: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
  readonly activityText: string | null;
  /** Which canonical fields the SOURCE stated, verbatim from staging. */
  readonly factFields: readonly string[];
  /** Every inferred field with its method and confidence. */
  readonly derived: Record<string, unknown>;
  readonly duplicateState: DuplicateState;
  readonly duplicateOfRecordId: string | null;
  /** True when this row could be committed as it stands. */
  readonly ready: boolean;
  /** True once the row HAS been committed: it is a record now, never a
   *  candidate again, and a later preview must not re-read it as a
   *  duplicate of its own record. */
  readonly committed?: boolean;
  /**
   * True when the ONLY thing between this row and `ready` is a structure the
   * source itself names and the commit PLAN prepares: a person not yet on the
   * roster. Ambiguity (several candidates) and duplicates never qualify —
   * those are the human's to decide. See `ImportPlan`.
   */
  readonly readyWithPlan: boolean;
  /** The source names a place the organization has no object for; the plan
   *  prepares it. Independent of readiness (a place is never required). */
  readonly contextWillCreate: boolean;
  /**
   * WHAT THE ROW'S CONTEXT CELL AND TEXT ACTUALLY NAME (owner command §5–§7):
   * every place of the day as its own segment with its own resolution, the
   * activity / note segments that are NOT places, and the per-place hours
   * the text states — or `unknown_split`. `null` only when the row carries
   * no context at all. Persisted on the staged row as `derived.workContexts`
   * and carried into the record's `derived` by the commit.
   */
  readonly contexts: WorkContexts | null;
  /**
   * WHAT THE HOURS FIGURE MEANS when a day cannot hold it: an aggregate over
   * a period, or unknown — machine-classified from the source's words, then
   * settled by a human. `null` for an ordinary daily figure.
   */
  readonly timeSemantics: TimeSemantics | null;
  /** True while the classification still needs the human. */
  readonly timeSemanticsOpen: boolean;
  readonly problem: string | null;
}

// ── work contexts (the per-row reading of place / activity / hours) ─────────

export type WorkContextSegmentState =
  /** Resolved to an existing object by the exact label. */
  | "matched"
  /** Resolved to an existing object by a derived reading (typo, street). */
  | "proposed"
  /** Several existing objects fit — a question for the human. */
  | "ambiguous"
  /** Nothing exists yet; the plan will create it under `name`. */
  | "new"
  /** A human chose the object (row- or label-level). */
  | "human"
  /** The plan created it during commit. */
  | "created"
  /** A human said this is not a place to keep. */
  | "ignored"
  /** An activity or a note — not a place, never an object. */
  | "none";

export interface WorkContextSegment {
  /** The source spelling. */
  readonly label: string;
  readonly kind: ContextSegmentKind;
  readonly key: string;
  readonly state: WorkContextSegmentState;
  readonly workObjectId: string | null;
  /** The canonical name: the existing object's, or the name the plan would create. */
  readonly name: string | null;
  readonly confidence: number | null;
  readonly method: string | null;
  readonly candidates: readonly { readonly id: string; readonly name: string }[];
  /** This place's hours on this row as the TEXT states them; null = not stated. */
  readonly hours: number | null;
}

export interface WorkContexts {
  /** A one-line summary for generic derived-field renderers. */
  readonly value: string;
  readonly method: "context_label_split" | "site_from_work_text" | "no_context";
  readonly confidence: number;
  readonly segments: readonly WorkContextSegment[];
  readonly allocation: HoursAllocation | null;
}

const HUMAN_CHOICE = "human_choice";

export function placeSegments(c: WorkContexts | null): readonly WorkContextSegment[] {
  return c ? c.segments.filter((s) => s.kind === "place" && s.state !== "ignored") : [];
}

/** The one object a row may carry on its own column: exactly one kept
 *  place with an id. A multi-place day keeps its places in `contexts`. */
function singleObjectId(c: WorkContexts | null): string | null {
  const places = placeSegments(c);
  if (places.length !== 1) return null;
  return places[0].workObjectId;
}

function rowContextState(c: WorkContexts | null): ContextState {
  const places = placeSegments(c);
  if (places.length === 0) return "absent";
  if (places.some((p) => p.state === "ambiguous")) return "ambiguous";
  if (places.some((p) => p.workObjectId === null)) return "unmatched";
  if (places.every((p) => p.state === "created")) return "created";
  return "matched";
}

function readPriorContexts(derived: Record<string, unknown>): WorkContexts | null {
  const c = derived.workContexts as WorkContexts | undefined;
  return c && Array.isArray(c.segments) ? c : null;
}

function readTimeSemantics(derived: Record<string, unknown>): TimeSemantics | null {
  const ts = derived.timeSemantics as TimeSemantics | undefined;
  return ts && typeof ts.value === "string" ? ts : null;
}

/**
 * Resolve one row's contexts. The human's earlier choices (label-level or
 * row-level) are carried over by segment key; everything else is recomputed
 * against the CURRENT objects so a colleague's new site is matched, never
 * duplicated.
 */
export function resolveRowContexts(input: {
  readonly contextLabel: string | null;
  readonly activityText: string | null;
  readonly hours: number | null;
  readonly prior: WorkContexts | null;
  readonly rowChosenObjectId: string | null;
  readonly objects: readonly ResolveEntity[];
  readonly knownAll: readonly KnownPlace[];
  readonly canonical: readonly CanonicalPlace[];
}): WorkContexts | null {
  let method: WorkContexts["method"] = "context_label_split";
  let confidence = 1;
  let segments: readonly ContextSegment[] = segmentsOf(input.contextLabel);
  if (segments.length === 0) {
    const sites = extractSitesFromText(input.activityText, input.knownAll);
    if (sites.length === 0) return null;
    method = "site_from_work_text";
    confidence = sites[0].confidence;
    segments = sites.map((site) => toSegment(site.label));
  }

  const priorByKey = new Map<string, WorkContextSegment>();
  for (const p of input.prior?.segments ?? []) {
    if (p.method === HUMAN_CHOICE) priorByKey.set(p.key, p);
  }
  const clusterOf = (seg: ContextSegment): CanonicalPlace | null =>
    input.canonical.find(
      (c) => c.key === seg.key || c.spellings.some((sp) => normalizeLabel(sp.label) === seg.key),
    ) ?? null;

  const blank = (seg: ContextSegment, state: WorkContextSegmentState): WorkContextSegment => ({
    label: seg.label, kind: seg.kind, key: seg.key, state,
    workObjectId: null, name: null, confidence: null, method: null, candidates: [], hours: null,
  });

  const resolved: WorkContextSegment[] = segments.map((seg) => {
    const human = priorByKey.get(seg.key);
    if (human) return human;
    if (seg.kind !== "place") return blank(seg, "none");
    const cluster = clusterOf(seg);
    const r = resolvePlace(seg, input.knownAll);
    if (r.kind === "ambiguous") {
      return {
        ...blank(seg, "ambiguous"),
        candidates: r.candidates
          .filter((c) => c.id !== null)
          .map((c) => ({ id: c.id as string, name: c.name })),
      };
    }
    if (r.kind === "matched" || r.kind === "proposed") {
      // An id: an existing object. No id: the file's own canonical spelling —
      // nothing exists yet, and the plan creates it under that name.
      return {
        ...blank(seg, r.place.id !== null ? r.kind : "new"),
        workObjectId: r.place.id,
        name: r.place.name,
        confidence: r.confidence,
        method: r.method,
      };
    }
    return {
      ...blank(seg, "new"),
      name: cluster?.name ?? seg.label,
      confidence: cluster ? 0.8 : 0.5,
      method: cluster ? "canonical_spelling" : "as_written",
    };
  });

  // A row-level human choice (the older `resolveRow` path) applies to a
  // single-place row; a multi-place day is settled per label.
  const kept = resolved.filter((s) => s.kind === "place" && s.state !== "ignored");
  if (input.rowChosenObjectId && kept.length === 1 && kept[0].method !== HUMAN_CHOICE) {
    const obj = input.objects.find((o) => o.id === input.rowChosenObjectId);
    const i = resolved.indexOf(kept[0]);
    resolved[i] = {
      ...kept[0], state: "human", workObjectId: input.rowChosenObjectId,
      name: obj?.name ?? kept[0].name, confidence: 1, method: HUMAN_CHOICE, candidates: [],
    };
  }

  const places = resolved.filter((s) => s.kind === "place" && s.state !== "ignored");
  const allocation = allocateHours(
    input.activityText,
    places.map((p) => {
      const cluster = clusterOf(toSegment(p.label));
      return {
        name: p.name ?? p.label,
        spellings: [p.label, ...(cluster?.spellings.map((sp) => sp.label) ?? [])],
      };
    }),
    input.hours,
  );
  let pi = 0;
  const withHours = resolved.map((s) =>
    s.kind === "place" && s.state !== "ignored" ? { ...s, hours: allocation.hours[pi++] ?? null } : s,
  );

  const other = resolved.length - places.length;
  return {
    value: `${places.length} place${places.length === 1 ? "" : "s"}${other > 0 ? `, ${other} other` : ""}`,
    method,
    confidence,
    segments: withHours,
    allocation: places.length > 0 ? allocation : null,
  };
}

/**
 * THE PLAN — what the commit will CREATE before it writes the rows (owner
 * directive 2026-09-16, design/final/03 §3 P0-2: "Radau 7 objektus. 5 jau
 * yra. 2 naujus paruošiau sukurti.").
 *
 * The importer used to stop at `person_not_on_roster` and hand the human a
 * per-row "create this person" form; an unmatched site was silently reduced
 * to a label. Both are structures the SOURCE states and the organization is
 * authorized to create; asking the human to create them one by one before
 * importing was the data model leaking into the human's work. The plan makes
 * them visible, reviewable and cancellable — and NOTHING in it is written
 * until the explicit commit, which then creates them through the SAME
 * authorized paths a human would have used (`createRosterPerson`, the
 * `create_work_object_v1` RPC). No new write path, no policy change.
 */
export interface ImportPlan {
  /** One entry per person to create; `externalRef` is the employee number
   *  the source states, carried onto the roster person the plan creates. */
  readonly people: readonly { readonly label: string; readonly rows: number; readonly externalRef?: string | null }[];
  /** One entry per canonical place the commit would create. `spellings`
   *  are the source's other ways of writing it, folded by the resolver
   *  (same house number, typo distance) — shown, never hidden. */
  readonly objects: readonly {
    readonly label: string;
    readonly rows: number;
    readonly spellings: readonly string[];
    /** `text` when the place was read from the work text, not the cell. */
    readonly origin: "cell" | "text";
  }[];
}

export interface ImportPreview {
  readonly sessionId: string;
  readonly organizationId: string;
  /** LITERAL false — a persisted preview is unrepresentable. */
  readonly persisted: false;
  readonly rows: readonly PreviewRow[];
  readonly plan: ImportPlan;
  /** What the session recorded about its source — shown to the human as the
   *  source IS (a spreadsheet is a spreadsheet), never as the engine's
   *  internal table shape. */
  readonly source: {
    readonly kind: string;
    readonly filename: string | null;
    readonly supplierRole: string;
    readonly language: string;
    /** Source lines the parser could not turn into a row (no date, no
     *  person), as the upload recorded them. `null` = this session recorded
     *  no count (an older upload): unknown, never zero. */
    readonly notStagedSourceRows?: number | null;
  };
  readonly counts: {
    readonly total: number;
    readonly ready: number;
    readonly needsPerson: number;
    readonly needsContext: number;
    readonly duplicates: number;
    readonly conflicts: number;
    /** Distinct people the plan would create. */
    readonly willCreatePeople: number;
    /** Distinct sites the plan would create. */
    readonly willCreateObjects: number;
    /** Rows whose source week disagrees with their explicit date. */
    readonly weekConflicts: number;
    /** Rows whose hours figure a day cannot hold and no human has yet said
     *  what it is (a period aggregate, remote work, unknown). */
    readonly timeSemanticsOpen: number;
    /** Rows whose place could not be read from the cell or the text. */
    readonly siteUnknown: number;
    /** Rows spanning several places with no per-place hours in the text. */
    readonly unallocatedMultiPlace: number;
    /** Distinct place labels the human must settle (several candidates). */
    readonly ambiguousPlaces: number;
  };
}

/** The rows a commit would write as the preview stands: the ready ones plus
 *  the ones the plan makes ready. The commit confirmation binds to EXACTLY
 *  this set on both transports (web action and MCP capability). */
export function committableRows(preview: ImportPreview): readonly PreviewRow[] {
  return preview.rows.filter((r) => r.ready || r.readyWithPlan);
}

/**
 * Build the interpretation a human (or an authorized agent) will correct and
 * approve. It resolves people and places and detects duplicates; it writes only
 * the resolution back onto the STAGING rows, never evidence.
 *
 * DUPLICATE STATES ARE FOUR, NOT TWO:
 *   `duplicate`           an identical fact already exists (same fingerprint).
 *   `probable_duplicate`  same person, same day, same place — different text.
 *   `conflict`            same person, same day, same place, same text —
 *                         DIFFERENT hours. Never silently discarded.
 *   `new`                 nothing like it is recorded.
 *
 * THE SHELL AROUND A PURE SEAM. This function reads (through the store),
 * hands everything to `computePreview` — which decides, and touches nothing —
 * and then persists the staging patches the seam returned. The synthetic
 * fixture runs the same shell on the in-memory store.
 */
export async function buildPreview(
  caller: EvidenceCaller,
  sessionId: string,
): Promise<EvidenceImportResult<{ preview: ImportPreview }>> {
  const store = storeOf(caller);
  const session = await loadSession(store, sessionId);
  if (!session.ok) return session.failure;

  const rowsRes = await store.listStagedRows(sessionId, PREVIEW_COLUMNS);
  if (rowsRes.error) return classify(rowsRes.error);

  const [roster, objects, existing, trail] = await Promise.all([
    readRoster(store, session.organizationId),
    readWorkObjects(store, session.organizationId),
    readExistingFingerprints(store, session.organizationId),
    store.listImportEvents(sessionId),
  ]);
  if (!roster.ok) return roster.failure;
  if (!objects.ok) return objects.failure;
  if (!existing.ok) return existing.failure;

  const computed = computePreview({
    sessionId,
    session,
    staged: rowsRes.data,
    roster: roster.value,
    objects: objects.value,
    existing: existing.value,
    // An unreadable trail is UNKNOWN, never "nothing was skipped".
    notStagedSourceRows: trail.error ? null : notStagedCount(trail.data),
    now: new Date().toISOString(),
  });

  // Persist the interpretation back onto STAGING only. Failure here degrades
  // the preview to non-sticky; it never blocks the human from seeing it. A
  // committed row is never in `patches` except to HEAL it (its own record
  // exists) — and the store refuses to write a row that is already committed.
  for (const u of computed.patches) {
    if (u.commit) await store.commitStagedRow(u.id, u.patch);
    else await store.updateStagedRow(u.id, u.patch);
  }

  await recordImportEvent(store, {
    organizationId: session.organizationId,
    sessionId,
    eventType: "previewed",
    payload: { rows: computed.preview.rows.length },
  });

  return { kind: "ok", preview: computed.preview };
}

/** The staging columns the preview reads — `source_fact` included, because
 *  the employee number the source stated lives only there (see
 *  `sourceExternalRef`). */
const PREVIEW_COLUMNS = [
  "id",
  "row_index",
  "person_label",
  "context_label",
  "activity_date",
  "period_start",
  "period_end",
  "hours",
  "activity_text",
  "source_fact",
  "fact_fields",
  "derived",
  "organization_person_id",
  "work_object_id",
  "person_state",
  "context_state",
  "record_fingerprint",
  "status",
  "problem",
] as const;

/** The latest count of source lines the upload could not stage. */
function notStagedCount(trail: readonly StoreRow[]): number | null {
  for (const e of trail) {
    const payload = (e.payload as Record<string, unknown> | null) ?? {};
    if (e.event_type === "rows_submitted" && payload.stage === NOT_STAGED_STAGE) {
      const n = Number(payload.count);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/**
 * THE EMPLOYEE NUMBER THE SOURCE STATED for one staged row. Staging keeps no
 * column for it — the verbatim source line does. It is re-read from that
 * line with the parser's OWN header vocabulary (`mapHeaderRow`), never a
 * second one, and only when the parser recorded it as a source fact. A line
 * whose headers carry no recognisable reference column answers `null`, and
 * the person ladder falls back to the name exactly as before.
 */
export function sourceExternalRef(
  sourceFact: Record<string, unknown> | null | undefined,
  factFields: readonly string[] | null | undefined,
): string | null {
  if (!sourceFact || typeof sourceFact !== "object") return null;
  if (!(factFields ?? []).includes("externalRef")) return null;
  const headers = Object.keys(sourceFact);
  const column = mapHeaderRow(headers).externalRef;
  if (column === undefined) return null;
  const cell = sourceFact[headers[column]];
  const value = typeof cell === "number" ? String(cell) : typeof cell === "string" ? tidy(cell) : "";
  return value === "" ? null : value;
}

/**
 * EVERY EVIDENCE IMPORT SESSION IS HISTORICAL — it records work that already
 * happened. So a partial name (initials, a missing middle name) is a QUESTION
 * even when exactly one roster person fits it (design v3 §7 condition 6): a
 * record whose person was guessed from half a name can never be verified
 * historical work, and it must never be committed as if it were known.
 */
const HISTORICAL_PERSON_MATCH = { partialName: "ask" } as const;

export interface PreviewInput {
  readonly sessionId: string;
  readonly session: {
    readonly organizationId: string;
    readonly sourceKind: string;
    readonly sourceFilename: string | null;
    readonly supplierRole: string;
    readonly sourceLanguage: string;
  };
  readonly staged: readonly Record<string, unknown>[];
  readonly roster: readonly RosterPerson[];
  readonly objects: readonly ResolveEntity[];
  readonly existing: readonly ExistingRecordKey[];
  readonly notStagedSourceRows: number | null;
  /** The one clock reading the patches carry. */
  readonly now: string;
}

export interface PreviewComputation {
  readonly preview: ImportPreview;
  /** Staging writes the shell persists. `commit: true` marks a HEAL: the row's
   *  own record already exists, so its final state and `committed` land in
   *  one write. */
  readonly patches: readonly {
    readonly id: string;
    readonly patch: Record<string, unknown>;
    readonly commit?: true;
  }[];
}

/**
 * THE PREVIEW SEAM — pure. Staged rows, the roster, the objects and the
 * existing record keys in; every row's reading, the plan, the counts and the
 * staging patches out. No IO, no clock (`now` is an input), no store.
 */
export function computePreview(input: PreviewInput): PreviewComputation {
  const { sessionId, session, staged } = input;
  const roster = { value: input.roster };
  const objects = { value: input.objects };
  const existing = { value: input.existing };

  const personCache = new Map<string, ReturnType<typeof matchPerson>>();

  // THE SESSION'S OWN PLACES, ONCE. Every explicit place segment of every
  // row (and the site read from the text of rows with an empty cell) is
  // clustered by most frequent spelling and resolved against the objects
  // the organization already has. Rows then resolve against BOTH: existing
  // objects (an id) and the file's canonical spellings (no id yet — the
  // plan creates them). A canonical place that already exists is not listed
  // twice, so an exact label can never be "ambiguous" against itself.
  const { canonical, knownAll } = sessionPlaces(staged, objects.value);

  const preview: PreviewRow[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const heals: { id: string; patch: Record<string, unknown> }[] = [];

  for (const s of staged) {
    const personLabel = (s.person_label as string | null) ?? null;
    const contextLabel = (s.context_label as string | null) ?? null;
    // The employee number the source stated beside the name — an identifier
    // outranks a name on the person ladder (`matchPerson`).
    const externalRef = sourceExternalRef(
      s.source_fact as Record<string, unknown> | null,
      s.fact_fields as string[] | null,
    );

    // A resolution already recorded on the row WINS — a human or an agent
    // settled this ambiguity and re-matching must not undo their decision.
    const chosenPersonId = (s.organization_person_id as string | null) ?? null;
    const chosenObjectId = (s.work_object_id as string | null) ?? null;

    let personState: PersonState = "unmatched";
    let personId: string | null = chosenPersonId;
    let personName: string | null = null;
    let personConfidence: number | null = null;
    let personCandidates: { id: string; name: string }[] = [];

    if (chosenPersonId) {
      personState = (s.person_state as PersonState) ?? "matched";
      personName =
        roster.value.find((p) => p.id === chosenPersonId)?.displayName ?? null;
      personConfidence = 1;
    } else if (personLabel) {
      const key = `${personLabel.toLowerCase()}|${externalRef ?? ""}`;
      let m = personCache.get(key);
      if (!m) {
        m = matchPerson({ name: personLabel, externalRef }, roster.value, HISTORICAL_PERSON_MATCH);
        personCache.set(key, m);
      }
      if (m.kind === "matched") {
        personState = "matched";
        personId = m.personId;
        personName = m.displayName;
        personConfidence = m.confidence;
      } else if (m.kind === "ambiguous") {
        personState = "ambiguous";
        personCandidates = m.candidates.map((c) => ({
          id: c.id,
          name: c.displayName,
        }));
      }
    }

    // THE CONTEXTS — every place of the day, each resolved on its own; the
    // activity / note segments kept but never made into a site; the site
    // read from the text when the cell is empty; per-place hours when the
    // text states them. `chosenObjectId` (a row-level human choice) and the
    // label-level choices carried in `derived.workContexts` both win over
    // re-matching.
    const priorDerived = (s.derived as Record<string, unknown> | null) ?? {};
    const contexts = resolveRowContexts({
      contextLabel,
      activityText: (s.activity_text as string | null) ?? null,
      hours: s.hours === null || s.hours === undefined ? null : Number(s.hours),
      prior: readPriorContexts(priorDerived),
      rowChosenObjectId: chosenObjectId,
      objects: objects.value,
      knownAll,
      canonical,
    });
    const contextState: ContextState = rowContextState(contexts);
    const workObjectId: string | null = singleObjectId(contexts);
    const workObjectName: string | null = workObjectId
      ? (objects.value.find((o) => o.id === workObjectId)?.name ?? null)
      : null;
    const contextCandidates: { id: string; name: string }[] =
      placeSegments(contexts).find((p) => p.state === "ambiguous")?.candidates.slice() ?? [];
    // TIME SEMANTICS. Rows staged before the classifier existed carry only
    // the old "exceeds a day" flag; they are classified now from the same
    // words, so the production session needs no re-upload. A human choice
    // already recorded always wins.
    const rowHours = s.hours === null || s.hours === undefined ? null : Number(s.hours);
    const classified: TimeSemantics | null =
      readTimeSemantics(priorDerived) ??
      classifyTimeSemantics({
        hours: rowHours,
        hasSingleDate: !!s.activity_date && !s.period_start,
        workText: (s.activity_text as string | null) ?? null,
        contextLabel,
      });
    // A classification staged before 2026-09-23 carries no source cues; they
    // are read now from the same words, so the human decides with "at least
    // 16 month" / "each month only 50 hours" in front of them.
    const timeSemantics = withSourceCues(classified, (s.activity_text as string | null) ?? contextLabel);
    const timeOpen = timeSemanticsOpen(timeSemantics);

    // The fingerprint is recomputed with whatever is now resolved, so a row
    // matched to a person collides with the same fact imported earlier.
    const fingerprint = recordFingerprint({
      organizationId: session.organizationId,
      organizationPersonId: personId,
      personLabel: personLabel ?? "",
      workObjectId,
      projectLabel: contextLabel,
      workDate: (s.activity_date as string | null) ?? null,
      periodStart: (s.period_start as string | null) ?? null,
      periodEnd: (s.period_end as string | null) ?? null,
      hours: s.hours === null || s.hours === undefined ? null : Number(s.hours),
      workText: (s.activity_text as string | null) ?? "",
    });

    const dup = classifyDuplicate(existing.value, {
      fingerprint,
      personId,
      date: (s.activity_date as string | null) ?? null,
      workObjectId,
      hours: s.hours === null || s.hours === undefined ? null : Number(s.hours),
      text: (s.activity_text as string | null) ?? "",
    });

    // A figure no day can hold (800 h on 2025-11-17) is kept as stated and
    // shown — but it is not committed until a human has looked at it and
    // said "as stated" (owner command §11: informed acknowledgement, never a
    // silent block and never a silent rewrite).
    const settled = contextState !== "ambiguous" && dup.state !== "duplicate" && !timeOpen;
    const ready = (personState === "matched" || personState === "created") && settled;
    // The plan can make a row ready only when its person is simply not on the
    // roster yet. An ambiguous person, an ambiguous place, a duplicate or an
    // unacknowledged impossible figure stays with the human.
    const readyWithPlan =
      !ready &&
      personState === "unmatched" &&
      personLabel !== null &&
      personLabel.trim() !== "" &&
      settled;
    const contextWillCreate = placeSegments(contexts).some((p) => p.state === "new");

    const problem =
      personState === "ambiguous"
        ? "person_ambiguous"
        : contextState === "ambiguous"
          ? "context_ambiguous"
          : dup.state === "duplicate"
            ? "already_imported"
            : timeOpen
              ? "time_semantics_open"
              : personState === "unmatched"
                ? "person_not_on_roster"
                : null;

    // A row whose OWN record already exists — a commit wrote the record, then
    // could not mark the row — IS committed. It must never read as a
    // duplicate of itself and be demoted to `skipped`; it is healed with ONE
    // write that carries its final state and `committed` together.
    const ownRecord =
      dup.state === "duplicate" && dup.importRowId !== null && dup.importRowId === (s.id as string);

    // A COMMITTED row is a record. Re-opening the session after the commit
    // used to re-run this loop over it, find its own record's fingerprint,
    // call it a duplicate and WRITE `status: skipped` over `committed` —
    // so the door reported "147 already imported" and the ledger lost the
    // fact that the human had committed them (found on the local proof of
    // the post-commit path, 2026-09-17). It is carried through untouched.
    if (s.status === "committed" || ownRecord) {
      if (s.status !== "committed") {
        heals.push({
          id: s.id as string,
          patch: {
            organization_person_id: personId,
            work_object_id: workObjectId,
            record_fingerprint: fingerprint,
            duplicate_state: "new",
            duplicate_of_record_id: null,
            problem: null,
            updated_at: input.now,
          },
        });
      }
      preview.push({
        id: s.id as string,
        rowIndex: s.row_index as number,
        personLabel,
        externalRef,
        personState,
        personId,
        personName,
        personConfidence,
        personCandidates,
        contextLabel,
        contextState,
        workObjectId,
        workObjectName,
        contextCandidates,
        activityDate: (s.activity_date as string | null) ?? null,
        periodStart: (s.period_start as string | null) ?? null,
        periodEnd: (s.period_end as string | null) ?? null,
        hours: s.hours === null || s.hours === undefined ? null : Number(s.hours),
        activityText: (s.activity_text as string | null) ?? null,
        factFields: (s.fact_fields as string[] | null) ?? [],
        derived: (s.derived as Record<string, unknown> | null) ?? {},
        duplicateState: "new",
        duplicateOfRecordId: null,
        ready: false,
        readyWithPlan: false,
        contextWillCreate: false,
        contexts,
        timeSemantics,
        timeSemanticsOpen: false,
        problem: "committed",
        committed: true,
      });
      continue;
    }

    preview.push({
      id: s.id as string,
      rowIndex: s.row_index as number,
      personLabel,
      externalRef,
      personState,
      personId,
      personName,
      personConfidence,
      personCandidates,
      contextLabel,
      contextState,
      workObjectId,
      workObjectName,
      contextCandidates,
      activityDate: (s.activity_date as string | null) ?? null,
      periodStart: (s.period_start as string | null) ?? null,
      periodEnd: (s.period_end as string | null) ?? null,
      hours: s.hours === null || s.hours === undefined ? null : Number(s.hours),
      activityText: (s.activity_text as string | null) ?? null,
      factFields: (s.fact_fields as string[] | null) ?? [],
      derived: (s.derived as Record<string, unknown> | null) ?? {},
      duplicateState: dup.state,
      duplicateOfRecordId: dup.recordId,
      ready,
      readyWithPlan,
      contextWillCreate,
      contexts,
      timeSemantics,
      timeSemanticsOpen: timeOpen,
      problem,
    });

    // The reading is persisted on STAGING (`derived.workContexts`) beside the
    // parser's own derived fields and the human's acknowledgement, so the
    // commit carries it into the record and a later preview keeps the
    // human's choices.
    const nextDerived: Record<string, unknown> = { ...priorDerived };
    if (contexts) nextDerived.workContexts = contexts;
    else delete nextDerived.workContexts;
    if (timeSemantics) nextDerived.timeSemantics = timeSemantics;

    updates.push({
      id: s.id as string,
      patch: {
        person_state: personState,
        organization_person_id: personId,
        person_match_confidence: personConfidence,
        context_state: contextState,
        work_object_id: workObjectId,
        derived: nextDerived,
        duplicate_state: dup.state,
        duplicate_of_record_id: dup.recordId,
        record_fingerprint: fingerprint,
        status: ready
          ? "ready"
          : dup.state === "duplicate"
            ? "skipped"
            : "needs_review",
        problem,
        updated_at: input.now,
      },
    });
  }

  // The plan: one entry per DISTINCT person the source names — its employee
  // number when it states one, else the same name normalisation the matcher
  // uses — so "Jonas Petraitis" on forty rows is one person to create, and
  // two people who share a name but not a number are never folded into one.
  const planPeople = new Map<string, { label: string; rows: number; externalRef: string | null }>();
  const planObjects = new Map<
    string,
    { label: string; rows: number; spellings: Set<string>; origin: "cell" | "text" }
  >();
  for (const r of preview) {
    if (r.readyWithPlan && r.personLabel) {
      const key = planPersonKey(r.personLabel, r.externalRef ?? null);
      const entry = planPeople.get(key) ?? { label: r.personLabel, rows: 0, externalRef: r.externalRef ?? null };
      entry.rows += 1;
      planPeople.set(key, entry);
    }
    for (const seg of placeSegments(r.contexts)) {
      if (seg.state !== "new" || !seg.name) continue;
      const key = normalizeLabel(seg.name);
      const entry = planObjects.get(key) ?? {
        label: seg.name,
        rows: 0,
        spellings: new Set<string>(),
        origin: r.contexts?.method === "site_from_work_text" ? ("text" as const) : ("cell" as const),
      };
      entry.rows += 1;
      if (normalizeLabel(seg.label) !== key) entry.spellings.add(seg.label);
      planObjects.set(key, entry);
    }
  }
  const plan: ImportPlan = {
    people: [...planPeople.values()],
    objects: [...planObjects.values()].map((o) => ({
      label: o.label,
      rows: o.rows,
      spellings: [...o.spellings],
      origin: o.origin,
    })),
  };

  return {
    patches: [...updates, ...heals.map((h) => ({ ...h, commit: true as const }))],
    preview: {
      sessionId,
      organizationId: session.organizationId,
      persisted: false,
      rows: preview,
      plan,
      source: {
        kind: session.sourceKind,
        filename: session.sourceFilename,
        supplierRole: session.supplierRole,
        language: session.sourceLanguage,
        notStagedSourceRows: input.notStagedSourceRows,
      },
      counts: {
        total: preview.length,
        ready: preview.filter((r) => r.ready).length,
        willCreatePeople: plan.people.length,
        willCreateObjects: plan.objects.length,
        weekConflicts: preview.filter(
          (r) =>
            (r.derived.calendarWeek as { method?: string } | undefined)?.method ===
            "iso_week_conflicts_with_source_week",
        ).length,
        // A person the PLAN creates is not "needed" from the human; 151 of
        // 158 rows read as unresolved on the first walk because the plan's
        // seven people were subtracted from the wrong figure.
        needsPerson: preview.filter(
          (r) =>
            r.personState === "ambiguous" ||
            (r.personState === "unmatched" && !r.readyWithPlan && !r.ready),
        ).length,
        needsContext: preview.filter((r) => r.contextState === "ambiguous")
          .length,
        timeSemanticsOpen: preview.filter((r) => r.timeSemanticsOpen).length,
        siteUnknown: preview.filter((r) => placeSegments(r.contexts).length === 0).length,
        unallocatedMultiPlace: preview.filter(
          (r) => r.contexts?.allocation?.method === "unknown_split",
        ).length,
        ambiguousPlaces: new Set(
          preview.flatMap((r) =>
            placeSegments(r.contexts)
              .filter((p) => p.state === "ambiguous")
              .map((p) => p.key),
          ),
        ).size,
        duplicates: preview.filter(
          (r) =>
            r.duplicateState === "duplicate" ||
            r.duplicateState === "probable_duplicate",
        ).length,
        conflicts: preview.filter((r) => r.duplicateState === "conflict")
          .length,
      },
    },
  };
}

/** The plan's identity of a person to create: the employee number the
 *  source states, else the normalised name. */
function planPersonKey(label: string, externalRef: string | null): string {
  return externalRef ? `ref:${externalRef}` : `name:${personKey(label)}`;
}

export interface ExistingRecordKey {
  readonly id: string;
  readonly fingerprint: string;
  readonly personId: string | null;
  readonly date: string | null;
  readonly workObjectId: string | null;
  readonly hours: number | null;
  readonly textKey: string;
  /** The staging row the record was committed from. */
  readonly importRowId?: string | null;
}

function classifyDuplicate(
  existing: readonly ExistingRecordKey[],
  row: {
    fingerprint: string;
    personId: string | null;
    date: string | null;
    workObjectId: string | null;
    hours: number | null;
    text: string;
  },
): { state: DuplicateState; recordId: string | null; importRowId: string | null } {
  const exact = existing.find((e) => e.fingerprint === row.fingerprint);
  if (exact) return { state: "duplicate", recordId: exact.id, importRowId: exact.importRowId ?? null };
  if (!row.personId || !row.date) return { state: "new", recordId: null, importRowId: null };

  const sameSlot = existing.filter(
    (e) =>
      e.personId === row.personId &&
      e.date === row.date &&
      e.workObjectId === row.workObjectId,
  );
  if (sameSlot.length === 0) return { state: "new", recordId: null, importRowId: null };

  const textKey = normalizeLabel(row.text);
  const sameText = sameSlot.find((e) => e.textKey === textKey);
  if (sameText) {
    // Same person, day, place and words — but the hours disagree. That is a
    // real contradiction between two sources and must be shown, never merged.
    return { state: "conflict", recordId: sameText.id, importRowId: null };
  }
  return { state: "probable_duplicate", recordId: sameSlot[0].id, importRowId: null };
}

/**
 * The places a session names, clustered and resolved ONCE. Explicit cell
 * segments first; then the sites read from the text of rows whose cell is
 * empty, matched against the same known set so `Hoofdgraht 13` in a text
 * folds into `Hoofdgracht 13` from the cells.
 */
export function sessionPlaces(
  staged: readonly Record<string, unknown>[],
  objects: readonly ResolveEntity[],
): { canonical: readonly CanonicalPlace[]; knownAll: readonly KnownPlace[] } {
  const segments: ContextSegment[] = [];
  const textRows: string[] = [];
  for (const s of staged) {
    const label = (s.context_label as string | null) ?? null;
    const segs = segmentsOf(label);
    if (segs.length > 0) segments.push(...segs);
    else textRows.push((s.activity_text as string | null) ?? "");
  }
  const cellKeys = new Set(segments.map((s) => s.key));
  const fromCells = canonicalPlaces(segments, objects, cellKeys);
  const known = (places: readonly CanonicalPlace[]): KnownPlace[] => [
    ...objects.map((o) => ({ id: o.id, name: o.name })),
    ...places.filter((c) => c.existing === null).map((c) => ({ id: null, name: c.name })),
  ];
  // Text sites join the clustering only when they resolve to NOTHING the
  // cells name: a text spelling that folds into a cell place is that place
  // (row-level resolution says so), and must never outvote its spelling —
  // it is recorded as one of that place's spellings instead.
  const textSpellings = new Map<string, Map<string, number>>(); // place name → spelling → rows
  for (const text of textRows) {
    for (const site of extractSitesFromText(text, known(fromCells))) {
      const seg = toSegment(site.label);
      const r = resolvePlace(seg, known(fromCells));
      if (r.kind === "new") segments.push(seg);
      else if ((r.kind === "matched" || r.kind === "proposed") && normalizeLabel(r.place.name) !== seg.key) {
        const bag = textSpellings.get(r.place.name) ?? new Map<string, number>();
        bag.set(seg.label, (bag.get(seg.label) ?? 0) + 1);
        textSpellings.set(r.place.name, bag);
      }
    }
  }
  const canonical = canonicalPlaces(segments, objects, cellKeys).map((c) => {
    const bag = textSpellings.get(c.name);
    if (!bag) return c;
    const known = new Set(c.spellings.map((sp) => sp.label));
    return {
      ...c,
      spellings: [...c.spellings, ...[...bag.entries()].filter(([l]) => !known.has(l)).map(([label, rows]) => ({ label, rows }))],
    };
  });
  return { canonical, knownAll: known(canonical) };
}

// ── reads the preview needs ─────────────────────────────────────────────────

type CoreOk<T> =
  | { ok: true; value: T }
  | { ok: false; failure: EvidenceImportFailure };

async function readRoster(
  caller: EvidenceCaller,
  organizationId: string,
): Promise<CoreOk<RosterPerson[]>> {
  const res = await storeOf(caller).readRoster(organizationId);
  if (res.error) return { ok: false, failure: classify(res.error) };
  return {
    ok: true,
    value: res.data.map((r) => ({
      id: r.id as string,
      displayName: r.display_name as string,
      normalizedName: r.normalized_name as string,
      externalRef: (r.external_ref as string | null) ?? null,
    })),
  };
}

async function readWorkObjects(
  caller: EvidenceCaller,
  organizationId: string,
): Promise<CoreOk<ResolveEntity[]>> {
  const res = await storeOf(caller).readWorkObjects(organizationId);
  // work_objects predates this feature and IS applied; a missing-object code
  // here would be a real environment problem, so it is not special-cased.
  if (res.error) return { ok: false, failure: classify(res.error) };
  return {
    ok: true,
    value: res.data
      .filter((r) => r.status === "active" || r.status === undefined)
      .map((r) => ({ id: r.id as string, name: r.name as string })),
  };
}

async function readExistingFingerprints(
  caller: EvidenceCaller,
  organizationId: string,
): Promise<CoreOk<ExistingRecordKey[]>> {
  const res = await storeOf(caller).readRecordKeys(organizationId);
  if (res.error) return { ok: false, failure: classify(res.error) };
  return {
    ok: true,
    value: res.data.map((r) => ({
      id: r.id as string,
      fingerprint: r.record_fingerprint as string,
      personId: (r.organization_person_id as string | null) ?? null,
      date: (r.activity_date as string | null) ?? null,
      workObjectId: (r.work_object_id as string | null) ?? null,
      hours: r.hours === null || r.hours === undefined ? null : Number(r.hours),
      textKey: normalizeLabel((r.original_text as string | null) ?? ""),
      importRowId: (r.import_row_id as string | null) ?? null,
    })),
  };
}

// ── roster people ───────────────────────────────────────────────────────────

export interface RosterPersonView {
  readonly id: string;
  readonly displayName: string;
  readonly externalRef: string | null;
  readonly relationshipKind: string | null;
  readonly linkState: string | null;
}

/**
 * The organization's roster, as a human or an assistant reads it.
 *
 * It exists HERE, in the core, for the same reason every other read does: the
 * import UI and the MCP capability must show the same rows under the same RLS.
 * A roster person is not a platform identity — `linkState` is returned exactly
 * as stored so no caller can mistake an unlinked name for a claimed account.
 */
export async function listRosterPeople(
  caller: DomainCaller,
  input: {
    readonly organizationId?: string | null;
    readonly search?: string | null;
    readonly limit?: number | null;
  } = {},
): Promise<
  EvidenceImportResult<{ organizationId: string; people: RosterPersonView[] }>
> {
  const org = await resolveEvidenceOrganization(caller, input.organizationId);
  if (!org.ok) {
    return org.reason === "choice-required" || org.reason === "not-a-member"
      ? { kind: "choice-required", options: org.options ?? [] }
      : { kind: "not-authorized", reason: org.reason };
  }

  let q = db(caller.supabase)
    .from("organization_people")
    .select("id, display_name, external_ref, relationship_kind, link_state")
    .eq("organization_id", org.organizationId)
    .order("display_name", { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 500));
  const search = tidy(input.search ?? "");
  // Escaped so a name containing % or _ searches for itself, not for a wildcard.
  if (search)
    q = q.ilike("display_name", `%${search.replace(/[%_\\]/g, "\\$&")}%`);
  const res = await q;
  if (res.error) return classify(res.error);

  return {
    kind: "ok",
    organizationId: org.organizationId,
    people: ((res.data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      displayName: p.display_name as string,
      externalRef: (p.external_ref as string | null) ?? null,
      relationshipKind: (p.relationship_kind as string | null) ?? null,
      linkState: (p.link_state as string | null) ?? null,
    })),
  };
}

/**
 * Create a roster person the organization knows.
 *
 * It creates an UNLINKED record only — the insert policy enforces that too.
 * This is not a platform identity and asserts nothing about who the human is;
 * the real person may later claim it (they propose, a manager confirms).
 */
export async function createRosterPerson(
  caller: EvidenceCaller,
  input: {
    readonly organizationId?: string | null;
    readonly displayName: string;
    readonly externalRef?: string | null;
    readonly relationshipKind?: string | null;
    readonly sourceNote?: string | null;
  },
): Promise<EvidenceImportResult<{ personId: string; displayName: string }>> {
  const name = tidy(input.displayName);
  if (name.length < 1 || name.length > 200) {
    return {
      kind: "invalid",
      problems: ["display name must be 1..200 characters"],
    };
  }
  const store = storeOf(caller);
  const org = await store.resolveOrganization(input.organizationId);
  if (!org.ok) return refuseOrg(org);

  const res = await store.insertRosterPerson({
    organization_id: org.organizationId,
    display_name: name,
    normalized_name: personKey(name),
    external_ref: input.externalRef?.trim() || null,
    relationship_kind: input.relationshipKind ?? "other",
    source_note: input.sourceNote ?? null,
    created_by: store.userId,
    link_state: "unlinked",
  });
  if (res.error) return classify(res.error);
  return { kind: "ok", personId: res.data.id, displayName: name };
}

/** Settle one staged row's ambiguity. Both ids are validated against the
 *  session's own organization by the composite foreign keys and by RLS. A
 *  COMMITTED row is a record and is never re-settled (design v3 §8 P3u). */
export async function resolveRow(
  caller: EvidenceCaller,
  input: {
    readonly rowId: string;
    readonly organizationPersonId?: string | null;
    readonly workObjectId?: string | null;
  },
): Promise<EvidenceImportResult<{ readonly updated: true }>> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.organizationPersonId !== undefined) {
    patch.organization_person_id = input.organizationPersonId;
    patch.person_state = input.organizationPersonId ? "matched" : "unmatched";
    patch.person_match_method = input.organizationPersonId
      ? "human_choice"
      : null;
    patch.person_match_confidence = input.organizationPersonId ? 1 : null;
  }
  if (input.workObjectId !== undefined) {
    patch.work_object_id = input.workObjectId;
    patch.context_state = input.workObjectId ? "matched" : "unmatched";
  }
  const res = await storeOf(caller).updateStagedRow(input.rowId, patch);
  if (res.error) return classify(res.error);
  if (res.data === 0) return { kind: "not-found" };
  return { kind: "ok", updated: true };
}

/**
 * Settle one PLACE LABEL for the whole session — asked once, applied to
 * every row that names it (`Travers` on 11 rows is one question, not
 * eleven). The choice is stamped into each row's `derived.workContexts`
 * with method `human_choice`, which the next preview carries over instead
 * of re-matching. Writes STAGING only.
 */
export async function resolveContextLabel(
  caller: EvidenceCaller,
  input: {
    readonly sessionId: string;
    /** The segment key (`normalizeLabel` of the source spelling). */
    readonly key: string;
    readonly decision:
      | { readonly kind: "object"; readonly workObjectId: string }
      | { readonly kind: "create"; readonly name?: string | null }
      /** The same place as another one THIS FILE names (`Hoofddienst 13` is
       *  `Hoofdgracht 13`): both are created as ONE object under `name`. */
      | { readonly kind: "alias"; readonly name: string }
      | { readonly kind: "ignore" };
  },
): Promise<EvidenceImportResult<{ readonly updated: number }>> {
  const store = storeOf(caller);
  const session = await loadSession(store, input.sessionId);
  if (!session.ok) return session.failure;
  const key = input.key.trim();
  if (key === "") return { kind: "invalid", problems: ["key"] };

  let objectName: string | null = null;
  let decision = input.decision;
  if (decision.kind === "object") {
    const wanted = decision.workObjectId;
    const objects = await readWorkObjects(caller, session.organizationId);
    if (!objects.ok) return objects.failure;
    const obj = objects.value.find((o) => o.id === wanted);
    if (!obj) return { kind: "not-found" };
    objectName = obj.name;
  } else if (decision.kind === "alias") {
    const name = tidy(decision.name);
    if (name === "") return { kind: "invalid", problems: ["name"] };
    // An alias of a place that already EXISTS is simply that object.
    const objects = await readWorkObjects(caller, session.organizationId);
    if (!objects.ok) return objects.failure;
    const r = resolvePlace(toSegment(name), objects.value.map((o) => ({ id: o.id, name: o.name })));
    if ((r.kind === "matched" || r.kind === "proposed") && r.place.id) {
      decision = { kind: "object", workObjectId: r.place.id };
      objectName = r.place.name;
    } else {
      decision = { kind: "alias", name };
    }
  }

  // A committed row is a record: no decision reaches it (design v3 §8 P3u).
  const rowsRes = await store.listStagedRows(input.sessionId, ["id", "derived"], {
    excludeStatuses: ["committed"],
  });
  if (rowsRes.error) return classify(rowsRes.error);

  let updated = 0;
  for (const s of rowsRes.data) {
    const derived = (s.derived as Record<string, unknown> | null) ?? {};
    const contexts = readPriorContexts(derived);
    if (!contexts || !contexts.segments.some((seg) => seg.key === key)) continue;
    const segments = contexts.segments.map((seg): WorkContextSegment => {
      if (seg.key !== key) return seg;
      const d = input.decision;
      if (d.kind === "object") {
        return { ...seg, state: "human", workObjectId: d.workObjectId, name: objectName, confidence: 1, method: HUMAN_CHOICE, candidates: [] };
      }
      if (d.kind === "create") {
        const name = tidy(d.name ?? seg.name ?? seg.label);
        return { ...seg, state: "new", workObjectId: null, name: name === "" ? seg.label : name, confidence: 1, method: HUMAN_CHOICE, candidates: [] };
      }
      if (d.kind === "alias") {
        return { ...seg, state: "new", workObjectId: null, name: d.name, confidence: 1, method: HUMAN_CHOICE, candidates: [] };
      }
      return { ...seg, state: "ignored", workObjectId: null, confidence: 1, method: HUMAN_CHOICE, candidates: [] };
    });
    const next: WorkContexts = { ...contexts, segments };
    const upd = await store.updateStagedRow(s.id as string, {
      work_object_id: singleObjectId(next),
      context_state: rowContextState(next),
      derived: { ...derived, workContexts: next },
      updated_at: new Date().toISOString(),
    });
    if (upd.error) return classify(upd.error);
    updated += upd.data;
  }
  return { kind: "ok", updated };
}

export interface TimeSemanticsDecision {
  readonly kind: TimeSemanticsKind;
  /** Remote / work-from-home, as the human states it; null = not stated. */
  readonly remote?: boolean | null;
  /** The period the aggregate covers, ONLY when the human knows it — two
   *  months (`YYYY-MM`, recorded at month precision) or two days
   *  (`YYYY-MM-DD`). A start alone is refused. */
  readonly periodStart?: string | null;
  readonly periodEnd?: string | null;
}

/**
 * A human says what a figure MEANS (owner correction 2026-09-16: 800 h on a
 * dated row was work from home over a broader period, not a day). The
 * source figure is never changed; what is recorded is the human's
 * classification — daily / period aggregate (optionally remote, optionally
 * with the period the human knows) / unknown. Writes STAGING only; the
 * commit then represents the row accordingly and NEVER as a day's duration
 * unless the human said "daily".
 *
 * DECISION-TIME HONESTY (owner rule 2026-09-23). The period is recorded at
 * the precision the human gave it (`periodPrecision`), and it is set against
 * what the source's own words state — a duration ("at least 16 month") and
 * a rate ("each month only 50 hours"). A span shorter than a stated minimum,
 * or a total whose per-month figure differs from a stated rate, is recorded
 * as `conflictsWithSource` beside the decision: a WARNING, never a refusal —
 * the human knows the work. A START ALONE is refused: it used to be stored
 * as a one-day period (`periodEnd ?? periodStart`), a precision nobody
 * stated. Both writers — the form action and the MCP capability — reach
 * this one rule.
 */
export async function resolveTimeSemantics(
  caller: EvidenceCaller,
  input: {
    readonly sessionId: string;
    /** Either specific rows, or every row whose semantics are still open. */
    readonly rowIds?: readonly string[];
    readonly allOpen?: boolean;
    readonly decision: TimeSemanticsDecision;
  },
): Promise<EvidenceImportResult<{ readonly updated: number; readonly conflictsWithSource: number }>> {
  const store = storeOf(caller);
  const session = await loadSession(store, input.sessionId);
  if (!session.ok) return session.failure;
  const d = input.decision;
  const human = periodFromHumanInput(d.periodStart, d.periodEnd);
  if (!human.ok) return { kind: "invalid", problems: [human.problem] };
  const { periodStart, periodEnd, precision: periodPrecision } = human;
  if (d.kind !== "period_aggregate" && (periodStart || periodEnd))
    return { kind: "invalid", problems: ["a period belongs to a period aggregate"] };

  const named = input.rowIds && input.rowIds.length > 0;
  if (!named && !input.allOpen) return { kind: "invalid", problems: ["rowIds or allOpen"] };
  // A committed row is a record: no decision reaches it (design v3 §8 P3u).
  const rowsRes = await store.listStagedRows(
    input.sessionId,
    ["id", "hours", "derived", "activity_text", "context_label"],
    named
      ? { excludeStatuses: ["committed"], ids: input.rowIds }
      : { excludeStatuses: ["committed"], problem: "time_semantics_open" },
  );
  if (rowsRes.error) return classify(rowsRes.error);

  let updated = 0;
  let conflictsWithSource = 0;
  const at = new Date().toISOString();
  for (const s of rowsRes.data) {
    const derived = (s.derived as Record<string, unknown> | null) ?? {};
    const prior = readTimeSemantics(derived);
    const sourceHours = prior?.sourceHours ?? (s.hours === null || s.hours === undefined ? 0 : Number(s.hours));
    // What the source's words state — recorded at classification, or read
    // now from the same words for a row classified before the cues existed.
    const sourceCues =
      prior && prior.sourceCues !== undefined
        ? prior.sourceCues
        : (extractSourceTimeCues((s.activity_text as string | null) ?? null) ??
          extractSourceTimeCues((s.context_label as string | null) ?? null));
    const conflicts =
      d.kind === "period_aggregate"
        ? sourceTimeConflicts({ hours: sourceHours, periodStart, periodEnd, cues: sourceCues })
        : [];
    if (conflicts.length > 0) conflictsWithSource += 1;
    const next: TimeSemantics = {
      value: d.kind,
      method: HUMAN_CHOICE,
      confidence: 1,
      sourceHours,
      note: prior?.note ?? null,
      remote: d.remote ?? prior?.remote ?? null,
      periodStart,
      // Both bounds, or neither: a start alone never becomes a one-day period.
      periodEnd,
      periodPrecision,
      sourceCues: sourceCues ?? null,
      conflictsWithSource: conflicts.length > 0,
      conflicts,
    };
    const upd = await store.updateStagedRow(s.id as string, {
      derived: { ...derived, timeSemantics: next, timeSemanticsDecidedBy: { value: store.userId, method: HUMAN_CHOICE, confidence: 1, note: at } },
      updated_at: at,
    });
    if (upd.error) return classify(upd.error);
    updated += upd.data;
  }
  return { kind: "ok", updated, conflictsWithSource };
}

// ── commit ──────────────────────────────────────────────────────────────────

export interface CommitResult {
  readonly written: number;
  readonly skippedDuplicates: number;
  readonly notReady: number;
  readonly recordIds: readonly string[];
  /** Structures the commit PLAN created before writing (0 when no plan ran). */
  readonly createdPeople: number;
  readonly createdObjects: number;
}

/** What the explicit commit is allowed to CREATE. Both default to true — the
 *  system prepares, the human reviewed the plan in the preview and confirmed.
 *  Either may be switched off, in which case those rows stay `needs_review`. */
export interface CommitPlanOptions {
  readonly createPeople: boolean;
  readonly createObjects: boolean;
  /** `relationship_kind` for people the plan creates (`other` when absent). */
  readonly relationshipKind?: string | null;
}

/**
 * APPLY THE PLAN — the commit's first act, and the only place structures are
 * created from a source. Re-reads the roster and the objects FIRST so that a
 * person or site created by an earlier, interrupted commit (or by a colleague
 * a minute ago) is matched, never duplicated; then creates what is still
 * missing through the existing authorized paths and stamps the staged rows,
 * so the preview that follows classifies them exactly as if a human had
 * chosen them. Returns how many of each were created.
 */
async function applyPlan(
  caller: EvidenceCaller,
  session: { readonly organizationId: string },
  sessionId: string,
  plan: CommitPlanOptions,
): Promise<{ createdPeople: number; createdObjects: number } | EvidenceImportFailure> {
  let createdPeople = 0;
  let createdObjects = 0;
  if (!plan.createPeople && !plan.createObjects) return { createdPeople, createdObjects };
  const store = storeOf(caller);

  // A committed row is a record — the plan never touches it (design v3 §8 P3u).
  const rowsRes = await store.listStagedRows(
    sessionId,
    ["id", "person_label", "context_label", "person_state", "context_state", "status", "problem", "derived", "source_fact", "fact_fields"],
    { excludeStatuses: ["skipped", "committed"] },
  );
  if (rowsRes.error) return classify(rowsRes.error);
  const staged = rowsRes.data;

  if (plan.createPeople) {
    const roster = await readRoster(store, session.organizationId);
    if (!roster.ok) return roster.failure;
    const current = [...roster.value];
    const byKey = new Map<string, string>(); // plan person key → id
    for (const s of staged) {
      if (s.person_state !== "unmatched") continue;
      const label = (s.person_label as string | null) ?? "";
      if (label.trim() === "") continue;
      // The employee number the source states travels with the name: it
      // matches first, and a person the plan creates carries it.
      const externalRef = sourceExternalRef(s.source_fact as Record<string, unknown> | null, s.fact_fields as string[] | null);
      const key = planPersonKey(label, externalRef);
      let personId = byKey.get(key) ?? null;
      if (!personId) {
        // Fresh match against the CURRENT roster: an ambiguous name is still
        // the human's, an exact one is reused, only a true absence is created.
        const m = matchPerson({ name: label, externalRef }, current, HISTORICAL_PERSON_MATCH);
        if (m.kind === "matched") personId = m.personId;
        else if (m.kind === "ambiguous") continue;
        else {
          const created = await createRosterPerson(caller, {
            organizationId: session.organizationId,
            displayName: label,
            externalRef,
            relationshipKind: plan.relationshipKind ?? "other",
            sourceNote: `evidence import ${sessionId}`,
          });
          if (created.kind !== "ok") return created;
          personId = created.personId;
          createdPeople += 1;
          current.push({
            id: personId,
            displayName: created.displayName,
            normalizedName: personKey(label),
            externalRef,
          });
        }
        byKey.set(key, personId);
      }
      const upd = await store.updateStagedRow(s.id as string, {
        organization_person_id: personId,
        person_state: "created",
        person_match_method: "plan_created",
        person_match_confidence: 1,
        updated_at: new Date().toISOString(),
      });
      if (upd.error) return classify(upd.error);
    }
  }

  if (plan.createObjects) {
    const objects = await readWorkObjects(store, session.organizationId);
    if (!objects.ok) return objects.failure;
    const current = [...objects.value];
    const byKey = new Map<string, string>(); // normalizeLabel(canonical name) → id
    for (const s of staged) {
      // The CANONICAL places of the row, not its cell: `Hoofdgracht 3;
      // Kantoor` creates two objects (or none, if both exist), and
      // `Hoofdgraht 3` creates nothing — it is a spelling of `Hoofdgracht 3`.
      const derived = (s.derived as Record<string, unknown> | null) ?? {};
      const contexts = readPriorContexts(derived);
      if (!contexts) continue;
      let changed = false;
      // SEQUENTIAL, not Promise.all (B1 walk, 2026-09-17): one row's segments
      // can name the SAME canonical place twice — `Travers 19; Travers`, where
      // the street-only spelling resolves to "Travers 19" — and two concurrent
      // creations both passed the `byKey` memo before either had written it,
      // so production received two "Travers 19" objects 2.5 ms apart. In
      // order, the second segment finds the first one's id.
      const placeSegment = async (seg: WorkContextSegment): Promise<WorkContextSegment> => {
          if (seg.kind !== "place" || seg.state !== "new" || !seg.name) return seg;
          const key = normalizeLabel(seg.name);
          let objectId = byKey.get(key) ?? null;
          if (!objectId) {
            // Fresh match against the CURRENT objects: an exact one is reused,
            // several is still the human's, only a true absence is created.
            const m = resolvePlace(toSegment(seg.name), current.map((o) => ({ id: o.id, name: o.name })));
            if (m.kind === "matched" || m.kind === "proposed") objectId = m.place.id;
            else if (m.kind === "ambiguous") return seg;
            else {
              // THE existing insert path for objects (membership-based authority
              // inside the RPC `create_work_object_v1`, behind the store). It
              // answers a status, not an id, so the register is re-read and
              // matched — the same way a human's "add" is read back.
              const rpc = await store.createWorkObject({
                p_organization_id: session.organizationId,
                p_name: tidy(seg.name).slice(0, 160),
                p_project_id: null,
                p_country: null,
                p_region: null,
                p_city: null,
                p_address_line: null,
                p_latitude: null,
                p_longitude: null,
              });
              if (rpc.error) throw classify(rpc.error);
              const status = rpc.data;
              if (status === "not_allowed") throw { kind: "not-authorized", reason: "not-authorized" } as EvidenceImportFailure;
              if (status !== "created") return seg; // invalid / limit_reached: the row keeps its label
              const again = await readWorkObjects(store, session.organizationId);
              if (!again.ok) throw again.failure;
              current.splice(0, current.length, ...again.value);
              const found = resolvePlace(toSegment(seg.name), current.map((o) => ({ id: o.id, name: o.name })));
              if (found.kind !== "matched" && found.kind !== "proposed") return seg;
              objectId = found.place.id as string;
              createdObjects += 1;
            }
            if (objectId) byKey.set(key, objectId);
          }
          if (!objectId) return seg;
          changed = true;
          return { ...seg, state: "created", workObjectId: objectId };
      };
      const segments = await (async (): Promise<WorkContextSegment[] | EvidenceImportFailure> => {
        const out: WorkContextSegment[] = [];
        for (const seg of contexts.segments) out.push(await placeSegment(seg));
        return out;
      })().catch((failure: EvidenceImportFailure) => failure);
      if (!Array.isArray(segments)) return segments;
      if (!changed) continue;
      const next: WorkContexts = { ...contexts, segments };
      const upd = await store.updateStagedRow(s.id as string, {
        work_object_id: singleObjectId(next),
        context_state: rowContextState(next),
        derived: { ...derived, workContexts: next },
        updated_at: new Date().toISOString(),
      });
      if (upd.error) return classify(upd.error);
    }
  }

  // The events table's CHECK admits seven event types and "plan applied" is
  // not one of them; widening it is a schema change (RED). The plan is the
  // commit's own preparation, so it is recorded as the `previewed` stage it
  // re-materialises, with the stage named in the payload — never dropped.
  await recordImportEvent(store, {
    organizationId: session.organizationId,
    sessionId,
    eventType: "previewed",
    payload: { stage: "plan_applied", createdPeople, createdObjects },
  });
  return { createdPeople, createdObjects };
}

/**
 * THE ONE WRITE THAT PRODUCES EVIDENCE.
 *
 * ATOMIC: every ready row is written by ONE statement, so a failure cannot
 * leave a half-imported month that looks complete.
 *
 * IDEMPOTENT: `(organization_id, record_fingerprint)` is unique and the insert
 * is `ON CONFLICT DO NOTHING`, so committing the same session twice writes
 * nothing the second time and reports it as skipped rather than as success.
 *
 * The `evidence_state` written is always a REPORTED one — the column's CHECK
 * has no attested value, so this function is structurally incapable of
 * producing attested or verified evidence.
 */
export async function commitImport(
  caller: EvidenceCaller,
  sessionId: string,
  opts?: {
    readonly evidenceState?: ReportedEvidenceState;
    /** The reviewed plan. Absent = the default plan (create both). */
    readonly plan?: CommitPlanOptions;
  },
): Promise<EvidenceImportResult<CommitResult>> {
  const store = storeOf(caller);
  const session = await loadSession(store, sessionId);
  if (!session.ok) return session.failure;

  // FIRST the plan, THEN the rows: what the source named and the preview
  // showed as "will be created" is created now, under the same explicit
  // approval, and the preview is rebuilt so fingerprints, duplicates and
  // readiness are computed against the people and sites that now exist.
  const planOpts: CommitPlanOptions = opts?.plan ?? {
    createPeople: true,
    createObjects: true,
  };
  const applied = await applyPlan(store, session, sessionId, planOpts);
  if ("kind" in applied) return applied;
  if (planOpts.createPeople || planOpts.createObjects) {
    const re = await buildPreview(store, sessionId);
    if (re.kind !== "ok") return re;
  }

  const rowsRes = await store.listStagedRows(
    sessionId,
    [
      "id",
      "row_index",
      "organization_person_id",
      "work_object_id",
      "context_label",
      "activity_date",
      "period_start",
      "period_end",
      "hours",
      "activity_text",
      "source_fact",
      "fact_fields",
      "derived",
      "record_fingerprint",
      "status",
      "person_match_confidence",
    ],
    { status: "ready" },
  );
  if (rowsRes.error) return classify(rowsRes.error);
  const ready = rowsRes.data;

  const notReadyRes = await store.countStagedRows(sessionId, { excludeStatuses: ["ready"] });
  const notReady = notReadyRes.error ? 0 : notReadyRes.data;

  if (ready.length === 0) {
    return {
      kind: "ok",
      written: 0,
      skippedDuplicates: 0,
      notReady,
      recordIds: [],
      createdPeople: applied.createdPeople,
      createdObjects: applied.createdObjects,
    };
  }

  const { records: payload, finalState } = buildCommitRows({
    sessionId,
    session,
    ready,
    importedAt: new Date().toISOString(),
    userId: store.userId,
    evidenceState: opts?.evidenceState ?? "ORGANIZATION_REPORTED",
  });

  const ins = await store.insertRecords(payload);
  if (ins.error) return classify(ins.error);

  const written = ins.data.length;
  const writtenRowIds = new Set(ins.data.map((r) => r.import_row_id));

  // ── EVIDENCE → COMPETENCY ────────────────────────────────────────────────
  //
  // The records are the FACT. These are a DERIVED reading of them: which
  // canonical skills the organization's own description of the work named.
  // The table shipped with this schema and had no producer until now, which
  // left REAL WORK → EVIDENCE → CAPABILITY broken at its last link.
  //
  // BEST-EFFORT BY DESIGN. A failure here must never fail a commit that has
  // already written evidence: the evidence is what the person's history rests
  // on, and a missing derivation is recoverable (re-running the commit
  // re-derives it) while a lost import is not. So this neither returns nor
  // throws on failure.
  //
  // Idempotent: `ignoreDuplicates` against the table's unique
  // (record_id, term), so the safely-re-runnable commit above stays safely
  // re-runnable.
  const textByRowId = new Map(
    ready.map((r) => [r.id as string, (r.activity_text as string | null) ?? ""]),
  );
  const signalRows = ins.data
    .filter((r) => writtenRowIds.has(r.import_row_id))
    .flatMap((r) =>
      competencySignalRows(
        session.organizationId,
        r.id,
        deriveCompetencySignals(textByRowId.get(r.import_row_id)),
      ),
    );
  if (signalRows.length > 0) {
    const sig = await store.insertCompetencySignals(signalRows);
    if (sig.error) {
      // Named, not swallowed: a read that fails must never look like "this
      // person demonstrated nothing" (SEP-7).
      console.error(
        "[evidence] competency signals not written:",
        sig.error.code,
        sig.error.message,
      );
    }
  }

  // MARK THE STAGED ROWS — each in ONE write that carries its final state
  // and `committed` together (design v3 §8 P3u, §12): a committed staging
  // row is immutable, so nothing may need to write it afterwards, and the
  // row keeps exactly what its record was built from. Only rows whose record
  // THIS call wrote are marked; a row whose fact was already recorded stays
  // `ready`, and the next preview reads it (its own record → healed as
  // committed; another row's → a duplicate). CHECKED: a mark that fails is
  // said, never swallowed — re-running the commit converges, because the
  // records are idempotent and the preview heals the row.
  const toMark = finalState.filter((f) => writtenRowIds.has(f.id));
  for (let i = 0; i < toMark.length; i += COMMIT_MARK_CONCURRENCY) {
    const marks = await Promise.all(
      toMark.slice(i, i + COMMIT_MARK_CONCURRENCY).map((f) => store.commitStagedRow(f.id, f.state)),
    );
    const failed = marks.find((m) => m.error);
    if (failed?.error) return classify(failed.error);
  }

  await recordImportEvent(store, {
    organizationId: session.organizationId,
    sessionId,
    eventType: "committed",
    payload: { written, skippedDuplicates: ready.length - written, notReady },
  });

  return {
    kind: "ok",
    written,
    skippedDuplicates: ready.length - written,
    notReady,
    recordIds: ins.data.filter((r) => writtenRowIds.has(r.import_row_id)).map((r) => r.id),
    createdPeople: applied.createdPeople,
    createdObjects: applied.createdObjects,
  };
}

/** Committing marks in flight at once — bounded, like every batch here. */
const COMMIT_MARK_CONCURRENCY = 20;

export interface CommitRowsInput {
  readonly sessionId: string;
  readonly session: {
    readonly organizationId: string;
    readonly sourceKind: string;
    readonly sourceLanguage: string;
    readonly sourceFilename: string | null;
    readonly sourceReference: string | null;
    readonly supplierRole: string;
  };
  /** The staged rows in `ready`, in source order. */
  readonly ready: readonly Record<string, unknown>[];
  readonly importedAt: string;
  /** The human the records name as supplier and importer. */
  readonly userId: string;
  readonly evidenceState: ReportedEvidenceState;
}

/**
 * THE COMMIT SEAM — pure. Ready staged rows in; the record rows the ONE
 * insert writes, and each staging row's final state, out. No IO; the clock
 * reading and the acting human are inputs.
 */
export function buildCommitRows(input: CommitRowsInput): {
  readonly records: readonly StoreRow[];
  readonly finalState: readonly { readonly id: string; readonly state: StoreRow }[];
} {
  const { session, sessionId, ready, importedAt } = input;
  const state: ReportedEvidenceState = input.evidenceState;

  // The per-session tamper-evidence chain, in row order (doctrine 3.3).
  let prev: string | null = null;
  const payload = ready.map((r) => {
    const fingerprint = r.record_fingerprint as string;
    const self = chainHash(prev, fingerprint, importedAt);
    // WHAT THE FIGURE MEANS decides how the record is written (owner
    // correction 2026-09-16). A DAILY figure is the day's hours. A PERIOD
    // AGGREGATE (800 h of work from home over months) is a period record
    // when the human stated the period — `period_start/end` + `hours`, the
    // shape the schema already has — and otherwise a dated source fact
    // whose canonical duration is UNKNOWN (`hours = null`). UNKNOWN
    // semantics are likewise a dated fact with no duration. The source
    // figure is always verbatim in `source_fact` and in
    // `derived.timeSemantics.sourceHours`; nothing operational can sum it
    // as a day (SEP-1, SEP-7). A period needs BOTH bounds (owner rule
    // 2026-09-23): a start alone is not a period, and is never written as a
    // one-day span — such a row stays a dated fact with unknown duration.
    const derived = { ...((r.derived as Record<string, unknown> | null) ?? {}) };
    const ts = readTimeSemantics(derived);
    const daily = countsAsDailyHours(ts);
    const period = ts && ts.value === "period_aggregate" && ts.periodStart && ts.periodEnd ? ts : null;
    const legacyExceeds =
      !ts && (derived.hoursPlausibility as { method?: string } | undefined)?.method === HOURS_EXCEED_DAY_METHOD;
    const row = {
      organization_id: session.organizationId,
      organization_person_id: r.organization_person_id as string,
      activity_kind: "work",
      // The source's own words for WHERE, verbatim — the column exists for
      // exactly this and was being written null. A multi-place day keeps
      // its places in `derived.workContexts`; the single object goes here.
      context_label: (r.context_label as string | null) ?? null,
      work_object_id: (r.work_object_id as string | null) ?? null,
      activity_date: period ? null : ((r.activity_date as string | null) ?? null),
      period_start: period ? period.periodStart : ((r.period_start as string | null) ?? null),
      period_end: period ? period.periodEnd : ((r.period_end as string | null) ?? null),
      hours: period ? period.sourceHours : daily && !legacyExceeds ? (r.hours ?? null) : null,
      original_text: (r.activity_text as string | null) ?? "",
      original_language: session.sourceLanguage,
      evidence_state: state,
      supplied_by_organization_id: session.organizationId,
      supplier_role: session.supplierRole,
      supplied_by_profile_id: input.userId,
      imported_by_profile_id: input.userId,
      imported_at: importedAt,
      session_id: sessionId,
      import_row_id: r.id as string,
      source_kind: session.sourceKind,
      source_filename: session.sourceFilename,
      source_reference: session.sourceReference,
      source_fact: r.source_fact ?? {},
      derived,
      confidence: r.person_match_confidence ?? null,
      record_fingerprint: fingerprint,
      hash_prev: prev,
      hash_self: self,
    };
    prev = self;
    return row;
  });

  // Each staging row's final state is exactly what its record was built
  // from; the committing write sets it together with `committed`.
  const finalState = ready.map((r) => ({
    id: r.id as string,
    state: {
      organization_person_id: (r.organization_person_id as string | null) ?? null,
      work_object_id: (r.work_object_id as string | null) ?? null,
      record_fingerprint: r.record_fingerprint as string,
      derived: (r.derived as Record<string, unknown> | null) ?? {},
      duplicate_state: "new",
      duplicate_of_record_id: null,
      problem: null,
      updated_at: importedAt,
    } satisfies StoreRow,
  }));

  return { records: payload, finalState };
}

// ── the rollback path ───────────────────────────────────────────────────────

/**
 * WITHDRAW every record an import produced — the recovery path.
 *
 * It DELETES NOTHING. Each record gains an append-only `withdrawn` event, so
 * the evidence and the reason both stay readable and the action itself is part
 * of the audit trail. `reinstateImport` is its exact inverse.
 *
 * This is why `organization_evidence_records` has no UPDATE and no DELETE
 * policy: undoing an import must not be able to rewrite history.
 */
export async function withdrawImport(
  caller: EvidenceCaller,
  sessionId: string,
  note?: string | null,
): Promise<EvidenceImportResult<LifecycleResult>> {
  return lifecycleSweep(caller, sessionId, "withdrawn", note);
}

export async function reinstateImport(
  caller: EvidenceCaller,
  sessionId: string,
  note?: string | null,
): Promise<EvidenceImportResult<LifecycleResult>> {
  return lifecycleSweep(caller, sessionId, "reinstated", note);
}

export interface LifecycleResult {
  /** Record events THIS call wrote. */
  readonly affected: number;
  /** `already_*` when the session was already in the requested state and
   *  nothing was written at all. */
  readonly outcome: "withdrawn" | "reinstated" | "already_withdrawn" | "already_reinstated";
}

/** Every record of one session with its standing, page by page — never
 *  capped at the size of one page. */
async function readSessionRecords(
  store: EvidenceStore,
  sessionId: string,
): Promise<CoreOk<SessionRecordWithEvents[]>> {
  const out: SessionRecordWithEvents[] = [];
  for (let offset = 0; offset < MAX_ROWS_PER_SESSION; offset += SESSION_RECORD_PAGE) {
    const page = await store.listSessionRecords(sessionId, { offset, limit: SESSION_RECORD_PAGE });
    if (page.error) return { ok: false, failure: classify(page.error) };
    out.push(...page.data);
    if (page.data.length < SESSION_RECORD_PAGE) break;
  }
  return { ok: true, value: out };
}

function standingOf(r: SessionRecordWithEvents) {
  return deriveEvidenceStanding(
    r.evidence_state as ReportedEvidenceState,
    r.events.map(
      (e): RecordLifecycleEvent => ({
        eventType: e.event_type as RecordLifecycleEvent["eventType"],
        actorRole: e.actor_role,
        createdAt: e.created_at,
        actorProfileId: e.actor_profile_id,
      }),
    ),
    r.subject_profile_id,
  );
}

/**
 * THE BATCH ROLLBACK (design v3 §10) — checked, idempotent, zero-record safe.
 *
 *   1. ONE insert writes the event for every record of the session that is
 *      not already in the requested state. Errors are returned, never
 *      swallowed.
 *   2. THEN the session's `rolled_back` / `reinstated` event is appended —
 *      CHECKED: it is the outcome the batch audit shows, not a courtesy.
 *   3. A session that committed nothing still gets its session event: a
 *      withdrawal of an empty import is an act, not a silent no-op.
 *   4. When the session is already in the requested state and every record
 *      agrees, nothing at all is written and the answer is `already_*`. A
 *      retry after a failure between 1 and 2 finds nothing to do in 1 and
 *      completes 2 — so the sweep converges.
 *
 * It deletes and updates nothing: every write is an append.
 */
async function lifecycleSweep(
  caller: EvidenceCaller,
  sessionId: string,
  eventType: "withdrawn" | "reinstated",
  note?: string | null,
): Promise<EvidenceImportResult<LifecycleResult>> {
  const store = storeOf(caller);
  const session = await loadSession(store, sessionId);
  if (!session.ok) return session.failure;
  const importEvent = eventType === "withdrawn" ? "rolled_back" : "reinstated";

  const records = await readSessionRecords(store, sessionId);
  if (!records.ok) return records.failure;
  const pending = records.value.filter((r) =>
    eventType === "withdrawn" ? !standingOf(r).withdrawn : standingOf(r).withdrawn,
  );

  // The session's own lifecycle, newest first: withdrawn means the latest
  // lifecycle event on its trail is `rolled_back`.
  const trail = await store.listImportEvents(sessionId);
  if (trail.error) return classify(trail.error);
  const latest = trail.data.find((e) => e.event_type === "rolled_back" || e.event_type === "reinstated");
  const sessionWithdrawn = latest?.event_type === "rolled_back";
  const alreadyThere = eventType === "withdrawn" ? sessionWithdrawn : !sessionWithdrawn;
  if (pending.length === 0 && alreadyThere) {
    return {
      kind: "ok",
      affected: 0,
      outcome: eventType === "withdrawn" ? "already_withdrawn" : "already_reinstated",
    };
  }

  let affected = 0;
  if (pending.length > 0) {
    const ins = await store.insertRecordEvents(
      pending.map((r) => ({
        organization_id: session.organizationId,
        record_id: r.id,
        event_type: eventType,
        // The supplying organization acts on its own records (design v3 §8
        // P4: an organization never names another as the actor).
        actor_organization_id: session.organizationId,
        actor_profile_id: store.userId,
        note: note ?? null,
      })),
    );
    if (ins.error) return classify(ins.error);
    affected = ins.data.length;
  }

  const sessionEvent = await store.insertImportEvent(
    importEventRow(store, {
      organizationId: session.organizationId,
      sessionId,
      eventType: importEvent,
      payload: { records: pending.length },
    }),
  );
  if (sessionEvent.error) return classify(sessionEvent.error);

  return { kind: "ok", affected, outcome: eventType };
}

// ── attestation ─────────────────────────────────────────────────────────────

export const ATTESTATION_ROLES = [
  "employer",
  "agency",
  "client",
  "end_client",
  "project_owner",
  "subcontractor",
  "education_provider",
  "training_provider",
  "assessor",
  "verifier",
  "placement_provider",
  "public_body",
  "sector_body",
  "other",
] as const;

/**
 * The organization attesting a record it supplied.
 *
 * Attesting one's OWN work is ALLOWED (owner decision 3): a sole trader
 * legitimately has nobody above them, and blocking them would erase real
 * history. What it must never become is INDEPENDENT VERIFICATION, and the
 * separation is semantic rather than a block:
 *
 *   · when the actor is the subject, `deriveEvidenceStanding` derives
 *     SELF_ATTESTED — never ORGANIZATION_ATTESTED — and
 *     `countsAsIndependentlyVerified` is false for it, permanently;
 *   · `independently_verified` is a DIFFERENT event with its own policy,
 *     writable only by someone managing an organization recorded as a party in
 *     a verifying role, who does NOT manage the supplying organization, and who
 *     is not the subject.
 *
 * So a sole trader can say "my organization stands behind this record" and can
 * never, by any path, make it independently verified.
 *
 * IN THE CAPACITY THE RECORD WAS SUPPLIED IN, AND NO OTHER (design v3 §8 P4).
 * The organization attests as the record's own `supplier_role` — an employer
 * cannot stand behind its timesheet "as the client", and a role that is not
 * the record's is refused BY NAME here rather than as a bare 42501 later.
 * Omitting the role means exactly that role.
 */
export async function attestRecord(
  caller: EvidenceCaller,
  input: {
    readonly recordId: string;
    readonly actorRole?: (typeof ATTESTATION_ROLES)[number] | null;
    readonly note?: string | null;
  },
): Promise<EvidenceImportResult<{ eventId: string }>> {
  const store = storeOf(caller);
  const rec = await store.readRecord(input.recordId);
  if (rec.error) return classify(rec.error);
  if (!rec.data) return { kind: "not-found" };
  const supplierRole = (rec.data.supplier_role as string | null) ?? "other";
  if (input.actorRole && input.actorRole !== supplierRole) {
    return { kind: "invalid", problems: [`attestation role must be the record's supplier role (${supplierRole})`] };
  }

  const res = await store.insertRecordEvents([
    {
      organization_id: rec.data.organization_id as string,
      record_id: input.recordId,
      event_type: "attested",
      actor_role: supplierRole,
      actor_organization_id: rec.data.organization_id as string,
      actor_profile_id: store.userId,
      note: input.note ?? null,
    },
  ]);
  if (res.error) {
    // 42501 here means the caller does not manage this organization — a real
    // authorization refusal, reported as such rather than as a generic failure.
    if (res.error.code === "42501") {
      return { kind: "not-authorized", reason: "not-authorized" };
    }
    return classify(res.error);
  }
  const eventId = res.data[0]?.id;
  if (!eventId) return { kind: "error" };
  return { kind: "ok", eventId };
}

/**
 * The organization attesting EVERY live record of one import session — the
 * same `attested` event `attestRecord` writes, once per record, in one
 * append (owner correction 2026-09-17: a historical timesheet whose hours
 * were confirmed in the real work process and paid is not merely
 * "organization reported"; the organization STANDS BEHIND all of it).
 *
 * What this is NOT: it creates no record, changes no hour, no state column,
 * no source fact — the standing is DERIVED from the event, exactly as for a
 * single attestation, and a subject who attests their own row still derives
 * SELF_ATTESTED. Records already attested (and not since withdrawn) and
 * withdrawn records are skipped, so a repeat is idempotent. Authority is the
 * INSERT policy on `organization_evidence_events` (manages the organization,
 * actor is the caller) — RLS refuses every row for anyone else.
 *
 * PAGED, NOT CAPPED: every record of the session is read page by page (the
 * old single read stopped at 1,000 and left the rest silently unattested),
 * and each record is attested in its own supplier role (see `attestRecord`).
 */
export async function attestSessionRecords(
  caller: EvidenceCaller,
  input: {
    readonly sessionId: string;
    readonly actorRole?: (typeof ATTESTATION_ROLES)[number] | null;
    readonly note?: string | null;
  },
): Promise<EvidenceImportResult<{ attested: number; skipped: number }>> {
  const store = storeOf(caller);
  const session = await loadSession(store, input.sessionId);
  if (!session.ok) return session.failure;
  if (input.actorRole && input.actorRole !== session.supplierRole) {
    return {
      kind: "invalid",
      problems: [`attestation role must be the session's supplier role (${session.supplierRole})`],
    };
  }
  const read = await readSessionRecords(store, input.sessionId);
  if (!read.ok) return read.failure;
  const records = read.value.map((r) => ({ id: r.id, supplierRole: r.supplier_role, ...standingOf(r) }));
  const pending = records.filter((r) => !r.withdrawn && r.attestation === null);
  const skipped = records.length - pending.length;
  if (pending.length === 0) return { kind: "ok", attested: 0, skipped };

  const rows = pending.map((r) => ({
    organization_id: session.organizationId,
    record_id: r.id,
    event_type: "attested",
    actor_role: r.supplierRole,
    actor_organization_id: session.organizationId,
    actor_profile_id: store.userId,
    note: input.note ?? null,
  }));
  const res = await store.insertRecordEvents(rows);
  if (res.error) {
    if (res.error.code === "42501") return { kind: "not-authorized", reason: "not-authorized" };
    return classify(res.error);
  }
  // The attestation events ARE the audit trail (actor, role, note, time on
  // every record); no session event is borrowed for it.
  return { kind: "ok", attested: res.data.length, skipped };
}

// ── read-back ───────────────────────────────────────────────────────────────

export interface EvidenceRecordView {
  readonly id: string;
  readonly personId: string;
  readonly personName: string | null;
  readonly activityKind: string;
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
  readonly text: string;
  readonly language: string;
  readonly contextLabel: string | null;
  readonly workObjectId: string | null;
  readonly supplierRole: string;
  readonly sourceKind: string;
  readonly sourceFilename: string | null;
  readonly importedAt: string;
  readonly importedBy: string | null;
  readonly factFields: readonly string[];
  readonly derived: Record<string, unknown>;
  /** The DERIVED standing — base state composed with the append-only events. */
  readonly state: string;
  readonly withdrawn: boolean;
  readonly attestation: {
    readonly role: string | null;
    readonly at: string | null;
    /** The attester IS the subject — a sole trader vouching for themselves.
     *  Legitimate, permanent, and never independent verification. */
    readonly self: boolean;
  } | null;
  /** ALWAYS false for an imported record. Independent verification lives in a
   *  separate event with its own policy and is never implied by an import. */
  readonly independentlyVerified: boolean;
  /**
   * THIS VIEWER has already contested this record.
   *
   * Distinct from `state === "DISPUTED"`, which says only that SOMEBODY with
   * standing contested it — an organisation manager can dispute too. A surface
   * that read the standing as "you contested this" would put words in the
   * reader's mouth, so the two facts stay apart.
   *
   * FALSE when the caller did not pass `viewerProfileId`: an unknown viewer is
   * not the same as a viewer who did nothing, and the honest default for the
   * organisation-side read is to claim no authorship at all.
   */
  readonly disputedByViewer: boolean;
}

/**
 * Read committed evidence back, with its provenance and its derived standing.
 *
 * RLS decides who sees what: the supplying organization's managers, the SUBJECT
 * once their roster record is linked to them, and a recorded party
 * organization's managers. A worker who merely appeared in the same file sees
 * nothing.
 */
export async function listEvidenceRecords(
  caller: DomainCaller,
  filter: {
    readonly sessionId?: string | null;
    readonly organizationPersonId?: string | null;
    /** Several subjects at once — the subject-side read passes the roster rows
     *  already linked to the caller. An EMPTY array means "no subjects", and
     *  is answered with no records rather than with everything. */
    readonly organizationPersonIds?: readonly string[] | null;
    /**
     * Who is reading. Used for ONE thing: deciding `disputedByViewer`. It is
     * not an authority input — RLS already decided which rows come back, and
     * passing it can never widen that.
     */
    readonly viewerProfileId?: string | null;
    readonly limit?: number;
  } = {},
): Promise<EvidenceImportResult<{ records: readonly EvidenceRecordView[] }>> {
  // THE EMBED NAMES ITS RELATIONSHIP. `organization_evidence_events` holds
  // TWO foreign keys to this table — `..._record_fk (record_id, organization_id)`
  // and `..._replacement_record_id_fkey` — so a bare `organization_evidence_events(...)`
  // is ambiguous and PostgREST answers 300 / PGRST201. That is exactly what
  // production did on the owner's first real import (2026-09-16 09:17:33Z):
  // preview staged and persisted, then THIS read failed and the page said
  // "evidence store unreadable". The events a record carries are the ones
  // that point AT it (`record_fk`); a record named as somebody's replacement is
  // a different relationship. Regression-pinned in organization-evidence-core.test.ts.
  let q = db(caller.supabase)
    .from("organization_evidence_records")
    .select(
      "id, organization_person_id, activity_kind, activity_date, period_start, period_end, hours, original_text, original_language, context_label, work_object_id, supplier_role, source_kind, source_filename, imported_at, imported_by_profile_id, evidence_state, source_fact, derived, organization_people(display_name, linked_profile_id), organization_evidence_events!organization_evidence_events_record_fk(event_type, actor_role, actor_profile_id, created_at)",
    )
    .order("activity_date", { ascending: false })
    .limit(Math.min(Math.max(filter.limit ?? 200, 1), 1000));
  if (filter.sessionId) q = q.eq("session_id", filter.sessionId);
  if (filter.organizationPersonId) {
    q = q.eq("organization_person_id", filter.organizationPersonId);
  }
  if (filter.organizationPersonIds) {
    if (filter.organizationPersonIds.length === 0)
      return { kind: "ok", records: [] };
    q = q.in("organization_person_id", filter.organizationPersonIds);
  }

  const res = await q;
  if (res.error) return classify(res.error);

  const records = ((res.data ?? []) as Record<string, unknown>[]).map((r) => {
    const events = (
      (r.organization_evidence_events as Record<string, unknown>[] | null) ?? []
    ).map(
      (e): RecordLifecycleEvent => ({
        eventType: e.event_type as RecordLifecycleEvent["eventType"],
        actorRole: (e.actor_role as string | null) ?? null,
        createdAt: (e.created_at as string | null) ?? null,
        actorProfileId: (e.actor_profile_id as string | null) ?? null,
      }),
    );
    const person = r.organization_people as {
      display_name?: string;
      linked_profile_id?: string | null;
    } | null;
    // The subject's linked profile is what lets the derivation tell a
    // self-attestation from an independent one. Unlinked → no subject profile
    // → an attestation cannot be self by construction.
    const standing = deriveEvidenceStanding(
      r.evidence_state as ReportedEvidenceState,
      events,
      person?.linked_profile_id ?? null,
    );
    return {
      id: r.id as string,
      personId: r.organization_person_id as string,
      personName: person?.display_name ?? null,
      activityKind: (r.activity_kind as string) ?? "work",
      activityDate: (r.activity_date as string | null) ?? null,
      periodStart: (r.period_start as string | null) ?? null,
      periodEnd: (r.period_end as string | null) ?? null,
      hours: r.hours === null || r.hours === undefined ? null : Number(r.hours),
      text: (r.original_text as string) ?? "",
      language: (r.original_language as string) ?? "",
      contextLabel: (r.context_label as string | null) ?? null,
      workObjectId: (r.work_object_id as string | null) ?? null,
      supplierRole: (r.supplier_role as string) ?? "other",
      sourceKind: (r.source_kind as string) ?? "",
      sourceFilename: (r.source_filename as string | null) ?? null,
      importedAt: (r.imported_at as string) ?? "",
      importedBy: (r.imported_by_profile_id as string | null) ?? null,
      // FACT vs DERIVED from the record's own source line and derivations
      // (was a hard-coded []). The source line itself is not handed out —
      // only which canonical fields it states.
      factFields: committedFactFields({
        sourceFact: (r.source_fact as Record<string, unknown> | null) ?? null,
        activityDate: (r.activity_date as string | null) ?? null,
        periodStart: (r.period_start as string | null) ?? null,
        periodEnd: (r.period_end as string | null) ?? null,
        hours: r.hours === null || r.hours === undefined ? null : Number(r.hours),
        text: (r.original_text as string) ?? "",
        contextLabel: (r.context_label as string | null) ?? null,
        derived: (r.derived as Record<string, unknown> | null) ?? {},
      }),
      derived: (r.derived as Record<string, unknown> | null) ?? {},
      state: standing.state,
      withdrawn: standing.withdrawn,
      attestation: standing.attestation
        ? {
            role: standing.attestation.role,
            at: standing.attestation.at,
            self: standing.attestation.self,
          }
        : null,
      independentlyVerified: standing.independentlyVerified,
      disputedByViewer:
        filter.viewerProfileId != null &&
        events.some(
          (e) =>
            e.eventType === "disputed" &&
            e.actorProfileId === filter.viewerProfileId,
        ),
    } satisfies EvidenceRecordView;
  });

  return { kind: "ok", records };
}

// ── the organization's own imports ──────────────────────────────────────────

/** One import session as the history door lists it: the source's name, when
 *  it was read, and the ONE derived status word. No row contents. */
export interface ImportSessionView {
  readonly id: string;
  readonly sourceKind: string;
  readonly sourceFilename: string | null;
  readonly sourceReference: string | null;
  readonly createdAt: string;
  readonly status: ImportSessionStatus;
}

/** Newest-first ceiling for the history door's list. */
export const IMPORT_SESSIONS_LIST_LIMIT = 20;

/**
 * "YOUR IMPORTS" — the sessions the acting organization has read, newest
 * first, bounded, with each one's derived status.
 *
 * Until 2026-09-20 a staged or committed import was reachable only by its
 * `?evidenceSession=` bookmark: close the tab and the session was gone from
 * the product's surface (still in the database, unreachable — class F). This
 * is the list that door was missing. RLS scopes the sessions to the
 * organizations the caller manages; the acting organization is resolved the
 * way every other read here resolves it. Two bounded reads: the sessions,
 * then their events (the status trail). Nothing from the staged rows and
 * nothing from the records is selected — a list of files is not a place to
 * leak the people in them.
 */
export async function listImportSessions(
  caller: DomainCaller,
  input: { readonly organizationId?: string | null; readonly limit?: number | null } = {},
): Promise<EvidenceImportResult<{ organizationId: string; sessions: readonly ImportSessionView[] }>> {
  const org = await resolveEvidenceOrganization(caller, input.organizationId);
  if (!org.ok) {
    return org.reason === "choice-required" || org.reason === "not-a-member"
      ? { kind: "choice-required", options: org.options ?? [] }
      : { kind: "not-authorized", reason: org.reason };
  }
  const limit = Math.min(Math.max(input.limit ?? IMPORT_SESSIONS_LIST_LIMIT, 1), 100);
  const res = await db(caller.supabase)
    .from("evidence_import_sessions")
    .select("id, source_kind, source_filename, source_reference, created_at")
    .eq("organization_id", org.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) return classify(res.error);
  const rows = (res.data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { kind: "ok", organizationId: org.organizationId, sessions: [] };

  const ids = rows.map((r) => r.id as string);
  // The trail is append-only and short per session; the ceiling is a bound,
  // not a coverage claim — the decisive events are the ones that matter and
  // the newest of them is what the status reads.
  const ev = await db(caller.supabase)
    .from("evidence_import_events")
    .select("session_id, event_type, created_at")
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(ids.length * 40);
  if (ev.error) return classify(ev.error);
  const eventsBySession = new Map<string, ImportSessionEvent[]>();
  for (const e of (ev.data ?? []) as Record<string, unknown>[]) {
    const sid = e.session_id as string;
    const list = eventsBySession.get(sid) ?? [];
    list.push({
      eventType: (e.event_type as string) ?? "",
      createdAt: (e.created_at as string | null) ?? null,
    });
    eventsBySession.set(sid, list);
  }

  return {
    kind: "ok",
    organizationId: org.organizationId,
    sessions: rows.map((r) => ({
      id: r.id as string,
      sourceKind: (r.source_kind as string) ?? "",
      sourceFilename: (r.source_filename as string | null) ?? null,
      sourceReference: (r.source_reference as string | null) ?? null,
      createdAt: (r.created_at as string) ?? "",
      status: deriveImportSessionStatus(eventsBySession.get(r.id as string) ?? []),
    })),
  };
}

// ── the subject's side ──────────────────────────────────────────────────────

/**
 * One roster record that names the caller, as the caller sees it.
 *
 * `linkState` is returned verbatim. `link_proposed` means an organization has
 * OFFERED the link and is waiting for this person to accept or refuse it; only
 * `linked` means both sides agree, and only then does the history count as
 * theirs.
 */
export interface SubjectRosterLink {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly displayName: string;
  readonly relationshipKind: string | null;
  readonly linkState: "link_proposed" | "linked" | string;
  readonly linkMethod: string | null;
}

export interface MyOrganizationEvidence {
  /** Committed evidence about the caller, from every organization that
   *  supplied any — the Living CV side of an import. */
  readonly records: readonly EvidenceRecordView[];
  /** Every roster record naming the caller, accepted or merely offered. */
  readonly links: readonly SubjectRosterLink[];
  /** The offers still awaiting this person's answer. */
  readonly pendingOffers: readonly SubjectRosterLink[];
}

/**
 * WHAT ORGANIZATIONS HAVE RECORDED ABOUT ME.
 *
 * The mirror of `listEvidenceRecords` from the subject's side, and the reason
 * an import is worth anything to the person it is about. RLS is what makes it
 * safe: `organization_people` shows a person only rows already naming THEM,
 * and `organization_evidence_records` shows a subject only records whose
 * roster row is `linked` to them. This function adds no authority of its own —
 * it asks the two questions in the right order and joins the answers.
 *
 * A person who merely appeared in the same file sees nothing.
 */
export async function listMyOrganizationEvidence(
  caller: DomainCaller,
  opts: { readonly limit?: number } = {},
): Promise<EvidenceImportResult<MyOrganizationEvidence>> {
  const peopleRes = await db(caller.supabase)
    .from("organization_people")
    .select(
      "id, organization_id, display_name, relationship_kind, link_state, link_method, organizations(display_name, legal_name)",
    )
    .eq("linked_profile_id", caller.userId)
    .limit(200);
  if (peopleRes.error) return classify(peopleRes.error);

  const links: SubjectRosterLink[] = (
    (peopleRes.data ?? []) as Record<string, unknown>[]
  ).map((r) => {
    const org = r.organizations as {
      display_name?: string | null;
      legal_name?: string | null;
    } | null;
    return {
      id: r.id as string,
      organizationId: r.organization_id as string,
      // The ONE org-name rule (`orgDisplayName`) — never an invented name.
      organizationName: orgDisplayName(org?.display_name, org?.legal_name),
      displayName: (r.display_name as string) ?? "",
      relationshipKind: (r.relationship_kind as string | null) ?? null,
      linkState: (r.link_state as string) ?? "unlinked",
      linkMethod: (r.link_method as string | null) ?? null,
    };
  });

  // Only a CONFIRMED link makes the history this person's. An offer they have
  // not answered must not quietly start showing their name on someone's work.
  const confirmed = links
    .filter((l) => l.linkState === "linked")
    .map((l) => l.id);
  const recordsRes = await listEvidenceRecords(caller, {
    organizationPersonIds: confirmed,
    // On the SUBJECT's own page the reader is the subject, so their own
    // dispute can be named as theirs. The organisation-side read deliberately
    // does not pass this.
    viewerProfileId: caller.userId,
    limit: opts.limit,
  });
  if (recordsRes.kind !== "ok") return recordsRes;

  return {
    kind: "ok",
    records: recordsRes.records,
    links,
    pendingOffers: links.filter((l) => l.linkState === "link_proposed"),
  };
}

/**
 * The organization OFFERS the link; the person decides.
 *
 * The offer can only name a profile that already holds an active engagement or
 * membership with this organization — that is the database's rule, not this
 * function's, and it is why identity is never invented by a matching name.
 */
export async function offerRosterLink(
  caller: DomainCaller,
  input: {
    readonly personId: string;
    readonly profileId: string;
    readonly workerId: string;
  },
): Promise<EvidenceImportResult<{ readonly offered: true }>> {
  const res = await db(caller.supabase)
    .from("organization_people")
    .update({
      link_state: "link_proposed",
      link_method: "manager_offer",
      linked_profile_id: input.profileId,
      linked_worker_id: input.workerId,
      linked_by: caller.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.personId)
    .eq("link_state", "unlinked")
    .select("id");
  if (res.error) return classify(res.error);
  if (!Array.isArray(res.data) || res.data.length === 0)
    return { kind: "not-found" };
  return { kind: "ok", offered: true };
}

/**
 * The person answers the offer.
 *
 * `accept` makes the link real and their imported history theirs. `refuse`
 * returns the row to `unlinked`: the organization keeps its own record, and
 * what it loses is the false claim about whose it is. There is no third
 * option and no silent default — an unanswered offer stays an offer.
 */
export async function respondToRosterLink(
  caller: DomainCaller,
  input: {
    readonly personId: string;
    /**
     * `accept` / `refuse` answer an OFFER. `withdraw` (2026-09-19) is the
     * subject's later "this is no longer me" on a link they had confirmed —
     * the same row transition as a refusal, restricted to rows already
     * `linked`. The policy `organization_people_subject_decides` has admitted
     * it since the store shipped; the product simply had no control for it.
     */
    readonly decision: "accept" | "refuse" | "withdraw";
  },
): Promise<
  EvidenceImportResult<{ readonly linkState: "linked" | "unlinked" }>
> {
  const patch =
    input.decision === "accept"
      ? {
          link_state: "linked",
          link_method: "worker_confirmed",
          linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          link_state: "unlinked",
          link_method: null,
          linked_profile_id: null,
          linked_worker_id: null,
          linked_at: null,
          updated_at: new Date().toISOString(),
        };
  let query = db(caller.supabase)
    .from("organization_people")
    .update(patch)
    .eq("id", input.personId)
    .eq("linked_profile_id", caller.userId);
  // An answer to an offer acts on an offer; a withdrawal acts on a confirmed
  // link. Neither may silently do the other's job.
  query =
    input.decision === "withdraw"
      ? query.eq("link_state", "linked")
      : query.eq("link_state", "link_proposed");
  const res = await query.select("id");
  if (res.error) return classify(res.error);
  if (!Array.isArray(res.data) || res.data.length === 0)
    return { kind: "not-found" };
  return {
    kind: "ok",
    linkState: input.decision === "accept" ? "linked" : "unlinked",
  };
}
