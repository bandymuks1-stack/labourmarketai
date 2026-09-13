import "server-only";

import type { CoreRead, DomainCaller } from "@/lib/domain/caller";

/**
 * ONE reader for the role signals behind every authenticated surface: the
 * role gate (`lib/auth/require-role.ts`), the dashboard shell
 * (`app/[locale]/dashboard/layout.tsx`) and the admin signal
 * (`lib/auth/superadmin.ts`).
 *
 * Why it exists — an HONESTY defect observed live on 2026-08-28. Those call
 * sites destructured the PostgREST `error` away and read `data ?? []`:
 *
 *     const { data: rolesRows } = await supabase.from("profile_roles")...
 *     const heldRoles = new Set((rolesRows ?? []).map((r) => r.role));
 *
 * On a transient read failure `data` is `null`, so the empty set was not
 * "unknown" — it was a positive claim: "you hold no roles". The role gate
 * turned that claim into `/<locale>/dashboard?notice=needs_worker_role` for
 * the `dev.worker@local.test` fixture whose `profile_roles` row really is
 * `worker / is_active=true` (first authenticated request to
 * `/lt/dashboard/opportunities` after a cold `next start`; every later request
 * to the same route rendered fine). The shell did the same thing more quietly:
 * a failed read stripped every role from the role switcher, the nav and
 * `deriveIsAdmin` for the whole authenticated tree.
 *
 * A failed read is not an answer. Every read routed through here:
 *
 *   1. retries ONCE — the observed fault was first-request-only (cold DB
 *      connection / pooler hiccup), which a second attempt clears;
 *   2. throws `RoleSignalUnavailableError` if the retry also fails, so the
 *      caller surfaces a real error (or an explicit fail-closed decision)
 *      instead of asserting a role state the code does not know.
 *
 * Doctrine §7 / §19: never present an infrastructure fault as a fact about
 * the user's account.
 */

/** Delay between the failed first read and the single retry. */
/**
 * WHAT A PROFILE MAY ACTUALLY HOLD — wider than what anyone can onboard into.
 *
 * `Role` (lib/auth/actions.ts) is the participation mode a person CHOOSES at
 * sign-up: worker, company, agency, customer. `profile_roles.role` also
 * carries `admin`, granted out of band by `admin:grant-superadmin --apply`
 * and read by `lib/auth/superadmin.ts` — nobody onboards into it.
 *
 * Measured in production: worker 31, company 10, agency 4, customer 2,
 * **admin 1**. So the onboarding union was already narrower than the column
 * it names. Nothing was broken by that, because every read path here is typed
 * `{ role: string }` and stays open — but a page that legitimately requires
 * the admin role could not be typed, and the mismatch was invisible.
 *
 * This names the distinction instead of leaving it to be rediscovered. It
 * stays OPEN (`string & {}`) for the same reason `EntityType` does: a value
 * the database can hold must be representable, and a closed union turns an
 * unlisted-but-real value into an unrepresentable one.
 */
export const KNOWN_HELD_ROLES = [
  "worker",
  "company",
  "agency",
  "customer",
  /** Granted, never onboarded — see lib/auth/superadmin.ts. */
  "admin",
] as const;

export type HeldProfileRole = (typeof KNOWN_HELD_ROLES)[number] | (string & {});

export const ROLE_SIGNAL_RETRY_DELAY_MS = 120;

/** The read did NOT answer. Distinct from "the read said: no such role". */
export class RoleSignalUnavailableError extends Error {
  readonly signal: string;

  constructor(signal: string, cause: unknown) {
    super(`${signal} could not be read (two attempts); the answer is unknown`, {
      cause,
    });
    this.name = "RoleSignalUnavailableError";
    this.signal = signal;
  }
}

