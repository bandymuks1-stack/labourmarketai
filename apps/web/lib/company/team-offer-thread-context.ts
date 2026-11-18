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

/**
 * WHICH OFFER EACH MESSAGE IS ABOUT (20261012180000). The thread stays one per
 * pair; a message may carry `team_offer_id`, accepted by the database only when
 * its author is a party and the other side is in the thread. What that offer is
 * (the brigade / organization name, its status) is read through the SAME
 * party-gated RPC, once per distinct offer: a participant who is not a party
 * of an offer sees no label for it. Bounded: at most 20 distinct offers.
 */
export async function readTeamOfferMessageLabels(
  offerIds: readonly (string | null | undefined)[],
): Promise<ReadonlyMap<string, { subject: string | null; status: string }>> {
  const ids = [...new Set(offerIds.filter((v): v is string => typeof v === "string" && OFFER_UUID.test(v)))].slice(0, 20);
  const out = new Map<string, { subject: string | null; status: string }>();
  await Promise.all(
    ids.map(async (id) => {
      const ctx = await readTeamOfferThreadContext(id);
      if (ctx) out.set(id, ctx);
    }),
  );
  return out;
}
