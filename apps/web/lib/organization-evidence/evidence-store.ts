import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DomainCaller } from "@/lib/domain/caller";
import {
  resolveEvidenceOrganization,
  type EvidenceOrgContext,
} from "./evidence-org-context";
import { MAX_ROWS_PER_SESSION } from "./source-rows";

/**
 * THE EVIDENCE STORE — the one port the import orchestration reads and writes
 * through (historical timesheet import design v3, PR-2).
 *
 * `import-core.ts` used to talk to PostgREST inline, so the only way to run
 * the SHIPPED orchestration — stage, preview, plan, commit, attest, withdraw —
 * was against a live database. This port names every data-plane operation the
 * orchestration performs, and nothing more:
 *
 *   · `supabaseEvidenceStore(caller)` — production. Each method is the query
 *     `import-core.ts` ran before, moved verbatim, under the caller's OWN
 *     RLS-scoped client. No authority lives here: RLS and the policies decide,
 *     exactly as before. No service role, ever.
 *   · `testing/memory-store.ts` — the in-memory adapter the synthetic fixture
 *     runs on, without a database and without Docker. Test-only; a guard keeps
 *     it out of production imports.
 *
 * ── THE SHAPES ARE THE TABLES' ─────────────────────────────────────────────
 * Rows travel as the tables' own snake_case columns and results as
 * `{ data, error }` with the driver's error code, so the orchestration keeps
 * its one `classify()` (an absent store is `needs-migration`, a broken one is
 * `error`, 42501 is a refusal) and no second result vocabulary is born.
 *
 * ── WHAT A STORE MUST GUARANTEE ────────────────────────────────────────────
 *   · `(organization_id, source_fingerprint)` unique on sessions;
 *   · `(session_id, row_index)` unique on staging, and `insertStagedRows`
 *     IGNORES a conflict (the resumable-staging contract);
 *   · `(organization_id, record_fingerprint)` unique on records, and
 *     `insertRecords` IGNORES a conflict (the idempotent commit);
 *   · records and record events are INSERT-only;
 *   · a staging row whose status is `committed` is never written again —
 *     `updateStagedRow` and `commitStagedRow` both refuse it (design §8 P3u).
 */

export interface StoreError {
  readonly code?: string | null;
  readonly message?: string | null;
}

export type StoreResult<T> =
  | { readonly data: T; readonly error: null }
  | { readonly data: null; readonly error: StoreError };

/** A table row as the table stores it. */
export type StoreRow = Record<string, unknown>;

/** The staging columns a read may ask for. */
export type StagedColumn =
  | "id"
  | "row_index"
  | "person_label"
  | "context_label"
  | "activity_date"
  | "period_start"
  | "period_end"
  | "hours"
  | "activity_text"
  | "source_fact"
  | "fact_fields"
  | "derived"
  | "organization_person_id"
  | "work_object_id"
  | "person_state"
  | "context_state"
  | "record_fingerprint"
  | "status"
  | "problem"
  | "person_match_confidence";

export interface StagedRowFilter {
  /** Only rows in exactly this status. */
  readonly status?: string;
  /** Rows in none of these statuses. */
  readonly excludeStatuses?: readonly string[];
  /** Only these rows (a human's decision names the rows it settles). */
  readonly ids?: readonly string[];
  /** Only rows whose open question is exactly this `problem`. */
  readonly problem?: string;
}

/** One committed record with its append-only lifecycle rows, for the
 *  per-session sweeps (attest, withdraw, reinstate). */
export interface SessionRecordWithEvents {
  readonly id: string;
  readonly organization_id: string;
  readonly supplier_role: string;
  readonly evidence_state: string;
  /** The subject's linked profile, so a self-attestation stays visible. */
  readonly subject_profile_id: string | null;
  readonly events: readonly {
    readonly event_type: string;
    readonly actor_role: string | null;
    readonly actor_profile_id: string | null;
    readonly created_at: string | null;
  }[];
}

export interface WorkObjectCreate {
  readonly p_organization_id: string;
  readonly p_name: string;
  readonly p_project_id: string | null;
  readonly p_country: string | null;
  readonly p_region: string | null;
  readonly p_city: string | null;
  readonly p_address_line: string | null;
  readonly p_latitude: number | null;
  readonly p_longitude: number | null;
}

