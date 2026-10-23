import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { CoreRead, DomainCaller } from "@/lib/domain/caller";

export type SessionProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  active_role: string | null;
  onboarded_at: string | null;
  country: string | null;
};

export type SessionProfile = {
  user: { id: string; email?: string } | null;
  profile: SessionProfileRow | null;
  /**
   * W6 honesty (2026-09-06): `failed` = the `profiles` read itself ERRORED.
   * Before this, a failed read and "no row" both arrived as `profile: null`,
   * and the dashboard root read that null as "a worker" — a company owner
   * whose row read timed out was greeted in the personal space as a person.
   * Consumers that decide a workspace must branch on this, never on `null`.
   */
  profileRead: "ok" | "failed";
};

/** The SUPERSET of the columns the per-transport `profiles` consumers read
 *  (session shell: onboarded_at/active_role; capability profile.get:
 *  locale/onboarded) — one select, so adopting the shared core never loses a
 *  column any consumer relied on (the worker-core superset pattern). */
export type ProfileCoreRow = SessionProfileRow & {
  locale: string | null;
  onboarded: boolean | null;
};

/**
 * THE caller's own `profiles` row as an explicit caller (G4 bridge) — the
 * transport-neutral core under `getSessionProfile` AND the MCP `profile.get`
 * capability. Honest three-state (#1314): a failed read is `{ ok: false }`,
 * never mistaken for "no profile row".
 */
export async function readProfileRow(
  caller: DomainCaller,
): Promise<CoreRead<ProfileCoreRow | null>> {
  const { row: read } = await readProfileRowOnce(caller.supabase, caller.userId);
  return read.ok ? { ok: true, value: read.value ? { ...read.value } : null } : { ok: false };
}

/**
 * The durable workspace pointer (`profiles.active_organization_id`, written
 * only by the membership-validated switch core) in the PostgREST response
 * shape its resolver reads: `error` when the column is absent (the migration
 * is unapplied) or the row did not answer, `data: null` when there is no row.
 *
 * It is a column of the SAME row as the profile above, so it rides the same
 * request-cached read (perf 2026-10-23) instead of a second `profiles` query
 * on every dashboard render. Never part of `readProfileRow`'s value — that
 * row is what the transports hand out (`profile.get`), and the pointer is not.
 */
export async function readStoredWorkspacePointer(
  supabase: DomainCaller["supabase"],
  userId: string,
): Promise<StoredPointerRead> {
  return (await readProfileRowOnce(supabase, userId)).pointer;
}

export type StoredPointerRead = {
  readonly data: { readonly active_organization_id: string | null } | null;
  readonly error: { readonly code?: string } | null;
};

type ProfileRowRead = {
  readonly row: CoreRead<ProfileCoreRow | null>;
  readonly pointer: StoredPointerRead;
};

/** The pointer column's own name; the profile row never carries it. */
const POINTER_COLUMN = "active_organization_id";
/** PostgREST: the selected column does not exist here (migration unapplied). */
const ABSENT_COLUMN_CODES = new Set(["42703", "PGRST204"]);
const PROFILE_COLUMNS = "id, full_name, email, locale, country, onboarded, onboarded_at, active_role";

/**
 * Read ONCE per server render per client and user (perf 2026-10-23): the
 * session profile, the employer context and the roster section's evidence
 * context each built their own caller and read the same row in one
 * `/dashboard/company/people` render. Keyed by the CLIENT, never the caller
 * object: a bearer transport or another identity reads for itself. React
 * `cache()` is request-scoped — a role switch is a server action, and the
 * render after it reads again.
 */
const readProfileRowOnce = cache(
  async (supabase: DomainCaller["supabase"], userId: string): Promise<ProfileRowRead> =>
    readProfileRowUncached({ supabase, userId }),
);

async function readProfileRowUncached(caller: DomainCaller): Promise<ProfileRowRead> {
  const read = (columns: string) =>
    caller.supabase.from("profiles").select(columns).eq("id", caller.userId).maybeSingle();
  const withPointer = await read(`${PROFILE_COLUMNS}, ${POINTER_COLUMN}`);
  if (withPointer.error && ABSENT_COLUMN_CODES.has(withPointer.error.code ?? "")) {
    // The pointer column is absent here: the profile row is re-read without
    // it, and the pointer reports the absence exactly as its own read did.
    const plain = await read(PROFILE_COLUMNS);
    if (plain.error) return { row: { ok: false }, pointer: { data: null, error: plain.error } };
    return {
      row: { ok: true, value: (plain.data as unknown as ProfileCoreRow | null) ?? null },
      pointer: { data: null, error: withPointer.error },
    };
  }
  // A failed row read is unknown for both — never "no pointer".
  if (withPointer.error) {
    return { row: { ok: false }, pointer: { data: null, error: withPointer.error } };
  }
  const data = withPointer.data as unknown as
    | (ProfileCoreRow & { active_organization_id?: string | null })
    | null;
  if (!data) return { row: { ok: true, value: null }, pointer: { data: null, error: null } };
  const { active_organization_id: pointer, ...row } = data;
  return {
    row: { ok: true, value: row },
    pointer: { data: { active_organization_id: pointer ?? null }, error: null },
  };
}

/**
 * ONE request-scoped read of the caller's `profiles` row (Wagon 2 — nav
 * performance). Before this, every navigation ran three independent
 * `profiles` SELECTs with overlapping columns: the auth-shell layout, the
 * overview page and the premium-hub person block. `cache()` collapses them
 * into a single round-trip shared by all server components of the request.
 *
 * Request-scoped ONLY — this is deduplication, not data caching: a new
 * navigation always re-reads. (Do NOT add time-based caching here: role
 * switches and onboarding completion must be visible on the very next
 * request.) The supabase client itself is already `cache()`-wrapped and
 * memoizes `auth.getUser()`, so this adds no extra auth round-trip.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, profileRead: "ok" };

  // The ONE profiles-row read, shared with the bearer transports (G4). The
  // session shape keeps its existing honest degradation: a failed read
  // renders as "no profile", exactly as before the extraction.
  const read = await readProfileRow({ supabase, userId: user.id });

  return {
    user: { id: user.id, email: user.email },
    profile: read.ok ? read.value : null,
    profileRead: read.ok ? "ok" : "failed",
  };
});
