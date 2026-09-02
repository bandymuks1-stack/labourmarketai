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
  const { data, error } = await caller.supabase
    .from("profiles")
    .select(
      "id, full_name, email, locale, country, onboarded, onboarded_at, active_role",
    )
    .eq("id", caller.userId)
    .maybeSingle();
  if (error) return { ok: false };
  return { ok: true, value: (data as ProfileCoreRow | null) ?? null };
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
  if (!user) return { user: null, profile: null };

  // The ONE profiles-row read, shared with the bearer transports (G4). The
  // session shape keeps its existing honest degradation: a failed read
  // renders as "no profile", exactly as before the extraction.
  const read = await readProfileRow({ supabase, userId: user.id });

  return {
    user: { id: user.id, email: user.email },
    profile: read.ok ? read.value : null,
  };
});
