/**
 * COUNTERPARTY REVIEW - pure model (EVID-2 slice 2; migrations
 * 20261003150500 + 20261003150550). No IO, no clock, no copy.
 *
 * The database decides who may do what (the SECURITY DEFINER functions are
 * the only write path and re-derive the caller). This module only turns their
 * answers into the states and message keys the three surfaces render:
 *
 *   A. the project page      - the client's representative registers / revokes
 *   B. the worker's journal  - Submit for review / Resubmit, entry state
 *   C. the counterparty queue - Accept / Request correction / Dispute
 *
 * Proof concepts stay separate: an acceptance here is CLIENT_ACCEPTED
 * (`lib/journal/confirmation-origin.ts`), never an employer confirmation, a
 * skill verification or a payment record.
 */

export const PARTY_ROLES = [
  "client",
  "end_client",
  "project_owner",
  "customer",
  "contracting_party",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export function isPartyRole(v: unknown): v is PartyRole {
  return typeof v === "string" && (PARTY_ROLES as readonly string[]).includes(v);
}

/** The three things a counterparty can do, as the UI names them. */
export const COUNTERPARTY_DECISIONS = [
  "accept",
  "request_correction",
  "dispute",
] as const;
export type CounterpartyDecision = (typeof COUNTERPARTY_DECISIONS)[number];

/** UI decision -> the EXISTING review_journal_entry vocabulary (no second
 *  status system). */
export const DECISION_TO_RPC = {
  accept: "approved",
  request_correction: "changes_requested",
  dispute: "rejected",
} as const satisfies Record<CounterpartyDecision, string>;

export type RpcDecision = (typeof DECISION_TO_RPC)[CounterpartyDecision];

export function isCounterpartyDecision(v: unknown): v is CounterpartyDecision {
  return (
    typeof v === "string" &&
    (COUNTERPARTY_DECISIONS as readonly string[]).includes(v)
  );
}

/** A correction request and a dispute are worthless without the reason: the
 *  note is required for them (accept may be silent). */
export const COUNTERPARTY_NOTE_MIN = 3;
export const COUNTERPARTY_NOTE_MAX = 2000;

export function counterpartyNoteProblem(
  decision: CounterpartyDecision,
  note: string,
): "required" | "too_long" | null {
  const trimmed = note.trim();
  if (trimmed.length > COUNTERPARTY_NOTE_MAX) return "too_long";
  if (decision !== "accept" && trimmed.length < COUNTERPARTY_NOTE_MIN) {
    return "required";
  }
  return null;
}

// ── Subject side ───────────────────────────────────────────────────────────

export interface ReviewCandidate {
  readonly linkId: string;
  readonly partyName: string | null;
  readonly partyRole: PartyRole | null;
}

export interface EntryReviewState {
  readonly supersededBy: string | null;
  readonly correctionOf: string | null;
  readonly submission: {
    readonly linkId: string;
    readonly submittedAt: string | null;
    readonly resubmissionOfEntryId: string | null;
    readonly partyName: string | null;
    readonly partyRole: PartyRole | null;
  } | null;
  readonly latest: {
    readonly decision: "approved" | "changes_requested" | "rejected";
    readonly note: string | null;
    readonly at: string | null;
  } | null;
  readonly candidates: readonly ReviewCandidate[];
}

export type EntryReviewPhase =
  /** Nothing to show: no submission and no legitimate counterparty. */
  | "none"
  /** One or more valid counterparties exist; the subject may submit. */
  | "ready_to_submit"
  | "submitted"
  | "accepted"
  | "correction_requested"
  | "disputed";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

function role(v: unknown): PartyRole | null {
  return isPartyRole(v) ? v : null;
}

function parseCandidate(v: unknown): ReviewCandidate | null {
  if (!isObj(v)) return null;
  const linkId = str(v.link_id);
  if (!linkId) return null;
  return { linkId, partyName: str(v.party_name), partyRole: role(v.party_role) };
}

function parseOne(v: unknown): EntryReviewState | null {
  if (!isObj(v)) return null;
  const sub = isObj(v.submission) ? v.submission : null;
  const lat = isObj(v.latest) ? v.latest : null;
  const decision = lat?.decision;
  return {
    supersededBy: str(v.superseded_by),
    correctionOf: str(v.correction_of),
    submission:
      sub && str(sub.link_id)
        ? {
            linkId: String(sub.link_id),
            submittedAt: str(sub.submitted_at),
            resubmissionOfEntryId: str(sub.resubmission_of_entry_id),
            partyName: str(sub.party_name),
            partyRole: role(sub.party_role),
          }
        : null,
    latest:
      lat &&
      (decision === "approved" ||
        decision === "changes_requested" ||
        decision === "rejected")
        ? { decision, note: str(lat.note), at: str(lat.at) }
        : null,
    candidates: Array.isArray(v.candidates)
      ? v.candidates
          .map(parseCandidate)
          .filter((c): c is ReviewCandidate => c !== null)
      : [],
  };
}

/** `entry_review_states_v1` answer -> map. Unknown shapes are dropped, never
 *  guessed: an entry without a parsed state simply shows no review panel. */
export function parseEntryReviewStates(json: unknown): Map<string, EntryReviewState> {
  const out = new Map<string, EntryReviewState>();
  if (!isObj(json)) return out;
  for (const [id, v] of Object.entries(json)) {
    const s = parseOne(v);
    if (s) out.set(id, s);
  }
  return out;
}

export function entryReviewPhase(state: EntryReviewState | null | undefined): EntryReviewPhase {
  if (!state) return "none";
  if (state.submission) {
    switch (state.latest?.decision) {
      case "approved":
        return "accepted";
      case "changes_requested":
        return "correction_requested";
      case "rejected":
        return "disputed";
      default:
        return "submitted";
    }
  }
  return state.candidates.length > 0 ? "ready_to_submit" : "none";
}

/**
 * Is this entry the corrected version of an entry that was itself submitted?
 * Then the submit control reads "Resubmit". `states` must contain the
 * original (the page asks for the ids of the entries AND of their
 * `correction_of` targets).
 */
export function isResubmission(
  state: EntryReviewState | null | undefined,
  states: ReadonlyMap<string, EntryReviewState>,
): boolean {
  if (!state?.correctionOf) return false;
  return states.get(state.correctionOf)?.submission != null;
}

// ── Counterparty side ──────────────────────────────────────────────────────

export interface QueueRow {
  readonly entryId: string;
  readonly submissionId: string;
  readonly linkId: string;
  readonly projectId: string | null;
  readonly workerId: string | null;
  readonly partyOrganizationId: string | null;
  readonly partyRole: PartyRole | null;
  readonly originalText: string;
  readonly originalLanguage: string | null;
  readonly entryCreatedAt: string | null;
  readonly submittedAt: string | null;
  readonly resubmissionOfEntryId: string | null;
  readonly latestDecision: "approved" | "changes_requested" | "rejected" | null;
}

export function parseQueueRows(json: unknown): QueueRow[] {
  if (!Array.isArray(json)) return [];
  const rows: QueueRow[] = [];
  for (const r of json) {
    if (!isObj(r)) continue;
    const entryId = str(r.entry_id);
    const submissionId = str(r.submission_id);
    const linkId = str(r.link_id);
    if (!entryId || !submissionId || !linkId) continue;
    const d = r.latest_decision;
    rows.push({
      entryId,
      submissionId,
      linkId,
      projectId: str(r.project_id),
      workerId: str(r.worker_id),
      partyOrganizationId: str(r.party_organization_id),
      partyRole: role(r.party_role),
      originalText: typeof r.original_text === "string" ? r.original_text : "",
      originalLanguage: str(r.original_language),
      entryCreatedAt: str(r.entry_created_at),
      submittedAt: str(r.submitted_at),
      resubmissionOfEntryId: str(r.resubmission_of_entry_id),
      latestDecision:
        d === "approved" || d === "changes_requested" || d === "rejected" ? d : null,
    });
  }
  return rows;
}

/** Waiting for the counterparty: never decided, or a dispute (which the
 *  party may still withdraw by accepting) - and a correction request that is
 *  waiting on the worker is NOT waiting on the counterparty. */
export type QueueBucket = "to_decide" | "waiting_for_worker" | "disputed" | "accepted";

export function queueBucket(row: Pick<QueueRow, "latestDecision">): QueueBucket {
  switch (row.latestDecision) {
    case "approved":
      return "accepted";
    case "changes_requested":
      return "waiting_for_worker";
    case "rejected":
      return "disputed";
    default:
      return "to_decide";
  }
}

export function partitionQueue(rows: readonly QueueRow[]): Record<QueueBucket, QueueRow[]> {
  const out: Record<QueueBucket, QueueRow[]> = {
    to_decide: [],
    waiting_for_worker: [],
    disputed: [],
    accepted: [],
  };
  for (const r of rows) out[queueBucket(r)].push(r);
  return out;
}

/** What the card may still offer. ACCEPT is final; after a correction request
 *  the party waits for the corrected version (a new entry); a dispute may be
 *  withdrawn by accepting. */
export function offeredDecisions(
  latest: QueueRow["latestDecision"],
): readonly CounterpartyDecision[] {
  switch (latest) {
    case "approved":
    case "changes_requested":
      return [];
    case "rejected":
      return ["accept"];
    default:
      return COUNTERPARTY_DECISIONS;
  }
}

export interface DetailMetric {
  readonly slug: string;
  readonly valueNumeric: number | null;
  readonly valueText: string | null;
  readonly unitSlug: string | null;
}
export interface DetailPhoto {
  readonly id: string;
  readonly fileName: string;
  readonly storagePath: string;
}
export interface DetailHistoryRow {
  readonly entryId: string;
  readonly decision: "approved" | "changes_requested" | "rejected" | null;
  readonly note: string | null;
  readonly at: string | null;
}
export interface EntryDetail {
  readonly entryId: string;
  readonly subjectName: string | null;
  readonly projectName: string | null;
  readonly partyRole: PartyRole | null;
  readonly originalText: string;
  readonly createdAt: string | null;
  readonly submittedAt: string | null;
  readonly resubmissionOfEntryId: string | null;
  readonly metrics: readonly DetailMetric[];
  readonly photos: readonly DetailPhoto[];
  readonly history: readonly DetailHistoryRow[];
}

export function parseEntryDetail(json: unknown): EntryDetail | null {
  if (!isObj(json)) return null;
  const entryId = str(json.entry_id);
  if (!entryId) return null;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    entryId,
    subjectName: str(json.subject_display_name),
    projectName: str(json.project_name),
    partyRole: role(json.party_role),
    originalText: typeof json.original_text === "string" ? json.original_text : "",
    createdAt: str(json.created_at),
    submittedAt: str(json.submitted_at),
    resubmissionOfEntryId: str(json.resubmission_of_entry_id),
    metrics: arr(json.metrics).flatMap((m) =>
      isObj(m) && str(m.metric_slug)
        ? [
            {
              slug: String(m.metric_slug),
              valueNumeric: typeof m.value_numeric === "number" ? m.value_numeric : null,
              valueText: str(m.value_text),
              unitSlug: str(m.unit_slug),
            },
          ]
        : [],
    ),
    photos: arr(json.photos).flatMap((p) =>
      isObj(p) && str(p.id) && str(p.storage_path)
        ? [
            {
              id: String(p.id),
              fileName: str(p.file_name) ?? "",
              storagePath: String(p.storage_path),
            },
          ]
        : [],
    ),
    history: arr(json.history).flatMap((h) => {
      if (!isObj(h) || !str(h.entry_id)) return [];
      const d = h.decision;
      return [
        {
          entryId: String(h.entry_id),
          decision:
            d === "approved" || d === "changes_requested" || d === "rejected" ? d : null,
          note: str(h.note),
          at: str(h.at),
        },
      ];
    }),
  };
}

