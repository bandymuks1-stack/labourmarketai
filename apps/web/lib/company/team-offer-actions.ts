"use server";

import { revalidatePath } from "next/cache";

import {
  handOffTeamOffer,
  listOfferableDemand,
  listOfferTerms,
  listSentOffers,
  offerNegotiationAvailable,
  offerTeamToDemand,
  proposeOfferTerms,
  respondToTeamOffer,
  withdrawTeamOffer,
} from "@/lib/company/team-offer";
import {
  normalizeTermsInput,
  type OfferTermsInput,
  type OfferTermsVersion,
  type OfferableDemand,
  type SentTeamOffer,
  type TeamOfferRefusal,
} from "@/lib/market/team-offer-model";

/**
 * Server actions for offering a team against a demand (E6). Thin: shape-check the
 * ids and hand off to the ONE composition in lib/company/team-offer.ts; the
 * database decides authority. Identity is never an argument - it is the session.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = (v: string | null | undefined) => v == null || v === "" || UUID.test(v);
const BAD: { status: TeamOfferRefusal } = { status: "error" };

export async function offerTeamToDemandAction(input: {
  teamId: string;
  requestId: string;
  note?: string | null;
  terms?: Partial<Record<keyof OfferTermsInput, unknown>> | null;
}) {
  if (!UUID.test(input.teamId) || !UUID.test(input.requestId)) return BAD;
  const result = await offerTeamToDemand({
    teamId: input.teamId,
    requestId: input.requestId,
    note: input.note?.trim().slice(0, 500) || null,
  });
  // The first terms version travels with a NEW offer. A refused terms write
  // never undoes the offer: the supplier can still propose them in the thread.
  const terms = input.terms ? normalizeTermsInput(input.terms) : null;
  if (result.status === "ok" && result.outcome === "created" && terms) {
    await proposeOfferTerms(result.offerId, terms);
  }
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export async function proposeOfferTermsAction(input: {
  offerId: string;
  terms: Partial<Record<keyof OfferTermsInput, unknown>>;
}) {
  if (!UUID.test(input.offerId)) return BAD;
  const terms = normalizeTermsInput(input.terms);
  if (!terms) return { status: "terms_empty" as const };
  const result = await proposeOfferTerms(input.offerId, terms);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export type OfferTermsData =
  | { status: "ok"; versions: readonly OfferTermsVersion[] }
  | { status: "needs_migration" | "unavailable" | "error" };

export async function loadOfferTermsAction(input: { offerId: string }): Promise<OfferTermsData> {
  if (!UUID.test(input.offerId)) return { status: "error" };
  const r = await listOfferTerms(input.offerId);
  return r.status === "ok" ? { status: "ok", versions: r.rows } : { status: r.status };
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

export async function loadTeamOfferPanelAction(input: {
  teamId: string;
  kind?: "team" | "organization";
}): Promise<TeamOfferPanelData> {
  if (!UUID.test(input.teamId)) return { status: "error" };
  // An organization offering itself needs 20261011200000; before it, the list
  // would honestly answer "no demand" for a non-team org — say "not yet" instead.
  if (input.kind === "organization" && !(await offerNegotiationAvailable())) return { status: "needs_migration" };
  const [demands, sent] = await Promise.all([listOfferableDemand(input.teamId), listSentOffers(input.teamId)]);
  if (demands.status === "needs_migration" || sent.status === "needs_migration") return { status: "needs_migration" };
  if (demands.status !== "ok" || sent.status !== "ok") return { status: "unavailable" };
  return { status: "ok", demands: demands.rows, sent: sent.rows };
}
