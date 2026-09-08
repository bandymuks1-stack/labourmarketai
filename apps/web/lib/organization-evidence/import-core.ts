import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DomainCaller } from "@/lib/domain/caller";
import {
  normalizeLabel,
  type ResolveEntity,
} from "@/lib/timesheet-import/resolve-entities";
import { orgDisplayName } from "@/lib/company/org-display";
import {
  anyStandingDispute,
  deriveEvidenceStanding,
  type ReportedEvidenceState,
  type RecordLifecycleEvent,
} from "./evidence-state";
import { chainHash, recordFingerprint } from "./fingerprint";
import {
  matchPerson,
  matchPlace,
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
import {
  resolveEvidenceOrganization,
  type EvidenceOrgReason,
} from "./evidence-org-context";
import {
  competencySignalRows,
  deriveCompetencySignals,
} from "./competency-signals";

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

// The evidence-import tables postdate the generated Database types until the
// migration is applied — the same `asAny` pattern every gated store uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
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
  caller: DomainCaller,
  input: CreateSessionInput,
): Promise<EvidenceImportResult<{ session: SessionSummary }>> {
  const org = await resolveEvidenceOrganization(caller, input.organizationId);
  if (!org.ok) {
    return org.reason === "choice-required" || org.reason === "not-a-member"
      ? { kind: "choice-required", options: org.options ?? [] }
      : { kind: "not-authorized", reason: org.reason };
  }

  const existing = await db(caller.supabase)
    .from("evidence_import_sessions")
    .select(
      "id, source_kind, source_filename, source_language, supplier_role, created_at",
    )
    .eq("organization_id", org.organizationId)
    .eq("source_fingerprint", input.sourceFingerprint)
    .maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") {
    return classify(existing.error);
  }
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

  const inserted = await db(caller.supabase)
    .from("evidence_import_sessions")
    .insert({
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
      created_by: caller.userId,
      notes: input.notes ?? null,
    })
    .select("id, created_at")
    .single();
  if (inserted.error) return classify(inserted.error);

  await recordImportEvent(caller, {
    organizationId: org.organizationId,
    sessionId: inserted.data.id as string,
    eventType: "created",
    actorKind: input.actorKind ?? "human",
    payload: { sourceKind: input.sourceKind, supplierRole: input.supplierRole },
  });

  return {
    kind: "ok",
    session: {
      id: inserted.data.id as string,
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      sourceKind: input.sourceKind,
      sourceFilename: input.sourceFilename ?? null,
      sourceLanguage: input.sourceLanguage,
      supplierRole: input.supplierRole,
      createdAt: inserted.data.created_at as string,
      reused: false,
    },
  };
}

/** Append one audit row. Best-effort BY DESIGN: the audit trail must never be
 *  the reason a legitimate import fails, and a missing event is visible as a
 *  gap in an append-only log rather than as corrupted evidence. */
async function recordImportEvent(
  caller: DomainCaller,
  e: {
    organizationId: string;
    sessionId: string;
    eventType:
      | "created"
      | "rows_submitted"
      | "previewed"
      | "committed"
      | "rolled_back"
      | "reinstated"
      | "failed";
    actorKind?: "human" | "agent";
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db(caller.supabase)
      .from("evidence_import_events")
      .insert({
        organization_id: e.organizationId,
        session_id: e.sessionId,
        event_type: e.eventType,
        actor_profile_id: caller.userId,
        actor_kind: e.actorKind ?? "human",
        payload: e.payload ?? {},
      });
  } catch {
    // Deliberately swallowed — see the doc comment.
  }
}

/** Read a session the caller may see, and the organization it belongs to. */
async function loadSession(
  caller: DomainCaller,
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
  const res = await db(caller.supabase)
    .from("evidence_import_sessions")
    .select(
      "organization_id, source_kind, source_language, source_filename, source_reference, supplier_role",
    )
    .eq("id", sessionId)
    .maybeSingle();
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
  readonly skipped: number;
  readonly totalInSession: number;
}

