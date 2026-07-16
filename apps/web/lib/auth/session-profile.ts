import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

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

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, active_role, onboarded_at, country")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user: { id: user.id, email: user.email },
    profile: (data as SessionProfileRow | null) ?? null,
  };
});
