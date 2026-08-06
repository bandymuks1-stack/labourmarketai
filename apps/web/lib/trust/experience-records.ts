import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  ELIGIBLE_INTERACTION_KINDS,
  type EligibleInteractionKind,
} from "./experience-eligibility";

/**
 * W6 slice 3 — the app side of the ONE experience domain
 * (supabase/migrations/20260802120000_experience_records_v1.sql, DRAFT,
 * owner-gated apply). Everything here FAILS CLOSED until the migration is
 * applied: `needs_migration` — never a fake success, never a fallback into
 * legacy review notes, never a placeholder count.
 *
 * Aggregation rule (canonical, chosen EXPLICITLY in the W6 directive): only
 * PUBLISHED experience records count; positive and negative separately; a
 * disputed published record STAYS counted but is surfaced as disputed —
 * never presented as an undisputed fact; `resolved_removed` rows leave the
 * counts (hide-by-state, never silent delete). Insufficient data renders as
 * ABSENCE, never as a zero-reputation.
 */

export type ExperienceSentiment = "positive" | "negative";
export type ExperienceSubjectType = "worker" | "organization";

export type ExperienceCounts = {
  readonly positive: number;
  readonly negative: number;
  /** Published rows currently under an open/under_review dispute. */
  readonly disputed: number;
  readonly totalConsidered: number;
};

export type ExperienceCountsState =
  | { readonly state: "counts"; readonly counts: ExperienceCounts }
  | { readonly state: "none" }
  | { readonly state: "needs_migration" }
  | { readonly state: "error" };

export type ExperienceActionResult =
  | { readonly ok: true; readonly id?: string; readonly status?: string }
  | {
      readonly ok: false;
      readonly code:
        | "needs_migration"
        | "not_authenticated"
        | "not_eligible"
        | "duplicate_for_interaction"
        | "self_review"
        | "invalid"
        | "not_authorized"
        | "not_subject"
        | "not_published"
        | "response_exists"
        | "dispute_exists"
        | "reason_required"
        | "invalid_transition"
        | "not_found"
        | "error";
    };

/** RPC absent (migration unapplied): undefined function / PostgREST miss /
 *  relation missing — the honest fail-closed signal. */
const ABSENT_CODES = new Set(["42883", "PGRST202", "42P01", "PGRST205"]);

const KNOWN_CODES = new Set([
  "not_authenticated",
  "not_eligible",
  "duplicate_for_interaction",
  "self_review",
  "not_authorized",
  "not_subject",
  "not_published",
  "response_exists",
  "dispute_exists",
  "reason_required",
  "invalid_transition",
  "not_found",
]);

type Db = Awaited<ReturnType<typeof createClient>>;