/**
 * Stage a bounded batch of canonical rows.
 *
 * BOUNDED AND RESUMABLE. A batch is capped at `MAX_ROWS_PER_SUBMIT` and a
 * session at `MAX_ROWS_PER_SESSION`; `row_index` is assigned by continuing from
 * what the session already holds, and `(session_id, row_index)` is unique — so
 * a retried batch after a timeout cannot duplicate rows, and thousands of rows
 * arrive as many small calls rather than one unbounded request.
 */
export async function submitRows(
  caller: DomainCaller,
  sessionId: string,
  rows: readonly unknown[],
): Promise<EvidenceImportResult<SubmitRowsResult>> {
  if (rows.length === 0) return { kind: "invalid", problems: ["no rows"] };
  if (rows.length > MAX_ROWS_PER_SUBMIT) {
    return { kind: "too-many-rows", limit: MAX_ROWS_PER_SUBMIT };
  }

  const session = await loadSession(caller, sessionId);
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

  const countRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select("row_index", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countRes.error) return classify(countRes.error);
  const already = countRes.count ?? 0;
  if (already + parsed.length > MAX_ROWS_PER_SESSION) {
    return { kind: "too-many-rows", limit: MAX_ROWS_PER_SESSION };
  }

  const payload = parsed.map((row, i) => ({
    session_id: sessionId,
    organization_id: session.organizationId,
    row_index: already + i,
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
  const ins = await db(caller.supabase)
    .from("evidence_import_rows")
    .upsert(payload, {
      onConflict: "session_id,row_index",
      ignoreDuplicates: true,
    })
    .select("id");
  if (ins.error) return classify(ins.error);

  const inserted = Array.isArray(ins.data) ? ins.data.length : 0;
  await recordImportEvent(caller, {
    organizationId: session.organizationId,
    sessionId,
    eventType: "rows_submitted",
    payload: { submitted: parsed.length, inserted },
  });

  return {
    kind: "ok",
    inserted,
    skipped: parsed.length - inserted,
    totalInSession: already + inserted,
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
  readonly rowIndex: number;
  readonly personLabel: string | null;
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
  readonly problem: string | null;
}

export interface ImportPreview {
  readonly sessionId: string;
  readonly organizationId: string;
  /** LITERAL false — a persisted preview is unrepresentable. */
  readonly persisted: false;
  readonly rows: readonly PreviewRow[];
  readonly counts: {
    readonly total: number;
    readonly ready: number;
    readonly needsPerson: number;
    readonly needsContext: number;
    readonly duplicates: number;
    readonly conflicts: number;
  };
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
 */
export async function buildPreview(
  caller: DomainCaller,
  sessionId: string,
): Promise<EvidenceImportResult<{ preview: ImportPreview }>> {
  const session = await loadSession(caller, sessionId);
  if (!session.ok) return session.failure;

  const rowsRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select(
      "id, row_index, person_label, context_label, activity_date, period_start, period_end, hours, activity_text, fact_fields, derived, organization_person_id, work_object_id, person_state, context_state, record_fingerprint, status, problem",
    )
    .eq("session_id", sessionId)
    .order("row_index", { ascending: true })
    .limit(MAX_ROWS_PER_SESSION);
  if (rowsRes.error) return classify(rowsRes.error);
  const staged = (rowsRes.data ?? []) as Record<string, unknown>[];

  const [roster, objects, existing] = await Promise.all([
    readRoster(caller, session.organizationId),
    readWorkObjects(caller, session.organizationId),
    readExistingFingerprints(caller, session.organizationId),
  ]);
  if (!roster.ok) return roster.failure;
  if (!objects.ok) return objects.failure;
  if (!existing.ok) return existing.failure;

  const personCache = new Map<string, ReturnType<typeof matchPerson>>();
  const placeCache = new Map<string, ReturnType<typeof matchPlace>>();

  const preview: PreviewRow[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const s of staged) {
    const personLabel = (s.person_label as string | null) ?? null;
    const contextLabel = (s.context_label as string | null) ?? null;

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
      const key = personLabel.toLowerCase();
      let m = personCache.get(key);
      if (!m) {
        m = matchPerson({ name: personLabel }, roster.value);
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

    let contextState: ContextState = "absent";
    let workObjectId: string | null = chosenObjectId;
    let workObjectName: string | null = null;
    let contextCandidates: { id: string; name: string }[] = [];

    if (chosenObjectId) {
      contextState = "matched";
      workObjectName =
        objects.value.find((o) => o.id === chosenObjectId)?.name ?? null;
    } else if (contextLabel) {
      const key = contextLabel.toLowerCase();
      let m = placeCache.get(key);
      if (!m) {
        m = matchPlace(contextLabel, objects.value);
        placeCache.set(key, m);
      }
      if (m.kind === "matched") {
        contextState = "matched";
        workObjectId = m.workObjectId;
        workObjectName = m.name;
      } else if (m.kind === "ambiguous") {
        contextState = "ambiguous";
        contextCandidates = m.candidates.map((c) => ({
          id: c.id,
          name: c.name,
        }));
      } else if (m.kind === "unmatched") {
        contextState = "unmatched";
      }
    }

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

    const ready =
      personState === "matched" || personState === "created"
        ? contextState !== "ambiguous" && dup.state !== "duplicate"
        : false;

    const problem =
      personState === "unmatched"
        ? "person_not_on_roster"
        : personState === "ambiguous"
          ? "person_ambiguous"
          : contextState === "ambiguous"
            ? "context_ambiguous"
            : dup.state === "duplicate"
              ? "already_imported"
              : null;

    preview.push({
      id: s.id as string,
      rowIndex: s.row_index as number,
      personLabel,
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
      problem,
    });

    updates.push({
      id: s.id as string,
      patch: {
        person_state: personState,
        organization_person_id: personId,
        person_match_confidence: personConfidence,
        context_state: contextState,
        work_object_id: workObjectId,
        duplicate_state: dup.state,
        duplicate_of_record_id: dup.recordId,
        record_fingerprint: fingerprint,
        status: ready
          ? "ready"
          : dup.state === "duplicate"
            ? "skipped"
            : "needs_review",
        problem,
        updated_at: new Date().toISOString(),
      },
    });
  }

  // Persist the interpretation back onto STAGING only. Failure here degrades
  // the preview to non-sticky; it never blocks the human from seeing it.
  for (const u of updates) {
    await db(caller.supabase)
      .from("evidence_import_rows")
      .update(u.patch)
      .eq("id", u.id);
  }

  await recordImportEvent(caller, {
    organizationId: session.organizationId,
    sessionId,
    eventType: "previewed",
    payload: { rows: preview.length },
  });

  return {
    kind: "ok",
    preview: {
      sessionId,
      organizationId: session.organizationId,
      persisted: false,
      rows: preview,
      counts: {
        total: preview.length,
        ready: preview.filter((r) => r.ready).length,
        needsPerson: preview.filter(
          (r) => r.personState === "unmatched" || r.personState === "ambiguous",
        ).length,
        needsContext: preview.filter((r) => r.contextState === "ambiguous")
          .length,
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

interface ExistingRecordKey {
  readonly id: string;
  readonly fingerprint: string;
  readonly personId: string | null;
  readonly date: string | null;
  readonly workObjectId: string | null;
  readonly hours: number | null;
  readonly textKey: string;
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
): { state: DuplicateState; recordId: string | null } {
  const exact = existing.find((e) => e.fingerprint === row.fingerprint);
  if (exact) return { state: "duplicate", recordId: exact.id };
  if (!row.personId || !row.date) return { state: "new", recordId: null };

  const sameSlot = existing.filter(
    (e) =>
      e.personId === row.personId &&
      e.date === row.date &&
      e.workObjectId === row.workObjectId,
  );
  if (sameSlot.length === 0) return { state: "new", recordId: null };

  const textKey = normalizeLabel(row.text);
  const sameText = sameSlot.find((e) => e.textKey === textKey);
  if (sameText) {
    // Same person, day, place and words — but the hours disagree. That is a
    // real contradiction between two sources and must be shown, never merged.
    return { state: "conflict", recordId: sameText.id };
  }
  return { state: "probable_duplicate", recordId: sameSlot[0].id };
}

// ── reads the preview needs ─────────────────────────────────────────────────

type CoreOk<T> =
  | { ok: true; value: T }
  | { ok: false; failure: EvidenceImportFailure };

async function readRoster(
  caller: DomainCaller,
  organizationId: string,
): Promise<CoreOk<RosterPerson[]>> {
  const res = await db(caller.supabase)
    .from("organization_people")
    .select("id, display_name, normalized_name, external_ref")
    .eq("organization_id", organizationId)
    .limit(5000);
  if (res.error) return { ok: false, failure: classify(res.error) };
  return {
    ok: true,
    value: ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      displayName: r.display_name as string,
      normalizedName: r.normalized_name as string,
      externalRef: (r.external_ref as string | null) ?? null,
    })),
  };
}

async function readWorkObjects(
  caller: DomainCaller,
  organizationId: string,
): Promise<CoreOk<ResolveEntity[]>> {
  const res = await db(caller.supabase)
    .from("work_objects")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .limit(2000);
  // work_objects predates this feature and IS applied; a missing-object code
  // here would be a real environment problem, so it is not special-cased.
  if (res.error) return { ok: false, failure: classify(res.error) };
  return {
    ok: true,
    value: ((res.data ?? []) as Record<string, unknown>[])
      .filter((r) => r.status === "active" || r.status === undefined)
      .map((r) => ({ id: r.id as string, name: r.name as string })),
  };
}

async function readExistingFingerprints(
  caller: DomainCaller,
  organizationId: string,
): Promise<CoreOk<ExistingRecordKey[]>> {
  const res = await db(caller.supabase)
    .from("organization_evidence_records")
    .select(
      "id, record_fingerprint, organization_person_id, activity_date, work_object_id, hours, original_text",
    )
    .eq("organization_id", organizationId)
    .limit(MAX_ROWS_PER_SESSION);
  if (res.error) return { ok: false, failure: classify(res.error) };
  return {
    ok: true,
    value: ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      fingerprint: r.record_fingerprint as string,
      personId: (r.organization_person_id as string | null) ?? null,
      date: (r.activity_date as string | null) ?? null,
      workObjectId: (r.work_object_id as string | null) ?? null,
      hours: r.hours === null || r.hours === undefined ? null : Number(r.hours),
      textKey: normalizeLabel((r.original_text as string | null) ?? ""),
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
  caller: DomainCaller,
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
  const org = await resolveEvidenceOrganization(caller, input.organizationId);
  if (!org.ok) {
    return org.reason === "choice-required" || org.reason === "not-a-member"
      ? { kind: "choice-required", options: org.options ?? [] }
      : { kind: "not-authorized", reason: org.reason };
  }

  const res = await db(caller.supabase)
    .from("organization_people")
    .insert({
      organization_id: org.organizationId,
      display_name: name,
      normalized_name: personKey(name),
      external_ref: input.externalRef?.trim() || null,
      relationship_kind: input.relationshipKind ?? "other",
      source_note: input.sourceNote ?? null,
      created_by: caller.userId,
      link_state: "unlinked",
    })
    .select("id")
    .single();
  if (res.error) return classify(res.error);
  return { kind: "ok", personId: res.data.id as string, displayName: name };
}

/** Settle one staged row's ambiguity. Both ids are validated against the
 *  session's own organization by the composite foreign keys and by RLS. */
export async function resolveRow(
  caller: DomainCaller,
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
  const res = await db(caller.supabase)
    .from("evidence_import_rows")
    .update(patch)
    .eq("id", input.rowId)
    .select("id");
  if (res.error) return classify(res.error);
  if (!Array.isArray(res.data) || res.data.length === 0)
    return { kind: "not-found" };
  return { kind: "ok", updated: true };
}

// ── commit ──────────────────────────────────────────────────────────────────

export interface CommitResult {
  readonly written: number;
  readonly skippedDuplicates: number;
  readonly notReady: number;
  readonly recordIds: readonly string[];
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
  caller: DomainCaller,
  sessionId: string,
  opts?: { readonly evidenceState?: ReportedEvidenceState },
): Promise<EvidenceImportResult<CommitResult>> {
  const session = await loadSession(caller, sessionId);
  if (!session.ok) return session.failure;

  const rowsRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select(
      "id, row_index, organization_person_id, work_object_id, activity_date, period_start, period_end, hours, activity_text, source_fact, fact_fields, derived, record_fingerprint, status, person_match_confidence",
    )
    .eq("session_id", sessionId)
    .eq("status", "ready")
    .order("row_index", { ascending: true })
    .limit(MAX_ROWS_PER_SESSION);
  if (rowsRes.error) return classify(rowsRes.error);
  const ready = (rowsRes.data ?? []) as Record<string, unknown>[];

  const notReadyRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .neq("status", "ready");
  const notReady = notReadyRes.error ? 0 : (notReadyRes.count ?? 0);

  if (ready.length === 0) {
    return {
      kind: "ok",
      written: 0,
      skippedDuplicates: 0,
      notReady,
      recordIds: [],
    };
  }

  const importedAt = new Date().toISOString();
  const state: ReportedEvidenceState =
    opts?.evidenceState ?? "ORGANIZATION_REPORTED";

  // The per-session tamper-evidence chain, in row order (doctrine 3.3).
  let prev: string | null = null;
  const payload = ready.map((r) => {
    const fingerprint = r.record_fingerprint as string;
    const self = chainHash(prev, fingerprint, importedAt);
    const row = {
      organization_id: session.organizationId,
      organization_person_id: r.organization_person_id as string,
      activity_kind: "work",
      context_label: null,
      work_object_id: (r.work_object_id as string | null) ?? null,
      activity_date: (r.activity_date as string | null) ?? null,
      period_start: (r.period_start as string | null) ?? null,
      period_end: (r.period_end as string | null) ?? null,
      hours: r.hours ?? null,
      original_text: (r.activity_text as string | null) ?? "",
      original_language: session.sourceLanguage,
      evidence_state: state,
      supplied_by_organization_id: session.organizationId,
      supplier_role: session.supplierRole,
      supplied_by_profile_id: caller.userId,
      imported_by_profile_id: caller.userId,
      imported_at: importedAt,
      session_id: sessionId,
      import_row_id: r.id as string,
      source_kind: session.sourceKind,
      source_filename: session.sourceFilename,
      source_reference: session.sourceReference,
      source_fact: r.source_fact ?? {},
      derived: r.derived ?? {},
      confidence: r.person_match_confidence ?? null,
      record_fingerprint: fingerprint,
      hash_prev: prev,
      hash_self: self,
    };
    prev = self;
    return row;
  });

  const ins = await db(caller.supabase)
    .from("organization_evidence_records")
    .upsert(payload, {
      onConflict: "organization_id,record_fingerprint",
      ignoreDuplicates: true,
    })
    .select("id, import_row_id");
  if (ins.error) return classify(ins.error);

  const written = Array.isArray(ins.data) ? ins.data.length : 0;
  const writtenRowIds = new Set(
    ((ins.data ?? []) as Record<string, unknown>[]).map(
      (r) => r.import_row_id as string,
    ),
  );

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
  const signalRows = ((ins.data ?? []) as Record<string, unknown>[])
    .filter((r) => writtenRowIds.has(r.import_row_id as string))
    .flatMap((r) =>
      competencySignalRows(
        session.organizationId,
        r.id as string,
        deriveCompetencySignals(textByRowId.get(r.import_row_id as string)),
      ),
    );
  if (signalRows.length > 0) {
    const sig = await db(caller.supabase)
      .from("organization_evidence_competency_signals")
      .upsert(signalRows, {
        onConflict: "record_id,term",
        ignoreDuplicates: true,
      });
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

  // Mark the staged rows. Re-running this is harmless, which is what makes the
  // whole commit safely re-runnable after a partial failure.
  await db(caller.supabase)
    .from("evidence_import_rows")
    .update({ status: "committed", updated_at: new Date().toISOString() })
    .in(
      "id",
      ready.map((r) => r.id as string),
    );

  await recordImportEvent(caller, {
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
    recordIds: ((ins.data ?? []) as Record<string, unknown>[])
      .filter((r) => writtenRowIds.has(r.import_row_id as string))
      .map((r) => r.id as string),
  };
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
  caller: DomainCaller,
  sessionId: string,
  note?: string | null,
): Promise<EvidenceImportResult<{ affected: number }>> {
  return lifecycleSweep(caller, sessionId, "withdrawn", "rolled_back", note);
}

export async function reinstateImport(
  caller: DomainCaller,
  sessionId: string,
  note?: string | null,
): Promise<EvidenceImportResult<{ affected: number }>> {
  return lifecycleSweep(caller, sessionId, "reinstated", "reinstated", note);
}

async function lifecycleSweep(
  caller: DomainCaller,
  sessionId: string,
  eventType: "withdrawn" | "reinstated",
  importEvent: "rolled_back" | "reinstated",
  note?: string | null,
): Promise<EvidenceImportResult<{ affected: number }>> {
  const session = await loadSession(caller, sessionId);
  if (!session.ok) return session.failure;

  const recs = await db(caller.supabase)
    .from("organization_evidence_records")
    .select("id")
    .eq("session_id", sessionId)
    .limit(MAX_ROWS_PER_SESSION);
  if (recs.error) return classify(recs.error);
  const ids = ((recs.data ?? []) as Record<string, unknown>[]).map(
    (r) => r.id as string,
  );
  if (ids.length === 0) return { kind: "ok", affected: 0 };

  const ins = await db(caller.supabase)
    .from("organization_evidence_events")
    .insert(
      ids.map((id) => ({
        organization_id: session.organizationId,
        record_id: id,
        event_type: eventType,
        actor_profile_id: caller.userId,
        note: note ?? null,
      })),
    )
    .select("id");
  if (ins.error) return classify(ins.error);

  await recordImportEvent(caller, {
    organizationId: session.organizationId,
    sessionId,
    eventType: importEvent,
    payload: { records: ids.length },
  });
  return {
    kind: "ok",
    affected: Array.isArray(ins.data) ? ins.data.length : 0,
  };
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
 */
export async function attestRecord(
  caller: DomainCaller,
  input: {
    readonly recordId: string;
    readonly actorRole: (typeof ATTESTATION_ROLES)[number];
    readonly note?: string | null;
  },
): Promise<EvidenceImportResult<{ eventId: string }>> {
  const rec = await db(caller.supabase)
    .from("organization_evidence_records")
    .select("organization_id")
    .eq("id", input.recordId)
    .maybeSingle();
  if (rec.error) return classify(rec.error);
  if (!rec.data) return { kind: "not-found" };

  const res = await db(caller.supabase)
    .from("organization_evidence_events")
    .insert({
      organization_id: rec.data.organization_id as string,
      record_id: input.recordId,
      event_type: "attested",
      actor_role: input.actorRole,
      actor_organization_id: rec.data.organization_id as string,
      actor_profile_id: caller.userId,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (res.error) {
    // 42501 here means the caller does not manage this organization — a real
    // authorization refusal, reported as such rather than as a generic failure.
    if (res.error.code === "42501") {
      return { kind: "not-authorized", reason: "not-authorized" };
    }
    return classify(res.error);
  }
  return { kind: "ok", eventId: res.data.id as string };
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
  /** Does the CALLER's own contest stand on this record right now? Drives which
   *  act the subject's surface offers - contest, or withdraw the contest. It is
   *  deliberately per-caller: `state === "DISPUTED"` can also be an
   *  organization contesting a record it received, and that is not the reader's
   *  to withdraw. */
  readonly disputedByMe: boolean;
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
    readonly limit?: number;
  } = {},
): Promise<EvidenceImportResult<{ records: readonly EvidenceRecordView[] }>> {
  let q = db(caller.supabase)
    .from("organization_evidence_records")
    .select(
      "id, organization_person_id, activity_kind, activity_date, period_start, period_end, hours, original_text, original_language, context_label, work_object_id, supplier_role, source_kind, source_filename, imported_at, imported_by_profile_id, evidence_state, derived, organization_people(display_name, linked_profile_id), organization_evidence_events(event_type, actor_role, actor_profile_id, created_at)",
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
      factFields: [],
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
      disputedByMe: anyStandingDispute(
        events.filter((e) => e.actorProfileId === caller.userId),
      ),
    } satisfies EvidenceRecordView;
  });

  return { kind: "ok", records };
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
  input: { readonly personId: string; readonly decision: "accept" | "refuse" },
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
  const res = await db(caller.supabase)
    .from("organization_people")
    .update(patch)
    .eq("id", input.personId)
    .eq("linked_profile_id", caller.userId)
    .select("id");
  if (res.error) return classify(res.error);
  if (!Array.isArray(res.data) || res.data.length === 0)
    return { kind: "not-found" };
  return {
    kind: "ok",
    linkState: input.decision === "accept" ? "linked" : "unlinked",
  };
}

// ── the subject CONTESTS a record ───────────────────────────────────────────

/**
 * THE SUBJECT'S ANSWER TO THE CONTENT, not to the link.
 *
 * The roster-link refusal above answers a different question — "may this
 * organization name me at all", once, all-or-nothing. Once linked, a single
 * false line could not be contested, and refusing the whole link to escape one
 * wrong record would have discarded the true records with it.
 *
 * A contest NEVER mutates or deletes what the organization recorded. It appends
 * one lifecycle event, exactly as `withdrawn` and `corrected` do, so both sides
 * stay on the record — which is the difference between contesting and erasing.
 *
 * WHY AN RPC AND NOT A TABLE WRITE: `organization_evidence_events` has two
 * INSERT policies and neither can ever admit the subject (one requires
 * `manages_organization`, the other admits only `independently_verified` and
 * excludes the subject by name). The RPC is the narrow write path — the event
 * type is hard-coded inside it, so this is not a general event writer.
 *
 * `42501` is the honest refusal for both "not the subject" and "no such
 * record": a caller must not learn a record exists by getting a different
 * error for it.
 */
async function callDisputeRpc(
  caller: DomainCaller,
  fn:
    | "dispute_organization_evidence_record_v1"
    | "withdraw_organization_evidence_dispute_v1",
  input: { readonly recordId: string; readonly note?: string | null },
): Promise<EvidenceImportResult<{ readonly eventId: string }>> {
  const note = (input.note ?? "").trim();
  if (note.length > 1000) {
    return { kind: "invalid", problems: ["note_too_long"] };
  }
  const res = await db(caller.supabase).rpc(fn, {
    p_record_id: input.recordId,
    p_note: note === "" ? null : note,
  });
  if (res.error) {
    // P0002 from the withdraw path means there is no standing contest of the
    // caller's own to take back — a stale screen, not a permissions problem.
    if (res.error.code === "P0002") return { kind: "not-found" };
    return classify(res.error);
  }
  return { kind: "ok", eventId: String(res.data) };
}

export async function disputeEvidenceRecord(
  caller: DomainCaller,
  input: { readonly recordId: string; readonly note?: string | null },
): Promise<EvidenceImportResult<{ readonly eventId: string }>> {
  return callDisputeRpc(
    caller,
    "dispute_organization_evidence_record_v1",
    input,
  );
}

export async function withdrawEvidenceRecordDispute(
  caller: DomainCaller,
  input: { readonly recordId: string; readonly note?: string | null },
): Promise<EvidenceImportResult<{ readonly eventId: string }>> {
  return callDisputeRpc(
    caller,
    "withdraw_organization_evidence_dispute_v1",
    input,
  );
}
