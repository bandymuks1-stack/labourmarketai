/**
 * THE NAME A MANAGER MAY ACTUALLY READ.
 *
 * ## The defect this exists to fix
 *
 * Every manager-facing journal surface resolved the worker's name from
 * `workers(profiles(full_name, email))`. A manager cannot read that row.
 * `profiles` RLS is, in production and locally, exactly:
 *
 *     profiles_select: (id = auth.uid()) OR is_admin()
 *
 * so the embed comes back `null` for anyone reviewing somebody else's entry,
 * and the fallback chain ended at `"—"`. Measured on the local stack, as the
 * fixture company owner reviewing the fixture worker:
 *
 * | read                                             | result           |
 * |--------------------------------------------------|------------------|
 * | `profiles` as service role                        | `Dev Worker`     |
 * | `profiles` as the manager (RLS)                   | **0 rows**       |
 * | `/dashboard/inbox/quick`                          | `—` on 14 of 14  |
 *
 * The page's own copy promises the opposite — *"kortelėje matosi
 * darbuotojas"* ("the card shows the worker") — and it asks the manager to
 * make a real confirmation decision about a person it will not name. A silent
 * `"—"` turns *"you may not see this person"* into *"this person has no
 * name"*, which is the same class of lie as #1314: a failed/forbidden read
 * reported as a fact about the subject.
 *
 * ## Why `workers.display_name` is the right source
 *
 * It is not a new disclosure. `workers` RLS is `can_view_worker(id)`, and that
 * function already returns TRUE for this manager — the database had already
 * decided they may see this worker. Reading the name from `workers` asks for
 * something the caller is authorised to have; reading it from `profiles` asked
 * for something they are not. No policy is loosened here, and no migration is
 * needed.
 *
 * It is also what the rest of the codebase already does: `lib/agency`,
 * `lib/assets`, `lib/company`, `lib/engagements`, `lib/instructions`,
 * `lib/leave`, `lib/projects` all read `workers(display_name)`, and
 * `lib/guards/worker-display-name-write-path.test.ts` guards the write path.
 * The four journal surfaces were the outlier, not the pattern.
 *
 * `profiles` stays in the chain deliberately: a worker reading their OWN
 * entries can read their own profile row, so they keep their full name even
 * with no `display_name` set.
 */

/** The shape the embed below produces. Optional throughout — a caller may not
 *  be allowed to read either side, and that is a normal answer, not an error. */
export type WorkerNameRow = {
  display_name?: string | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
} | null;

/**
 * The `workers` embed fields every journal surface selects. Composed by the
 * caller so each keeps its own `!inner` / optional join semantics:
 *
 *     `workers!inner(${WORKER_NAME_FIELDS})`
 *     `workers(${WORKER_NAME_FIELDS})`
 */
export const WORKER_NAME_FIELDS = "display_name, profiles(full_name, email)";

/** Shown when nothing readable names the worker. Kept as the existing dash so
 *  no surface silently changes shape; it now means what it says, because the
 *  readable source is consulted first. */
export const NO_READABLE_NAME = "—";

/** Trim and reject blanks — a `display_name` of `""` or `"   "` is absence,
 *  not a name, and must fall through rather than render as emptiness. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve the worker's name from what the CALLER could actually read:
 * `display_name` (readable via `can_view_worker`), else the profile full name
 * (own rows, or admin), else the email local part, else an explicit dash.
 * Never a raw id.
 */
export function resolveWorkerName(workers: WorkerNameRow): string {
  const displayName = clean(workers?.display_name);
  if (displayName) return displayName;
  const profile = workers?.profiles;
  const fullName = clean(profile?.full_name);
  if (fullName) return fullName;
  const email = clean(profile?.email);
  if (email) return email.split("@")[0];
  return NO_READABLE_NAME;
}