/** How many records one page of a per-session sweep reads. Below PostgREST's
 *  default row ceiling, so a page is never silently truncated. */
export const SESSION_RECORD_PAGE = 500;

export interface EvidenceStore {
  /** Brand: lets the orchestration tell a store from a transport's caller. */
  readonly kind: "evidence-store";
  /** The authenticated human the store acts as — every write names them. */
  readonly userId: string;

  // ── organization ──────────────────────────────────────────────────────────
  resolveOrganization(requested?: string | null): Promise<EvidenceOrgContext>;

  // ── sessions ──────────────────────────────────────────────────────────────
  findSessionByFingerprint(organizationId: string, fingerprint: string): Promise<StoreResult<StoreRow | null>>;
  insertSession(row: StoreRow): Promise<StoreResult<{ readonly id: string; readonly created_at: string }>>;
  readSession(sessionId: string): Promise<StoreResult<StoreRow | null>>;
  insertImportEvent(row: StoreRow): Promise<StoreResult<null>>;
  /** The session's audit trail, newest first, bounded. */
  listImportEvents(sessionId: string): Promise<StoreResult<readonly StoreRow[]>>;

  // ── staging ───────────────────────────────────────────────────────────────
  /** ON CONFLICT (session_id, row_index) DO NOTHING; returns the rows written. */
  insertStagedRows(rows: readonly StoreRow[]): Promise<StoreResult<readonly { readonly id: string }[]>>;
  countStagedRows(sessionId: string, filter?: StagedRowFilter): Promise<StoreResult<number>>;
  listStagedRows(
    sessionId: string,
    columns: readonly StagedColumn[],
    filter?: StagedRowFilter,
  ): Promise<StoreResult<readonly StoreRow[]>>;
  /** Patch one NOT-committed row; returns how many rows changed (0 or 1). */
  updateStagedRow(id: string, patch: StoreRow): Promise<StoreResult<number>>;
  /** THE committing write: the row's final state and `status: committed` in
   *  ONE update, only while the row is still `ready` (design §8 P3u, §12). */
  commitStagedRow(id: string, finalState: StoreRow): Promise<StoreResult<number>>;

  // ── roster and objects ───────────────────────────────────────────────────
  readRoster(organizationId: string): Promise<StoreResult<readonly StoreRow[]>>;
  insertRosterPerson(row: StoreRow): Promise<StoreResult<{ readonly id: string }>>;
  readWorkObjects(organizationId: string): Promise<StoreResult<readonly StoreRow[]>>;
  /** THE existing object writer (`create_work_object_v1`): a status, not an id. */
  createWorkObject(args: WorkObjectCreate): Promise<StoreResult<string>>;

  // ── records ───────────────────────────────────────────────────────────────
  readRecordKeys(organizationId: string): Promise<StoreResult<readonly StoreRow[]>>;
  /** ON CONFLICT (organization_id, record_fingerprint) DO NOTHING. */
  insertRecords(rows: readonly StoreRow[]): Promise<StoreResult<readonly { readonly id: string; readonly import_row_id: string }[]>>;
  insertCompetencySignals(rows: readonly StoreRow[]): Promise<StoreResult<null>>;
  readRecord(recordId: string): Promise<StoreResult<StoreRow | null>>;
  /** One page of a session's records with their lifecycle rows, stable order. */
  listSessionRecords(
    sessionId: string,
    page: { readonly offset: number; readonly limit: number },
  ): Promise<StoreResult<readonly SessionRecordWithEvents[]>>;
  /** Append-only lifecycle rows; returns the ids written. */
  insertRecordEvents(rows: readonly StoreRow[]): Promise<StoreResult<readonly { readonly id: string }[]>>;
}

/** A transport's caller, or a store that already IS the data plane. */
export type EvidenceCaller = DomainCaller | EvidenceStore;

export function isEvidenceStore(c: EvidenceCaller): c is EvidenceStore {
  return (c as EvidenceStore).kind === "evidence-store";
}

// The evidence-import tables postdate the generated Database types until the
// migration is applied — the same `asAny` pattern every gated store uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untypedClient(c: SupabaseClient): any {
  return c;
}

