import "server-only";

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