// ── Project page: link candidates ──────────────────────────────────────────

export interface LinkCandidate {
  readonly workerId: string;
  readonly displayName: string | null;
  readonly kind: "person" | "team";
  readonly linkId: string | null;
  readonly partyRole: PartyRole | null;
  readonly establishedAt: string | null;
}

export function parseLinkCandidates(json: unknown): LinkCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: LinkCandidate[] = [];
  for (const r of json) {
    if (!isObj(r)) continue;
    const workerId = str(r.worker_id);
    if (!workerId) continue;
    out.push({
      workerId,
      displayName: str(r.display_name),
      kind: r.relationship_kind === "team" ? "team" : "person",
      linkId: str(r.link_id),
      partyRole: role(r.party_role),
      establishedAt: str(r.established_at),
    });
  }
  return out;
}

// ── RPC outcome -> message key (journal.counterparty.*.result.<key>) ───────

const REGISTER_OUTCOMES = new Set([
  "registered",
  "already_registered",
  "invalid_party_role",
  "project_not_found",
  "project_has_no_organization",
  "not_authorized",
  "worker_not_found",
  "subject_cannot_register_own_counterparty",
  "no_work_relationship",
  "subject_is_member_of_counterparty",
  "counterparty_not_independent",
]);
export function registerOutcomeKey(outcome: string): string {
  return REGISTER_OUTCOMES.has(outcome) ? outcome : "error";
}