type RoleRow = { role: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Non-secret shape of a PostgREST error, for the server log only. */
function logShape(error: unknown): Record<string, string> {
  if (error && typeof error === "object") {
    const e = error as { name?: unknown; message?: unknown; code?: unknown };
    return {
      name: String(e.name ?? "PostgrestError"),
      message: String(e.message ?? ""),
      code: String(e.code ?? ""),
    };
  }
  return { name: "unknown", message: String(error), code: "" };
}

/**
 * Run `read` and return its data. `read` is a THUNK because a PostgREST
 * builder cannot be awaited twice — the retry needs a fresh query.
 *
 * `null` means the read ANSWERED and there is no row. A throw means the read
 * never answered; callers must not collapse the two.
 */
export async function readRoleSignal<T>(
  signal: string,
  // `data` is NOT written as `T | null` here: a PostgREST response is a UNION
  // of `{ data, error: null }` and `{ data: null, error }`, and matching the
  // nullable half against `T | null` infers `T = never`. The nullability rides
  // inside T instead (callers get `Row | null` / `Row[] | null`).
  read: () => PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(ROLE_SIGNAL_RETRY_DELAY_MS);
    const { data, error } = await read();
    if (!error) return data;
    lastError = error;
    console.error("[auth/profile-roles] read failed", {
      signal,
      attempt: attempt + 1,
      ...logShape(error),
    });
  }
  throw new RoleSignalUnavailableError(signal, lastError);
}

/**
 * The active `profile_roles` rows for one profile. An empty array means the
 * read answered and the profile holds nothing; a `RoleSignalUnavailableError`
 * means the read never answered.
 */
export async function readActiveProfileRoles<T extends RoleRow>(
  read: () => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  return (await readRoleSignal("profile_roles", read)) ?? [];
}

/**
 * THE canonical `profile_roles` read as an explicit caller (G4 bridge).
 *
 * WHY THIS EXISTS. `readActiveProfileRoles` above is the ERROR-SEMANTICS
 * wrapper — it retries once and then throws, so an unanswered read can never
 * be rendered as "this person holds no roles". It is not a reader: every
 * caller passes its own PostgREST query, and three web surfaces (the dashboard
 * layout, the profile page, the account page) each wrote the same one.
 *
 * A fourth copy was about to be written in the capability registry, which is
 * exactly the shape `g4-domain-core-reuse` exists to refuse: a transport
 * adapter re-implementing a read the web already owns, where the copy serving
 * external clients is the one nobody watches.
 *
 * WHAT THIS DOES AND DOES NOT CENTRALIZE, stated precisely because the
 * tempting summary — "now every transport shares one query" — would be false.
 * The three web callers still pass their own query to
 * `readActiveProfileRoles`, and they are RIGHT to: they let the throw reach
 * the route error boundary, so a person never sees a shell rendered from a
 * role state nobody could read. A capability cannot throw — it must answer
 * with the failure inside its payload — so it needs the non-throwing shape
 * below. Converting the web surfaces to it would either change their failure
 * semantics or make each one re-throw, and neither is an improvement. They
 * were checked, not changed.
 *
 * The result is the same honest three-state the other cores return:
 * `{ ok: false }` when the read never answered, `{ ok: true, value: [] }` when
 * it answered and the person holds nothing. Absence and failure are different
 * facts (#1314) and a bearer consumer must be able to tell them apart.
 *
 * NOTE ON WHAT A ROLE IS. These are the RBAC rows — the small fixed technical
 * set (doctrine §5, positions vs roles). They are NOT what a person DOES;
 * that lives in professions, skills, positions and engagement contexts. The
 * set also carries `admin`, which is not a participation mode: a consumer
 * mapping these to modes must FILTER, never assume.
 */
export async function readHeldProfileRoles(
  caller: DomainCaller,
): Promise<CoreRead<HeldProfileRole[]>> {
  try {
    const rows = await readActiveProfileRoles<{ role: string }>(() =>
      caller.supabase
        .from("profile_roles")
        .select("role")
        .eq("profile_id", caller.userId)
        .eq("is_active", true),
    );
    return { ok: true, value: rows.map((r) => r.role as HeldProfileRole) };
  } catch {
    // `readActiveProfileRoles` already retried and logged. A throw means the
    // read never answered — the one thing that must not become an empty list.
    return { ok: false };
  }
}
