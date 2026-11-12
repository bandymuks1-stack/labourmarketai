import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMissingTableCode } from "@/lib/agency/clients-model";
import {
  HOME_PINS_KEY,
  readHomePins,
  type HomePinContext,
  type HomePins,
} from "@/lib/home/home-pins";

/**
 * Home pins — the server read/write over the EXISTING per-user store
 * `dashboard_preferences` (migration 20260714211000: owner-only RLS on
 * `profile_id = auth.uid()`, one row per (profile, context), ids-only jsonb).
 *
 * That migration is in the repository but is NOT applied to production
 * (owner-gated). Until it is, every call here answers `unavailable` and the
 * home keeps the choice on the device, saying so — never an error, never a
 * pretended sync.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (supabase: SupabaseClient): any => supabase;

export type HomePinsRead =
  /** The store answered; `pins` is null when the person never chose. */
  | { readonly status: "profile"; readonly pins: HomePins | null }
  /** The store is not applied yet — the device keeps the choice. */
  | { readonly status: "device" }
  /** The read failed — say so; never render it as "nothing pinned". */
  | { readonly status: "failed" };

export async function loadHomePins(context: HomePinContext): Promise<HomePinsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "failed" };
  const { data, error } = await asAny(supabase)
    .from("dashboard_preferences")
    .select("preferences")
    .eq("profile_id", user.id)
    .eq("context", context)
    .maybeSingle();
  if (error) {
    return isMissingTableCode(error.code) ? { status: "device" } : { status: "failed" };
  }
  return { status: "profile", pins: readHomePins(data?.preferences, context) };
}

export type HomePinsWrite = "saved" | "device" | "failed";

export async function writeHomePins(
  context: HomePinContext,
  pins: HomePins,
): Promise<HomePinsWrite> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "failed";
  const table = () => asAny(supabase).from("dashboard_preferences");
  // Keep whatever else the row holds: this feature owns one key.
  const existing = await table()
    .select("preferences")
    .eq("profile_id", user.id)
    .eq("context", context)
    .maybeSingle();
  if (existing.error) {
    return isMissingTableCode(existing.error.code) ? "device" : "failed";
  }
  const current =
    existing.data?.preferences && typeof existing.data.preferences === "object"
      ? (existing.data.preferences as Record<string, unknown>)
      : {};
  const { error } = await table().upsert(
    {
      profile_id: user.id,
      context,
      preferences: { ...current, [HOME_PINS_KEY]: { pins: pins.pins, recent: pins.recent } },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,context" },
  );
  if (error) return isMissingTableCode(error.code) ? "device" : "failed";
  return "saved";
}
