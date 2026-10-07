import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import type { MatchNeed } from "./match-v1";
import { matchTeamToNeed } from "./match-team-v1";
import {
  offerToTeamMatchInput,
  summarizeTeamMatch,
  type OfferMatchView,
  offerRefusalOf,
  parseHandOffResult,
  parseOfferResult,
  parseOfferableDemand,
  parseReceivedOffer,
  parseSentOffer,
  type OfferWriteOutcome,
  type OfferableDemand,
  type ReceivedTeamOffer,
  type SentTeamOffer,
  type TeamOfferRefusal,
} from "./team-offer-model";

/**
 * OFFER A TEAM / BRIGADE AGAINST ONE DEMAND (owner decision E6, DEM-6 / WRK-6).
 *
 * Thin by design: every rule - who may offer, which demand is offerable, who may
 * answer, who may assign, and what the receiving side may see - lives in the
 * SECURITY DEFINER RPCs of migration 20261007150000. This module only carries the
 * caller's own RLS-scoped session to them and shapes the answers.
 *
 *   offer_team_to_demand_v1            brigade manager  -> one OPEN offer per (team, demand)
 *   list_team_offers_for_request_v1    demand receiver  -> team-level aggregates, NO member identity
 *   respond_team_demand_offer_v1       demand receiver  -> accept / decline
 *   hand_off_team_demand_offer_v1      demand receiver  -> ONE team_assignments row on its own project
 *
 * Nothing here writes a table directly and nothing here reads a member.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type TeamOfferWriteResult<T = Record<string, never>> =
  | ({ readonly status: "ok" } & T)
  | { readonly status: TeamOfferRefusal };

export type ReadResult<T> =
  | { readonly status: "ok"; readonly rows: readonly T[] }
  | { readonly status: "needs_migration" }
  | { readonly status: "unavailable" };

const MISSING = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST205"]);

async function authed(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

async function readRows<T>(
  rpc: string,
  args: Record<string, unknown>,
  parse: (raw: unknown) => T | null,
): Promise<ReadResult<T>> {
  try {
    const ctx = await authed();
    if (!ctx) return { status: "unavailable" };
    const { data, error } = await asAny(ctx.supabase).rpc(rpc, args);
    if (error) {
      return error.code && MISSING.has(error.code) ? { status: "needs_migration" } : { status: "unavailable" };
    }
    const rows = (Array.isArray(data) ? data : []).flatMap((r: unknown) => {
      const p = parse(r);
      return p ? [p] : [];
    });
    return { status: "ok", rows };
  } catch (error) {
    console.error(`[team-offer] ${rpc} failed:`, error);
    return { status: "unavailable" };
  }
}

/** Open demand the manager of `teamId` may offer against (worker-board whitelist). */
export function listOfferableDemand(teamId: string): Promise<ReadResult<OfferableDemand>> {
  return readRows("list_open_demand_for_team_offer_v1", { p_team_org_id: teamId }, parseOfferableDemand);
}

/** The offering side's own offers for one team. */
export function listSentOffers(teamId: string): Promise<ReadResult<SentTeamOffer>> {
  return readRows("list_team_demand_offers_for_team_v1", { p_team_org_id: teamId }, parseSentOffer);
}

/**
 * The RECEIVING side: team-level aggregates for one demand the caller owns.
 * Zero rows for anyone else (the database answers empty, never an error).
 */
export function listReceivedOffers(requestId: string): Promise<ReadResult<ReceivedTeamOffer>> {
  return readRows("list_team_offers_for_request_v1", { p_request_id: requestId }, parseReceivedOffer);
}

/**
 * The employer-side section: each offer joined with how the offered team fits THIS
 * need. `matchTeamToNeed` is called WITHOUT member subjects, so it runs on the
 * `team_aggregate` basis and per-member eligibility stays unknown by construction.
 * `need` null (the demand is not structured) -> the offers still show, unmatched.
 */
export async function loadTeamOffersForDemand(
  requestId: string,
  need: MatchNeed | null,
): Promise<{ readonly offers: readonly { offer: ReceivedTeamOffer; match: OfferMatchView | null }[] } | null> {
  const res = await listReceivedOffers(requestId);
  if (res.status !== "ok") return null;
  return {
    offers: res.rows.map((offer) => ({
      offer,
      match: need ? summarizeTeamMatch(matchTeamToNeed(need, offerToTeamMatchInput(offer))) : null,
    })),
  };
}

export async function offerTeamToDemand(input: {
  readonly teamId: string;
  readonly requestId: string;
  readonly note?: string | null;
}): Promise<TeamOfferWriteResult<{ outcome: OfferWriteOutcome; offerId: string }>> {
  const ctx = await authed();
  if (!ctx) return { status: "not_authed" };
  const { data, error } = await asAny(ctx.supabase).rpc("offer_team_to_demand_v1", {
    p_team_org_id: input.teamId,
    p_request_id: input.requestId,
    p_note: input.note ?? null,
  });
  if (error) return { status: offerRefusalOf(error) };
  const parsed = parseOfferResult(data);
  return parsed ? { status: "ok", ...parsed } : { status: "error" };
}

export async function withdrawTeamOffer(
  offerId: string,
): Promise<TeamOfferWriteResult<{ outcome: "withdrawn" | "already_withdrawn" }>> {
  const ctx = await authed();
  if (!ctx) return { status: "not_authed" };
  const { data, error } = await asAny(ctx.supabase).rpc("withdraw_team_demand_offer_v1", { p_offer_id: offerId });
  if (error) return { status: offerRefusalOf(error) };
  return { status: "ok", outcome: data === "already_withdrawn" ? "already_withdrawn" : "withdrawn" };
}

export async function respondToTeamOffer(input: {
  readonly offerId: string;
  readonly decision: "accept" | "decline";
}): Promise<TeamOfferWriteResult<{ outcome: "accepted" | "declined" | "already_accepted" | "already_declined" }>> {
  const ctx = await authed();
  if (!ctx) return { status: "not_authed" };
  const { data, error } = await asAny(ctx.supabase).rpc("respond_team_demand_offer_v1", {
    p_offer_id: input.offerId,
    p_decision: input.decision,
  });
  if (error) return { status: offerRefusalOf(error) };
  if (data === "accepted" || data === "declined" || data === "already_accepted" || data === "already_declined") {
    return { status: "ok", outcome: data };
  }
  return { status: "error" };
}

export async function handOffTeamOffer(input: {
  readonly offerId: string;
  readonly projectId: string;
  readonly workObjectId?: string | null;
  readonly taskId?: string | null;
}): Promise<TeamOfferWriteResult<{ outcome: "created" | "already_assigned"; assignmentId: string }>> {
  const ctx = await authed();
  if (!ctx) return { status: "not_authed" };
  const { data, error } = await asAny(ctx.supabase).rpc("hand_off_team_demand_offer_v1", {
    p_offer_id: input.offerId,
    p_project_id: input.projectId,
    p_work_object_id: input.workObjectId ?? null,
    p_task_id: input.taskId ?? null,
  });
  if (error) return { status: offerRefusalOf(error) };
  const parsed = parseHandOffResult(data);
  return parsed ? { status: "ok", ...parsed } : { status: "error" };
}
