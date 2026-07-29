import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { payText } from "@/components/app/opportunity-structured-detail";
import { loadWorkerOpportunityBoard } from "@/lib/marketplace/worker-opportunities";
import { resolveInterestLabels } from "@/lib/opportunities/interest-labels";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import {
  CONTEXT_RECOMMENDATION_LIMIT,
  type ContextAction,
  type ContextFact,
  type ContextHistoryEntry,
  type ContextRecommendation,
  type ContextRelated,
  type ContextRequirement,
  type EntityContextResult,
  type EntityContextView,
} from "./entity-context";
import { deriveJobContextModel, type JobContextModel } from "./job-context-model";

/**
 * `job` entity → Context Panel, server half (W3).
 *
 * WHERE THE FACTS COME FROM. `loadWorkerOpportunityBoard` — the ONE canonical
 * marketplace use case. This module runs no query, names no table, calls no
 * RPC and ranks nothing: it asks the use case for the caller's authorized
 * board, picks the ONE demand the person selected, and localizes it. A demand
 * that is not in that board simply cannot be opened, which is the authorization
 * rule doing its job rather than a check bolted on here.
 *
 * WHY THE WHOLE BOARD FOR ONE ROW. Because the board read is the only
 * authorized path to a demand, and it is request-cached one layer down — the
 * panel therefore costs nothing extra on a page that already listed matches.
 * A dedicated "one demand" query would be a second read path to the same rows,
 * with its own visibility rules to get wrong. That is the trade this makes on
 * purpose.
 *
 * HONESTY. Every section may be empty and empty means unknown. The pay line,
 * the structured detail and the required tools are all absent until the company
 * actually stated them; the panel says "not stated" instead of inventing a
 * default. No score, no percentage, no generated prose, no LLM.
 */

/** The surface this read belongs to. The panel is part of the ONE workspace the
 *  conversation lives in — not a fifth marketplace surface. */
const PANEL_SURFACE = "conversation" as const;

export async function resolveJobContext(requestId: string): Promise<EntityContextResult> {
  const tPanel = await getTranslations("workspace.panel");

  const board = await loadWorkerOpportunityBoard(PANEL_SURFACE);
  if (board.kind !== "ready") {
    return { kind: "unavailable", reason: tPanel("unavailableNoWorker") };
  }
  if (!board.capabilities.boardAvailable) {
    // Without the gated visibility RPC there is no demand data at all — saying
    // "not found" would blame the person for a capability that is switched off.
    return { kind: "unavailable", reason: tPanel("unavailableNoAccess") };
  }

  const card = board.opportunities.find((c) => c.need.id === requestId);
  if (!card) {
    return { kind: "unavailable", reason: tPanel("unavailableGone") };
  }

  const model = deriveJobContextModel(card);
  const view = await localizeJobContext(model, board.capabilities.interestAvailable);
  return { kind: "context", view };
}