function mapRpc(
  data: unknown,
  error: { code?: string } | null,
): ExperienceActionResult {
  if (error) {
    if (ABSENT_CODES.has(error.code ?? "")) return { ok: false, code: "needs_migration" };
    return { ok: false, code: "error" };
  }
  const d = data as { ok?: boolean; code?: string; id?: string; status?: string } | null;
  if (d?.ok === true) return { ok: true, id: d.id, status: d.status };
  const code = d?.code ?? "error";
  if (KNOWN_CODES.has(code)) return { ok: false, code: code as never };
  if (code.startsWith("invalid")) return { ok: false, code: "invalid" };
  return { ok: false, code: "error" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (sb: Db, fn: string, args: Record<string, unknown>) => (sb as any).rpc(fn, args);

export async function submitExperienceRecord(args: {
  subjectType: ExperienceSubjectType;
  subjectId: string;
  interactionKind: EligibleInteractionKind;
  interactionId: string;
  sentiment: ExperienceSentiment;
  body: string;
}): Promise<ExperienceActionResult> {
  if (!(ELIGIBLE_INTERACTION_KINDS as readonly string[]).includes(args.interactionKind)) {
    return { ok: false, code: "invalid" };
  }
  if (args.sentiment !== "positive" && args.sentiment !== "negative") {
    return { ok: false, code: "invalid" };
  }
  const body = args.body.trim();
  if (body.length < 1 || body.length > 2000) return { ok: false, code: "invalid" };
  const sb = await createClient();
  const { data, error } = await rpc(sb, "submit_experience_record", {
    p_subject_type: args.subjectType,
    p_subject_id: args.subjectId,
    p_interaction_kind: args.interactionKind,
    p_interaction_id: args.interactionId,
    p_sentiment: args.sentiment,
    p_body: body,
  });
  return mapRpc(data, error);
}

export async function startExperienceModeration(id: string): Promise<ExperienceActionResult> {
  const sb = await createClient();
  const { data, error } = await rpc(sb, "start_experience_moderation", { p_id: id });
  return mapRpc(data, error);
}

export async function decideExperienceModeration(args: {
  id: string;
  decision: "published" | "rejected";
  reason: string;
}): Promise<ExperienceActionResult> {
  if (args.reason.trim().length < 1) return { ok: false, code: "reason_required" };
  const sb = await createClient();
  const { data, error } = await rpc(sb, "decide_experience_moderation", {
    p_id: args.id,
    p_decision: args.decision,
    p_reason: args.reason.trim(),
  });
  return mapRpc(data, error);
}

export async function submitExperienceResponse(args: {
  experienceId: string;
  body: string;
}): Promise<ExperienceActionResult> {
  const body = args.body.trim();
  if (body.length < 1 || body.length > 2000) return { ok: false, code: "invalid" };
  const sb = await createClient();
  const { data, error } = await rpc(sb, "submit_experience_response", {
    p_experience_id: args.experienceId,
    p_body: body,
  });
  return mapRpc(data, error);
}

export async function openExperienceDispute(args: {
  experienceId: string;
  reason: string;
}): Promise<ExperienceActionResult> {
  if (args.reason.trim().length < 1) return { ok: false, code: "reason_required" };
  const sb = await createClient();
  const { data, error } = await rpc(sb, "open_experience_dispute", {
    p_experience_id: args.experienceId,
    p_reason: args.reason.trim(),
  });
  return mapRpc(data, error);
}

export async function resolveExperienceDispute(args: {
  id: string;
  resolution: "upheld" | "changed" | "removed";
  reason: string;
}): Promise<ExperienceActionResult> {
  if (args.reason.trim().length < 1) return { ok: false, code: "reason_required" };
  const sb = await createClient();
  const { data, error } = await rpc(sb, "resolve_experience_dispute", {
    p_id: args.id,
    p_resolution: args.resolution,
    p_reason: args.reason.trim(),
  });
  return mapRpc(data, error);
}

/** The ONE public consumption path: count-only. Absence of data is state
 *  "none" — never a fabricated zero-reputation. */
export async function getExperienceCounts(
  subjectType: ExperienceSubjectType,
  subjectId: string,
): Promise<ExperienceCountsState> {
  const sb = await createClient();
  const { data, error } = await rpc(sb, "get_experience_counts", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
  });
  if (error) {
    if (ABSENT_CODES.has(error.code ?? "")) return { state: "needs_migration" };
    return { state: "error" };
  }
  const d = data as {
    positive?: number;
    negative?: number;
    disputed?: number;
    total_considered?: number;
  } | null;
  const counts: ExperienceCounts = {
    positive: d?.positive ?? 0,
    negative: d?.negative ?? 0,
    disputed: d?.disputed ?? 0,
    totalConsidered: d?.total_considered ?? 0,
  };
  if (counts.totalConsidered === 0) return { state: "none" };
  return { state: "counts", counts };
}

/** Pure mirror of the SQL derivation — unit-testable truth table for the ONE
 *  aggregation rule. Any drift between this and get_experience_counts is a
 *  defect. */
export function deriveExperienceCounts(
  rows: readonly {
    sentiment: ExperienceSentiment;
    moderationStatus: "submitted" | "in_moderation" | "published" | "rejected";
    disputeStatus:
      | "none"
      | "opened"
      | "under_review"
      | "resolved_upheld"
      | "resolved_changed"
      | "resolved_removed";
  }[],
): ExperienceCounts {
  const published = rows.filter((r) => r.moderationStatus === "published");
  const considered = published.filter((r) => r.disputeStatus !== "resolved_removed");
  return {
    positive: considered.filter((r) => r.sentiment === "positive").length,
    negative: considered.filter((r) => r.sentiment === "negative").length,
    disputed: published.filter(
      (r) => r.disputeStatus === "opened" || r.disputeStatus === "under_review",
    ).length,
    totalConsidered: considered.length,
  };
}

// ── Reads (RLS-scoped; the policy decides what comes back) ─────────────────

export type ExperienceRow = {
  readonly id: string;
  readonly sentiment: ExperienceSentiment;
  readonly body: string;
  readonly moderationStatus: "submitted" | "in_moderation" | "published" | "rejected";
  readonly disputeStatus:
    | "none"
    | "opened"
    | "under_review"
    | "resolved_upheld"
    | "resolved_changed"
    | "resolved_removed";
  readonly interactionKind: string;
  readonly submittedAt: string | null;
  readonly isAuthor: boolean;
  /** WHO the record is about — 'worker' = a person subject, 'organization' =
   *  an organization subject. Present since the v1 schema; surfaced so the
   *  moderation queue and the result stop rendering subject-blind rows. */
  readonly subjectType: ExperienceSubjectType;
  /** HOW it was authored — 'organization' = submitted on behalf of an
   *  organization party of the interaction. Null while the owner-gated
   *  author/subject migration is unapplied (column absent): the UI then
   *  simply omits the author-side label — never a guess. */
  readonly authorSide: "person" | "organization" | null;
};

export type ExperienceListState =
  | { readonly state: "list"; readonly mine: ExperienceRow[]; readonly aboutMe: ExperienceRow[] }
  | { readonly state: "needs_migration" }
  | { readonly state: "error" };

/** Columns present since the v1 schema. */
const BASE_SELECT =
  "id, sentiment, body, moderation_status, dispute_status, interaction_kind, submitted_at, author_profile_id, subject_type";
/** author_side arrives with the owner-gated author/subject migration. */
const EXTENDED_SELECT = `${BASE_SELECT}, author_side`;

const UNDEFINED_COLUMN_CODE = "42703";

type RawRows =
  | { rows: Record<string, unknown>[]; authorSideKnown: boolean }
  | { state: "needs_migration" }
  | { state: "error" };

/**
 * One read path for every experience list. Tries the author-side-aware
 * select first; a stack where the author/subject migration is unapplied
 * answers 42703 (undefined column) — the read then falls back to the v1
 * column set and every row carries `authorSide: null`. The DOMAIN being
 * absent entirely still maps to needs_migration, never to an empty list.
 */
async function readExperienceRows(
  build: (q: unknown) => unknown,
): Promise<RawRows> {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = (select: string) =>
    build((sb as any).from("experience_records").select(select)) as PromiseLike<{
      data: unknown;
      error: { code?: string } | null;
    }>;

  let authorSideKnown = true;
  let { data, error } = await query(EXTENDED_SELECT);
  if (error && (error.code ?? "") === UNDEFINED_COLUMN_CODE) {
    authorSideKnown = false;
    ({ data, error } = await query(BASE_SELECT));
  }
  if (error) {
    if (ABSENT_CODES.has(error.code ?? "")) return { state: "needs_migration" };
    return { state: "error" };
  }
  return { rows: (data ?? []) as Record<string, unknown>[], authorSideKnown };
}

function mapRow(
  r: Record<string, unknown>,
  authorSideKnown: boolean,
  viewerProfileId: string | null,
): ExperienceRow {
  return {
    id: String(r.id),
    sentiment: r.sentiment as ExperienceSentiment,
    body: String(r.body ?? ""),
    moderationStatus: r.moderation_status as ExperienceRow["moderationStatus"],
    disputeStatus: r.dispute_status as ExperienceRow["disputeStatus"],
    interactionKind: String(r.interaction_kind ?? ""),
    submittedAt: (r.submitted_at as string | null) ?? null,
    isAuthor: viewerProfileId !== null && r.author_profile_id === viewerProfileId,
    subjectType:
      r.subject_type === "organization" ? "organization" : "worker",
    authorSide: !authorSideKnown
      ? null
      : r.author_side === "organization"
        ? "organization"
        : "person",
  };
}

/** Everything the caller may see, split by side. RLS returns author rows in
 *  every state and subject-side rows only once PUBLISHED — this function adds
 *  no filtering of its own beyond that split. Internal moderation notes and
 *  actor ids are never selected. */
export async function listExperiencesForViewer(
  viewerProfileId: string,
): Promise<ExperienceListState> {
  const res = await readExperienceRows((q) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any).order("submitted_at", { ascending: false }).limit(100),
  );
  if ("state" in res) return res;
  const rows = res.rows.map((r) => mapRow(r, res.authorSideKnown, viewerProfileId));
  return {
    state: "list",
    mine: rows.filter((r) => r.isAuthor),
    aboutMe: rows.filter((r) => !r.isAuthor),
  };
}

/** The moderator queue. Authorization is the RLS policy's `is_admin()` — a
 *  non-admin simply gets their own rows, never the queue. */
export async function listModerationQueue(): Promise<ExperienceListState> {
  const res = await readExperienceRows((q) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any)
      .in("moderation_status", ["submitted", "in_moderation"])
      .order("submitted_at", { ascending: true })
      .limit(100),
  );
  if ("state" in res) return res;
  return {
    state: "list",
    mine: [],
    aboutMe: res.rows.map((r) => mapRow(r, res.authorSideKnown, null)),
  };
}

/** Disputes needing a moderator decision (separate dimension, separate view). */
export async function listDisputeQueue(): Promise<ExperienceListState> {
  const res = await readExperienceRows((q) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any)
      .in("dispute_status", ["opened", "under_review"])
      .order("submitted_at", { ascending: true })
      .limit(100),
  );
  if ("state" in res) return res;
  return {
    state: "list",
    mine: [],
    aboutMe: res.rows.map((r) => mapRow(r, res.authorSideKnown, null)),
  };
}
