/**
 * W11 — the canonical project lifecycle, as a PURE model.
 *
 * ONE vocabulary and ONE transition matrix, stated here so the SQL, the server
 * action, the renderer and the tests all read the same rules from the same
 * place. No IO, no `server-only`, no supabase — safe on both sides of the
 * boundary and trivially unit-testable, exactly like `action-registry.ts`.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The `projects` row was INSERT-ONLY in the entire product: `status` was
 * written once, to 'draft', by `create-project-core.ts`, and no code path
 * anywhere could change it. The CHECK had allowed 'live' and 'paused' since
 * 0001 and neither was ever written. A project could be created and never
 * started, paused or finished.
 *
 * ─── `active` IS NOT A PROJECT STATUS ───────────────────────────────────────
 * Worth stating because it looks like one: every `"active"` literal in
 * `lib/projects/` (`map.ts`, `projects.ts`, `operations.ts`,
 * `worker-project-access.ts`) is `project_worker_assignments.status`, a
 * SEPARATE two-value column (`active | ended`) on a different table. It is not
 * a project status and must never be folded into this union — renaming those
 * literals would break every assignment read in the product.
 *
 * ─── `closed` → `completed` ─────────────────────────────────────────────────
 * The old CHECK carried 'closed'. Nothing ever wrote it and the reports hub did
 * not even model it (`lib/reports/reports-hub.ts` counts draft/live/paused
 * only), so it was dead on arrival. Owner decision D1 (2026-08-04) replaces it
 * rather than keeping both: two synonyms for "finished" is how a vocabulary
 * rots, and the migration's production preflight measured zero rows using it.
 */

/** The canonical project status set. Ordered as the lifecycle runs. */
export const PROJECT_STATUSES = ["draft", "live", "paused", "completed"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * The transition matrix, as data.
 *
 * `completed` is TERMINAL: it is a key with an empty list, so nothing leads out
 * of it. That is the whole of "terminal" — there is no separate flag to keep in
 * sync with the matrix, and no way to add a return path without editing the one
 * place the rule lives.
 */
export const PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> =
  Object.freeze({
    // A draft starts. It cannot jump straight to paused (nothing to pause) or
    // to completed (nothing was ever done).
    draft: ["live"],
    live: ["paused", "completed"],
    paused: ["live", "completed"],
    // Terminal. Preserved as history; never reopened.
    completed: [],
  });

/** Narrowing guard — an invented value is never a status. Default-closed. */
export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * May `from` become `to`?
 *
 * Same-state is deliberately NOT a transition — it is a separate, deterministic
 * outcome (`already_in_state`) that must write nothing, audit nothing and end no
 * assignments. Answering `true` here would let a repeated "complete" re-run the
 * roster ending and stamp a fresh `ended_at` over a real historical one.
 *
 * An unknown `from` (a legacy or null stored status) matches nothing and yields
 * false — the same default-closed posture the SQL takes.
 */
export function canTransition(from: unknown, to: unknown): boolean {
  if (!isProjectStatus(from) || !isProjectStatus(to)) return false;
  return PROJECT_TRANSITIONS[from].includes(to);
}

/** The statuses reachable from here — what the UI may offer, and nothing more. */
export function nextStatuses(from: unknown): readonly ProjectStatus[] {
  return isProjectStatus(from) ? PROJECT_TRANSITIONS[from] : [];
}

/** Terminal = nothing leads out. Derived from the matrix, never stored twice. */
export function isTerminalStatus(status: unknown): boolean {
  return isProjectStatus(status) && PROJECT_TRANSITIONS[status].length === 0;
}

/**
 * May new work be assigned to a project in this state?
 *
 * `completed` refuses — that is what terminal means for a roster, and the RPC
 * enforces the same rule server-side (the client is never the authority). A
 * `draft` project accepts assignment: teams are commonly staffed before the
 * work is published, and refusing it here would invent a rule the product does
 * not have. An unknown status refuses (default-closed).
 */
export function acceptsAssignment(status: unknown): boolean {
  if (!isProjectStatus(status)) return false;
  return status !== "completed";
}

/**
 * PLANNING SEMANTICS — the one mapping, so the calendar and the panel cannot
 * disagree about what a status means for someone's time.
 *
 * This does NOT rewrite W12. It answers one narrow question the planning layer
 * already asks — "is this project real work in someone's schedule right now?" —
 * and W12's booking-overlap invariant is untouched.
 *
 *   draft      → not active work. Nothing is committed yet.
 *   live       → active work. Contributes to the schedule.
 *   paused     → NOT counted as an active conflict, and that is a product
 *                statement: a paused project is precisely the case where the
 *                worker's time is NOT claimed, so flagging it as a clash would
 *                invent a problem no record proves. It stays visible as paused
 *                wherever the existing model can show it.
 *   completed  → history only. Never a FUTURE conflict.
 */
export function isActivePlanningStatus(status: unknown): boolean {
  return status === "live";
}

/** Statuses whose project bands may still be READ into the calendar at all.
 *  Completed projects stay readable as history; they simply never conflict. */
export const PLANNING_READABLE_STATUSES: readonly ProjectStatus[] = [
  "draft",
  "live",
  "paused",
  "completed",
];

/** The tagged outcome vocabulary the RPC returns. Stable, and never a raw
 *  Postgres message — no SQL text may reach a person. */
export const PROJECT_LIFECYCLE_OUTCOMES = [
  "transitioned",
  "already_in_state",
  "invalid_transition",
  "not_authorized",
  "not_found",
  "conflict",
  "error",
] as const;

export type ProjectLifecycleOutcome = (typeof PROJECT_LIFECYCLE_OUTCOMES)[number];

export function isProjectLifecycleOutcome(v: unknown): v is ProjectLifecycleOutcome {
  return (
    typeof v === "string" &&
    (PROJECT_LIFECYCLE_OUTCOMES as readonly string[]).includes(v)
  );
}