async function localizeJobContext(
  model: JobContextModel,
  interestAvailable: boolean,
): Promise<EntityContextView> {
  const locale = await getLocale();
  const [t, tlm, tSkill, tsd, tPanel] = await Promise.all([
    getTranslations("opportunities"),
    getTranslations("labourMarket"),
    getTranslations("skillNames"),
    getTranslations("structuredDemand"),
    getTranslations("workspace.panel"),
  ]);

  const workLabels = buildWorkTypeLabelMap(locale);
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const roleLabel = model.roleSlug
    ? (workLabels[model.roleSlug] ?? t("fieldRoleUnknown"))
    : t("fieldRoleUnknown");
  const countryLabel =
    model.country && tlm.has(`countryNames.${model.country}`)
      ? (tlm(`countryNames.${model.country}`) as string)
      : model.country;

  // The SAME translator closures the opportunities board passes to the
  // structured-detail components — one pay rendering rule, one enum catalogue.
  const ts = (key: string, values?: Record<string, string | number>) =>
    t(`structured.${key}` as never, values as never) as string;
  const sd = (key: string, values?: Record<string, string | number>) =>
    tsd(key as never, values as never) as string;

  const notStated = tPanel("notStated");
  const fact = (label: string, value: string | null): ContextFact =>
    value ? { label, value } : { label, value: notStated, unknown: true };

  // ── title / description ──────────────────────────────────────────────────
  // The title is the company when the route is approved (that name is the RPC's
  // safe column), otherwise the role. Never an invented employer.
  const title = model.companyName ?? roleLabel;

  // ── facts: salary + schedule + place, in the lock's order ────────────────
  const pay = payText(model.structured?.compensation, ts, sd);
  const facts: ContextFact[] = [
    fact(t("fieldCompany"), model.companyName),
    fact(tPanel("fieldRole"), model.roleSlug ? roleLabel : null),
    fact(tPanel("fieldPay"), pay),
    fact(t("fieldStart"), model.startPeriod),
    // The demand's PLACE, not its country: the board's coarse location label
    // (a city or region) is preferred, and the country is the fallback. It
    // therefore cannot carry the "Country" caption — a city under a country
    // label is a small lie that a reader has no way to detect.
    fact(tPanel("fieldLocation"), model.locationLabel ?? countryLabel ?? null),
    fact(t("fieldTeam"), model.teamSize !== null ? String(model.teamSize) : null),
    fact(
      t("fieldAccommodation"),
      model.accommodation && t.has(`accommodation.${model.accommodation}`)
        ? (t(`accommodation.${model.accommodation}` as never) as string)
        : model.accommodation,
    ),
    fact(
      t("fieldTransport"),
      model.transport && t.has(`transport.${model.transport}`)
        ? (t(`transport.${model.transport}` as never) as string)
        : model.transport,
    ),
  ];

  // ── requirements: what the demand needs, and whether the person has it ───
  // Straight from the engine's fit basis — matched and missing, never a score.
  const requirements: ContextRequirement[] = [
    ...model.matchedSkillSlugs.map((slug) => ({ label: skillLabel(slug), met: true })),
    ...model.missingSkillSlugs.map((slug) => ({ label: skillLabel(slug), met: false })),
  ];
  // Required tools are a separate closed-taxonomy list; they are stated
  // requirements too, and the person cannot see them anywhere else in the
  // workspace.
  for (const slug of model.requiredTools) {
    requirements.push({ label: skillLabel(slug), met: false });
  }

  // ── history: only real, dated events ─────────────────────────────────────
  // The demand's own publication date is not exposed to workers by the gated
  // RPC, so the honest history is what the PERSON did: their interest signal.
  // No row ⇒ no history, never a fabricated timeline.
  const history: ContextHistoryEntry[] = [];
  if (model.interestStatus) {
    history.push({
      text: tPanel(`historyInterest.${model.interestStatus}` as never) as string,
      at: null,
    });
  }
  if (model.saved) {
    history.push({ text: tPanel("historySaved"), at: null });
  }

  // ── related objects ──────────────────────────────────────────────────────
  // Related entities are named ONLY when the panel can actually open them. The
  // company behind a demand has no worker-visible entity id today (the RPC
  // exposes a safe NAME, not an organization row), so it is listed without a
  // ref rather than linked to something the person may not open.
  const related: ContextRelated[] = [];
  if (model.companyName) {
    related.push({ label: model.companyName, ref: null });
  }

  // ── recommendations: deterministic, each with its basis ──────────────────
  const recommendations: ContextRecommendation[] = [];
  for (const rec of model.recommendations) {
    if (rec.code === "close_missing_skills") {
      const names = rec.slugs.map(skillLabel).join(", ");
      recommendations.push({
        text: tPanel("recMissingSkills", { count: model.missingSkillSlugs.length, skills: names }),
        basis: tPanel("recMissingSkillsBasis"),
        // The journal is how a skill becomes real on this platform — so the
        // action is the EXISTING work-log chip, not a self-declaration form.
        chipId: "logwork",
      });
    } else if (rec.code === "interest_pending") {
      recommendations.push({
        text: tPanel("recInterestPending"),
        basis: tPanel("recInterestPendingBasis"),
        chipId: null,
      });
    } else {
      recommendations.push({
        text: tPanel(`recNextAction.${rec.action}` as never) as string,
        basis: tPanel("recNextActionBasis"),
        chipId: rec.action === "add_work_evidence" ? "logwork" : "profile",
      });
    }
  }

  // ── available actions ────────────────────────────────────────────────────
  const actions: ContextAction[] = [];
  if (interestAvailable) {
    actions.push({
      kind: "express_interest",
      requestId: model.requestId,
      initialStatus: model.interestStatus,
      labels: await resolveInterestLabels(),
    });
  }

  const basisLine = model.basis
    ? (t("skillMatch.basis", {
        matched: model.basis.matched,
        total: model.basis.total,
        confirmed: model.basis.confirmed,
      }) as string)
    : null;

  return {
    ref: { type: "job", id: model.requestId },
    title,
    // Keyed on the RPC's real route status, exactly like the board's badge —
    // an unverified company simply gets no badge, never a softer wording.
    badge: model.verifiedRoute ? (t("companyVerified") as string) : null,
    // The §19 basis line IS the description of this match — the same sentence
    // every other marketplace surface renders for the same demand.
    description: basisLine,
    facts,
    // Contact never happens off-platform (`platform_workflow_only`): the panel
    // states that instead of showing contact details it must not have.
    contactNote: tPanel("contactNote"),
    requirements,
    history,
    related,
    recommendations: recommendations.slice(0, CONTEXT_RECOMMENDATION_LIMIT),
    actions,
  };
}
