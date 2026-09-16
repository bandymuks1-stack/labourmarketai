import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
import { chainHash, recordFingerprint } from "./fingerprint";
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
import { HOURS_EXCEED_DAY_METHOD } from "./parse-tabular";
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
  extractSiteFromText,
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
  /** A human has looked at this row's flagged figure and kept it as stated. */
  readonly acknowledged: boolean;
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
export const HOURS_ACKNOWLEDGED_METHOD = "human_acknowledged_as_stated";

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

function isAcknowledged(derived: Record<string, unknown>): boolean {
  const a = derived.humanAcknowledgement as { method?: string } | undefined;
  return a?.method === HOURS_ACKNOWLEDGED_METHOD;
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
  readonly people: readonly { readonly label: string; readonly rows: number }[];
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
    /** Rows stating more hours than a day holds, not yet acknowledged. */
    readonly impossibleHours: number;
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
    const acknowledged = isAcknowledged(priorDerived);
    const impossibleHours =
      (priorDerived.hoursPlausibility as { method?: string } | undefined)?.method === HOURS_EXCEED_DAY_METHOD &&
      !acknowledged;

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
    const settled = contextState !== "ambiguous" && dup.state !== "duplicate" && !impossibleHours;
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
            : impossibleHours
              ? "hours_exceed_day"
              : personState === "unmatched"
                ? "person_not_on_roster"
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
      readyWithPlan,
      contextWillCreate,
      contexts,
      acknowledged,
      problem,
    });

    // The reading is persisted on STAGING (`derived.workContexts`) beside the
    // parser's own derived fields and the human's acknowledgement, so the
    // commit carries it into the record and a later preview keeps the
    // human's choices.
    const nextDerived: Record<string, unknown> = { ...priorDerived };
    if (contexts) nextDerived.workContexts = contexts;
    else delete nextDerived.workContexts;

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

  // The plan: one entry per DISTINCT label (the same normalisation the
  // matcher uses), so "Jonas Petraitis" on forty rows is one person to create.
  const planPeople = new Map<string, { label: string; rows: number }>();
  const planObjects = new Map<
    string,
    { label: string; rows: number; spellings: Set<string>; origin: "cell" | "text" }
  >();
  for (const r of preview) {
    if (r.readyWithPlan && r.personLabel) {
      const key = personKey(r.personLabel);
      const entry = planPeople.get(key) ?? { label: r.personLabel, rows: 0 };
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
    kind: "ok",
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
        impossibleHours: preview.filter((r) => r.problem === "hours_exceed_day").length,
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
  const fromCells = canonicalPlaces(segments, objects);
  const known = (places: readonly CanonicalPlace[]): KnownPlace[] => [
    ...objects.map((o) => ({ id: o.id, name: o.name })),
    ...places.filter((c) => c.existing === null).map((c) => ({ id: null, name: c.name })),
  ];
  for (const text of textRows) {
    const site = extractSiteFromText(text, known(fromCells));
    if (site) segments.push(toSegment(site.label));
  }
  const canonical = canonicalPlaces(segments, objects);
  return { canonical, knownAll: known(canonical) };
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

/**
 * Settle one PLACE LABEL for the whole session — asked once, applied to
 * every row that names it (`Travers` on 11 rows is one question, not
 * eleven). The choice is stamped into each row's `derived.workContexts`
 * with method `human_choice`, which the next preview carries over instead
 * of re-matching. Writes STAGING only.
 */
export async function resolveContextLabel(
  caller: DomainCaller,
  input: {
    readonly sessionId: string;
    /** The segment key (`normalizeLabel` of the source spelling). */
    readonly key: string;
    readonly decision:
      | { readonly kind: "object"; readonly workObjectId: string }
      | { readonly kind: "create"; readonly name?: string | null }
      | { readonly kind: "ignore" };
  },
): Promise<EvidenceImportResult<{ readonly updated: number }>> {
  const session = await loadSession(caller, input.sessionId);
  if (!session.ok) return session.failure;
  const key = input.key.trim();
  if (key === "") return { kind: "invalid", problems: ["key"] };

  let objectName: string | null = null;
  const decision = input.decision;
  if (decision.kind === "object") {
    const objects = await readWorkObjects(caller, session.organizationId);
    if (!objects.ok) return objects.failure;
    const obj = objects.value.find((o) => o.id === decision.workObjectId);
    if (!obj) return { kind: "not-found" };
    objectName = obj.name;
  }

  const rowsRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select("id, derived")
    .eq("session_id", input.sessionId)
    .neq("status", "committed")
    .limit(MAX_ROWS_PER_SESSION);
  if (rowsRes.error) return classify(rowsRes.error);

  let updated = 0;
  for (const s of (rowsRes.data ?? []) as Record<string, unknown>[]) {
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
      return { ...seg, state: "ignored", workObjectId: null, confidence: 1, method: HUMAN_CHOICE, candidates: [] };
    });
    const next: WorkContexts = { ...contexts, segments };
    const upd = await db(caller.supabase)
      .from("evidence_import_rows")
      .update({
        work_object_id: singleObjectId(next),
        context_state: rowContextState(next),
        derived: { ...derived, workContexts: next },
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id as string);
    if (upd.error) return classify(upd.error);
    updated += 1;
  }
  return { kind: "ok", updated };
}

/**
 * A human has looked at a flagged figure and keeps it AS STATED (owner
 * command §11: informed acknowledgement, responsibility preserved). The
 * figure is not changed; the row records who accepted it and the next
 * preview lets it through. Writes STAGING only.
 */
export async function acknowledgeRows(
  caller: DomainCaller,
  input: {
    readonly sessionId: string;
    /** Either specific rows, or every row carrying this problem. */
    readonly rowIds?: readonly string[];
    readonly problem?: "hours_exceed_day";
  },
): Promise<EvidenceImportResult<{ readonly updated: number }>> {
  const session = await loadSession(caller, input.sessionId);
  if (!session.ok) return session.failure;
  let q = db(caller.supabase)
    .from("evidence_import_rows")
    .select("id, derived")
    .eq("session_id", input.sessionId)
    .neq("status", "committed")
    .limit(MAX_ROWS_PER_SESSION);
  if (input.rowIds && input.rowIds.length > 0) q = q.in("id", input.rowIds);
  else if (input.problem) q = q.eq("problem", input.problem);
  else return { kind: "invalid", problems: ["rowIds or problem"] };
  const rowsRes = await q;
  if (rowsRes.error) return classify(rowsRes.error);

  let updated = 0;
  const at = new Date().toISOString();
  for (const s of (rowsRes.data ?? []) as Record<string, unknown>[]) {
    const derived = (s.derived as Record<string, unknown> | null) ?? {};
    if (isAcknowledged(derived)) continue;
    const upd = await db(caller.supabase)
      .from("evidence_import_rows")
      .update({
        derived: {
          ...derived,
          humanAcknowledgement: {
            value: input.problem ?? "row",
            method: HOURS_ACKNOWLEDGED_METHOD,
            confidence: 1,
            note: `by ${caller.userId} at ${at}`,
          },
        },
        updated_at: at,
      })
      .eq("id", s.id as string);
    if (upd.error) return classify(upd.error);
    updated += 1;
  }
  return { kind: "ok", updated };
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
  caller: DomainCaller,
  session: { readonly organizationId: string },
  sessionId: string,
  plan: CommitPlanOptions,
): Promise<{ createdPeople: number; createdObjects: number } | EvidenceImportFailure> {
  let createdPeople = 0;
  let createdObjects = 0;
  if (!plan.createPeople && !plan.createObjects) return { createdPeople, createdObjects };

  const rowsRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select("id, person_label, context_label, person_state, context_state, status, problem, derived")
    .eq("session_id", sessionId)
    .neq("status", "skipped")
    .limit(MAX_ROWS_PER_SESSION);
  if (rowsRes.error) return classify(rowsRes.error);
  const staged = (rowsRes.data ?? []) as Record<string, unknown>[];

  if (plan.createPeople) {
    const roster = await readRoster(caller, session.organizationId);
    if (!roster.ok) return roster.failure;
    const current = [...roster.value];
    const byKey = new Map<string, string>(); // personKey → id
    for (const s of staged) {
      if (s.person_state !== "unmatched") continue;
      const label = (s.person_label as string | null) ?? "";
      if (label.trim() === "") continue;
      const key = personKey(label);
      let personId = byKey.get(key) ?? null;
      if (!personId) {
        // Fresh match against the CURRENT roster: an ambiguous name is still
        // the human's, an exact one is reused, only a true absence is created.
        const m = matchPerson({ name: label }, current);
        if (m.kind === "matched") personId = m.personId;
        else if (m.kind === "ambiguous") continue;
        else {
          const created = await createRosterPerson(caller, {
            organizationId: session.organizationId,
            displayName: label,
            relationshipKind: plan.relationshipKind ?? "other",
            sourceNote: `evidence import ${sessionId}`,
          });
          if (created.kind !== "ok") return created;
          personId = created.personId;
          createdPeople += 1;
          current.push({
            id: personId,
            displayName: created.displayName,
            normalizedName: key,
            externalRef: null,
          });
        }
        byKey.set(key, personId);
      }
      const upd = await db(caller.supabase)
        .from("evidence_import_rows")
        .update({
          organization_person_id: personId,
          person_state: "created",
          person_match_method: "plan_created",
          person_match_confidence: 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id as string);
      if (upd.error) return classify(upd.error);
    }
  }

  if (plan.createObjects) {
    const objects = await readWorkObjects(caller, session.organizationId);
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
      const segments = await Promise.all(
        contexts.segments.map(async (seg): Promise<WorkContextSegment> => {
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
              // inside the RPC). It answers a status, not an id, so the register
              // is re-read and matched — the same way a human's "add" is read back.
              const rpc = await db(caller.supabase).rpc("create_work_object_v1", {
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
              const status = String(rpc.data ?? "");
              if (status === "not_allowed") throw { kind: "not-authorized", reason: "not-authorized" } as EvidenceImportFailure;
              if (status !== "created") return seg; // invalid / limit_reached: the row keeps its label
              const again = await readWorkObjects(caller, session.organizationId);
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
        }),
      ).catch((failure: EvidenceImportFailure) => failure);
      if (!Array.isArray(segments)) return segments;
      if (!changed) continue;
      const next: WorkContexts = { ...contexts, segments };
      const upd = await db(caller.supabase)
        .from("evidence_import_rows")
        .update({
          work_object_id: singleObjectId(next),
          context_state: rowContextState(next),
          derived: { ...derived, workContexts: next },
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id as string);
      if (upd.error) return classify(upd.error);
    }
  }

  // The events table's CHECK admits seven event types and "plan applied" is
  // not one of them; widening it is a schema change (RED). The plan is the
  // commit's own preparation, so it is recorded as the `previewed` stage it
  // re-materialises, with the stage named in the payload — never dropped.
  await recordImportEvent(caller, {
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
  caller: DomainCaller,
  sessionId: string,
  opts?: {
    readonly evidenceState?: ReportedEvidenceState;
    /** The reviewed plan. Absent = the default plan (create both). */
    readonly plan?: CommitPlanOptions;
  },
): Promise<EvidenceImportResult<CommitResult>> {
  const session = await loadSession(caller, sessionId);
  if (!session.ok) return session.failure;

  // FIRST the plan, THEN the rows: what the source named and the preview
  // showed as "will be created" is created now, under the same explicit
  // approval, and the preview is rebuilt so fingerprints, duplicates and
  // readiness are computed against the people and sites that now exist.
  const planOpts: CommitPlanOptions = opts?.plan ?? {
    createPeople: true,
    createObjects: true,
  };
  const applied = await applyPlan(caller, session, sessionId, planOpts);
  if ("kind" in applied) return applied;
  if (planOpts.createPeople || planOpts.createObjects) {
    const re = await buildPreview(caller, sessionId);
    if (re.kind !== "ok") return re;
  }

  const rowsRes = await db(caller.supabase)
    .from("evidence_import_rows")
    .select(
      "id, row_index, organization_person_id, work_object_id, context_label, activity_date, period_start, period_end, hours, activity_text, source_fact, fact_fields, derived, record_fingerprint, status, person_match_confidence",
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
      createdPeople: applied.createdPeople,
      createdObjects: applied.createdObjects,
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
      // The source's own words for WHERE, verbatim — the column exists for
      // exactly this and was being written null. A multi-place day keeps
      // its places in `derived.workContexts`; the single object goes here.
      context_label: (r.context_label as string | null) ?? null,
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
    createdPeople: applied.createdPeople,
    createdObjects: applied.createdObjects,
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
      "id, organization_person_id, activity_kind, activity_date, period_start, period_end, hours, original_text, original_language, context_label, work_object_id, supplier_role, source_kind, source_filename, imported_at, imported_by_profile_id, evidence_state, derived, organization_people(display_name, linked_profile_id), organization_evidence_events!organization_evidence_events_record_fk(event_type, actor_role, actor_profile_id, created_at)",
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