const REVOKE_OUTCOMES = new Set(["revoked", "already_revoked", "link_not_found", "not_authorized"]);
export function revokeOutcomeKey(outcome: string): string {
  return REVOKE_OUTCOMES.has(outcome) ? outcome : "error";
}

const SUBMIT_OUTCOMES = new Set([
  "submitted",
  "already_submitted",
  "entry_not_found",
  "not_authorized",
  "entry_deleted",
  "entry_superseded",
  "entry_has_no_project",
  "counterparty_not_valid",
  "no_counterparty_registered",
  "counterparty_ambiguous",
]);
export function submitOutcomeKey(outcome: string): string {
  return SUBMIT_OUTCOMES.has(outcome) ? outcome : "error";
}

/** The counterparty decision refusals the RPC can return (the decision itself
 *  is the success value). */
const DECIDE_REFUSALS = new Set([
  "entry_not_found",
  "entry_not_org_scoped",
  "not_authorized",
  "review_not_enabled",
  "no_reviewer_engagement",
  "self_review_not_allowed",
  "review_authority_not_established",
  "already_accepted",
  "entry_superseded",
  "entry_deleted",
]);
export function decideRefusalKey(outcome: string): string {
  return DECIDE_REFUSALS.has(outcome) ? outcome : "error";
}

export function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}
