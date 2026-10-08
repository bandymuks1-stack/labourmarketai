"use server";

import { revalidatePath } from "next/cache";

import {
  handOffTeamOffer,
  listOfferableDemand,
  listSentOffers,
  offerTeamToDemand,
  respondToTeamOffer,
  withdrawTeamOffer,
} from "@/lib/company/team-offer";
import type { OfferableDemand, SentTeamOffer, TeamOfferRefusal } from "@/lib/market/team-offer-model";

/**
 * Server actions for offering a team against a demand (E6). Thin: shape-check the
 * ids and hand off to the ONE composition in lib/company/team-offer.ts; the
 * database decides authority. Identity is never an argument - it is the session.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = (v: string | null | undefined) => v == null || v === "" || UUID.test(v);
const BAD: { status: TeamOfferRefusal } = { status: "error" };

export async function offerTeamToDemandAction(input: { teamId: string; requestId: string; note?: string | null }) {
  if (!UUID.test(input.teamId) || !UUID.test(input.requestId)) return BAD;
  const result = await offerTeamToDemand({
    teamId: input.teamId,
    requestId: input.requestId,
    note: input.note?.trim().slice(0, 500) || null,
  });
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export async function withdrawTeamOfferAction(input: { offerId: string }) {
  if (!UUID.test(input.offerId)) return BAD;
  const result = await withdrawTeamOffer(input.offerId);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export async function respondToTeamOfferAction(input: { offerId: string; decision: "accept" | "decline" }) {
  if (!UUID.test(input.offerId) || (input.decision !== "accept" && input.decision !== "decline")) return BAD;
  const result = await respondToTeamOffer(input);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export async function handOffTeamOfferAction(input: {
  offerId: string;
  projectId: string;
  workObjectId?: string | null;
  taskId?: string | null;
}) {
  if (!UUID.test(input.offerId) || !UUID.test(input.projectId)) return BAD;
  if (!optionalId(input.workObjectId) || !optionalId(input.taskId)) return BAD;
  const result = await handOffTeamOffer({
    offerId: input.offerId,
    projectId: input.projectId,
    workObjectId: input.workObjectId || null,
    taskId: input.taskId || null,
  });
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

/**
 * The offering control opens lazily (a folded section), so the open demand and
 * the team's own offers are read when the manager asks for them, not on every
 * render of the people page. Both reads are database-gated to the team's manager.
 */
export type TeamOfferPanelData =
  | { status: "ok"; demands: readonly OfferableDemand[]; sent: readonly SentTeamOffer[] }
  | { status: "needs_migration" | "unavailable" | "error" };

export async function loadTeamOfferPanelAction(input: { teamId: string }): Promise<TeamOfferPanelData> {
  if (!UUID.test(input.teamId)) return { status: "error" };
  const [demands, sent] = await Promise.all([listOfferableDemand(input.teamId), listSentOffers(input.teamId)]);
  if (demands.status === "needs_migration" || sent.status === "needs_migration") return { status: "needs_migration" };
  if (demands.status !== "ok" || sent.status !== "ok") return { status: "unavailable" };
  return { status: "ok", demands: demands.rows, sent: sent.rows };
}
