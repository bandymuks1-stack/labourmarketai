"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { insertProjectForCompany, rollbackCreatedProject } from "@/lib/projects/create-project-core";
import {
  confirmOfferTerms,
  handOffTeamOffer,
  listOwnCrews,
  loadOfferProgress,
  nameOfferUnit,
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
  answerableTerms,
  normalizeTermsInput,
  startWorkBlockers,
  type OfferProgress,
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

/** The terms version the person can answer right now (the same
 *  `answerableTerms` the offer card shows); null when there is none. */
export async function answerableTermsVersionAction(input: { offerId: string }): Promise<number | null> {
  const r = await loadOfferTermsAction(input);
  return r.status === "ok" ? (answerableTerms(r.versions)?.version ?? null) : null;
}

export async function withdrawTeamOfferAction(input: { offerId: string }) {
  if (!UUID.test(input.offerId)) return BAD;
  const result = await withdrawTeamOffer(input.offerId);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export async function respondToTeamOfferAction(input: {
  offerId: string;
  decision: "accept" | "decline";
  /** The terms version on the screen the person agreed to (null = none). */
  expectedVersion?: number | null;
}) {
  if (!UUID.test(input.offerId) || (input.decision !== "accept" && input.decision !== "decline")) return BAD;
  const v = input.expectedVersion;
  if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1)) return BAD;
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

// ── Company offer to work (owner decision 2026-11-22, item 2) ─────────────

export async function confirmOfferTermsAction(input: { offerId: string; expectedVersion: number }) {
  if (!UUID.test(input.offerId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) return BAD;
  const result = await confirmOfferTerms(input.offerId, input.expectedVersion);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export async function nameOfferUnitAction(input: { offerId: string; unitTeamOrgId: string }) {
  if (!UUID.test(input.offerId) || !UUID.test(input.unitTeamOrgId)) return BAD;
  const result = await nameOfferUnit(input.offerId, input.unitTeamOrgId);
  if (result.status === "ok") revalidatePath("/", "layout");
  return result;
}

export type OfferProgressData =
  | { status: "ok"; progress: OfferProgress; crews: readonly { id: string; name: string }[] }
  | { status: "needs_migration" | "unavailable" | "error" };

/** Where the offer stands; for the supplier also the crews it may name. */
export async function loadOfferProgressAction(input: { offerId: string }): Promise<OfferProgressData> {
  if (!UUID.test(input.offerId)) return { status: "error" };
  const r = await loadOfferProgress(input.offerId);
  if (r.status !== "ok") return { status: r.status };
  const progress = r.rows[0];
  if (!progress) return { status: "unavailable" };
  const crews =
    progress.mySide === "supplier" && progress.offerKind === "organization"
      ? await listOwnCrews().then((c) => (c.status === "ok" ? c.rows : []))
      : [];
  return { status: "ok", progress, crews };
}

export type StartWorkResult =
  | { status: "ok"; projectId: string }
  | { status: TeamOfferRefusal | "invalid_title" | "no_company" | "project_not_created" };

/**
 * The client starts the work: ONE new project of its own (the same create
 * core and the same manage-projects gate as the projects page), then the
 * existing hand-off puts the supplier's crew on it. If the hand-off is
 * refused, the just-created empty project is removed again, so a refusal
 * never leaves a stray project behind.
 */
export async function startWorkFromOfferAction(input: { offerId: string; title: string }): Promise<StartWorkResult> {
  if (!UUID.test(input.offerId)) return BAD;
  const title = String(input.title ?? "").trim();
  const before = await loadOfferProgress(input.offerId);
  if (before.status === "ok" && before.rows[0]) {
    const blockers = startWorkBlockers(before.rows[0]);
    if (blockers.length > 0) return { status: blockers[0]! };
    if (before.rows[0].status !== "accepted") return { status: "offer_not_accepted" };
  }
  const company = await requireEmployerCompany();
  if (!company.ok) return { status: "no_company" };
  if (!hasOrganizationCapability(company.role, "manage-projects")) return { status: "not_authorized" };
  const supabase = await createClient();
  const created = await insertProjectForCompany(supabase, company.companyId, { title, city: null });
  if (!created.ok) return { status: created.reason === "invalid_title" ? "invalid_title" : "project_not_created" };
  const handed = await handOffTeamOffer({ offerId: input.offerId, projectId: created.id });
  if (handed.status !== "ok") {
    await rollbackCreatedProject(supabase, created.id);
    return { status: handed.status };
  }
  revalidatePath("/", "layout");
  return { status: "ok", projectId: created.id };
}
