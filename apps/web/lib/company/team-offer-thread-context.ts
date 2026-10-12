import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * WHICH OFFER A B2B THREAD WAS OPENED FOR. One direct thread per pair stays
 * the rule (the shared dedupe), so every offer between two companies' people
 * lands in the same conversation; the route from an offer carries its id and
 * the thread names it. Read through the SAME party-gated RPC that opened the
 * thread (`team_offer_thread_party_v1`, 20261012110000): a non-party gets zero
 * rows, so a hand-crafted `?offer=` shows nothing.
 */
const OFFER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readTeamOfferThreadContext(
  offerId: string | undefined,
): Promise<{ subject: string | null; status: string } | null> {
  if (!offerId || !OFFER_UUID.test(offerId)) return null;
  const supabase = (await createClient()) as SupabaseClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("team_offer_thread_party_v1", { p_offer_id: offerId });
  if (error) return null;
  const row = ((data ?? []) as { offer_status: string; subject: string | null }[])[0];
  return row ? { subject: row.subject?.trim() || null, status: row.offer_status } : null;
}