function fail<T>(error: { code?: string | null; message?: string | null }): StoreResult<T> {
  return { data: null, error: { code: error.code ?? null, message: error.message ?? null } };
}

/**
 * PRODUCTION: the caller's own RLS-scoped client. Each method is the query the
 * orchestration ran inline before this port existed.
 */
export function supabaseEvidenceStore(caller: DomainCaller): EvidenceStore {
  const db = () => untypedClient(caller.supabase);
  const stagedQuery = (
    sessionId: string,
    columns: string,
    filter?: StagedRowFilter,
    options?: { count: "exact"; head: true },
  ) => {
    let q = db().from("evidence_import_rows").select(columns, options).eq("session_id", sessionId);
    if (filter?.status) q = q.eq("status", filter.status);
    for (const s of filter?.excludeStatuses ?? []) q = q.neq("status", s);
    if (filter?.ids) q = q.in("id", filter.ids);
    if (filter?.problem) q = q.eq("problem", filter.problem);
    return q;
  };

  return {
    kind: "evidence-store",
    userId: caller.userId,

    resolveOrganization: (requested) => resolveEvidenceOrganization(caller, requested),

    async findSessionByFingerprint(organizationId, fingerprint) {
      const res = await db()
        .from("evidence_import_sessions")
        .select("id, source_kind, source_filename, source_language, supplier_role, created_at")
        .eq("organization_id", organizationId)
        .eq("source_fingerprint", fingerprint)
        .maybeSingle();
      if (res.error && res.error.code !== "PGRST116") return fail(res.error);
      return { data: (res.data as StoreRow | null) ?? null, error: null };
    },

    async insertSession(row) {
      const res = await db().from("evidence_import_sessions").insert(row).select("id, created_at").single();
      if (res.error) return fail(res.error);
      return { data: { id: res.data.id as string, created_at: res.data.created_at as string }, error: null };
    },

    async readSession(sessionId) {
      const res = await db()
        .from("evidence_import_sessions")
        .select("organization_id, source_kind, source_language, source_filename, source_reference, supplier_role")
        .eq("id", sessionId)
        .maybeSingle();
      if (res.error) return fail(res.error);
      return { data: (res.data as StoreRow | null) ?? null, error: null };
    },

    async insertImportEvent(row) {
      const res = await db().from("evidence_import_events").insert(row);
      if (res.error) return fail(res.error);
      return { data: null, error: null };
    },

    async listImportEvents(sessionId) {
      const res = await db()
        .from("evidence_import_events")
        .select("event_type, payload, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (res.error) return fail(res.error);
      return { data: (res.data ?? []) as StoreRow[], error: null };
    },

    async insertStagedRows(rows) {
      // ON CONFLICT DO NOTHING on (session_id, row_index): a retried batch is
      // a no-op rather than a duplicate.
      const res = await db()
        .from("evidence_import_rows")
        .upsert(rows, { onConflict: "session_id,row_index", ignoreDuplicates: true })
        .select("id");
      if (res.error) return fail(res.error);
      return { data: (Array.isArray(res.data) ? res.data : []) as { id: string }[], error: null };
    },

    async countStagedRows(sessionId, filter) {
      const res = await stagedQuery(sessionId, "id", filter, { count: "exact", head: true });
      if (res.error) return fail(res.error);
      return { data: res.count ?? 0, error: null };
    },

    async listStagedRows(sessionId, columns, filter) {
      const res = await stagedQuery(sessionId, columns.join(", "), filter)
        .order("row_index", { ascending: true })
        .limit(MAX_ROWS_PER_SESSION);
      if (res.error) return fail(res.error);
      return { data: (res.data ?? []) as StoreRow[], error: null };
    },

    async updateStagedRow(id, patch) {
      const res = await db()
        .from("evidence_import_rows")
        .update(patch)
        .eq("id", id)
        .neq("status", "committed")
        .select("id");
      if (res.error) return fail(res.error);
      return { data: Array.isArray(res.data) ? res.data.length : 0, error: null };
    },

    async commitStagedRow(id, finalState) {
      const res = await db()
        .from("evidence_import_rows")
        .update({ ...finalState, status: "committed" })
        .eq("id", id)
        .eq("status", "ready")
        .select("id");
      if (res.error) return fail(res.error);
      return { data: Array.isArray(res.data) ? res.data.length : 0, error: null };
    },

    async readRoster(organizationId) {
      const res = await db()
        .from("organization_people")
        .select("id, display_name, normalized_name, external_ref")
        .eq("organization_id", organizationId)
        .limit(5000);
      if (res.error) return fail(res.error);
      return { data: (res.data ?? []) as StoreRow[], error: null };
    },

    async insertRosterPerson(row) {
      const res = await db().from("organization_people").insert(row).select("id").single();
      if (res.error) return fail(res.error);
      return { data: { id: res.data.id as string }, error: null };
    },

    async readWorkObjects(organizationId) {
      const res = await db()
        .from("work_objects")
        .select("id, name, status")
        .eq("organization_id", organizationId)
        .limit(2000);
      if (res.error) return fail(res.error);
      return { data: (res.data ?? []) as StoreRow[], error: null };
    },

    async createWorkObject(args) {
      // THE existing insert path for objects (membership-based authority
      // inside the RPC). It answers a status, not an id.
      const rpc = await db().rpc("create_work_object_v1", args);
      if (rpc.error) return fail(rpc.error);
      return { data: String(rpc.data ?? ""), error: null };
    },

    async readRecordKeys(organizationId) {
      const res = await db()
        .from("organization_evidence_records")
        .select("id, record_fingerprint, organization_person_id, activity_date, work_object_id, hours, original_text, import_row_id")
        .eq("organization_id", organizationId)
        .limit(MAX_ROWS_PER_SESSION);
      if (res.error) return fail(res.error);
      return { data: (res.data ?? []) as StoreRow[], error: null };
    },

    async insertRecords(rows) {
      const res = await db()
        .from("organization_evidence_records")
        .upsert(rows, { onConflict: "organization_id,record_fingerprint", ignoreDuplicates: true })
        .select("id, import_row_id");
      if (res.error) return fail(res.error);
      return { data: (Array.isArray(res.data) ? res.data : []) as { id: string; import_row_id: string }[], error: null };
    },

    async insertCompetencySignals(rows) {
      const res = await db()
        .from("organization_evidence_competency_signals")
        .upsert(rows, { onConflict: "record_id,term", ignoreDuplicates: true });
      if (res.error) return fail(res.error);
      return { data: null, error: null };
    },

    async readRecord(recordId) {
      const res = await db()
        .from("organization_evidence_records")
        .select("organization_id, supplier_role")
        .eq("id", recordId)
        .maybeSingle();
      if (res.error) return fail(res.error);
      return { data: (res.data as StoreRow | null) ?? null, error: null };
    },

    async listSessionRecords(sessionId, page) {
      // The embed NAMES its relationship: two foreign keys point at the
      // records table (see `listEvidenceRecords`).
      const res = await db()
        .from("organization_evidence_records")
        .select(
          "id, organization_id, supplier_role, evidence_state, organization_people(linked_profile_id), organization_evidence_events!organization_evidence_events_record_fk(event_type, actor_role, actor_profile_id, created_at)",
        )
        .eq("session_id", sessionId)
        .order("id", { ascending: true })
        .range(page.offset, page.offset + page.limit - 1);
      if (res.error) return fail(res.error);
      const rows = ((res.data ?? []) as StoreRow[]).map((r) => ({
        id: r.id as string,
        organization_id: r.organization_id as string,
        supplier_role: (r.supplier_role as string) ?? "other",
        evidence_state: (r.evidence_state as string) ?? "ORGANIZATION_REPORTED",
        subject_profile_id:
          ((r.organization_people as { linked_profile_id?: string | null } | null)?.linked_profile_id ?? null),
        events: ((r.organization_evidence_events as StoreRow[] | null) ?? []).map((e) => ({
          event_type: e.event_type as string,
          actor_role: (e.actor_role as string | null) ?? null,
          actor_profile_id: (e.actor_profile_id as string | null) ?? null,
          created_at: (e.created_at as string | null) ?? null,
        })),
      }));
      return { data: rows, error: null };
    },

    async insertRecordEvents(rows) {
      const res = await db().from("organization_evidence_events").insert(rows).select("id");
      if (res.error) return fail(res.error);
      return { data: (Array.isArray(res.data) ? res.data : []) as { id: string }[], error: null };
    },
  };
}
