import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import type { PlayerCardLabels } from "@/components/app/worker-player-card";

/**
 * One place that turns the player-card's REAL data into resolved viewer-locale
 * labels (doctrine §2: slug → JSON, nothing user-facing hardcoded). Shared by
 * every mount of the card (dashboard today screen + /dashboard/player-card) —
 * zero duplication (DESIGN_SOUL §1).
 */
export async function buildPlayerCardLabels(
  card: WorkerPlayerCard,
): Promise<PlayerCardLabels> {
  const locale = await getLocale();
  const t = await getTranslations("playerCard");
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const tWorkCard = await getTranslations("auth.dashboard.workCard");
  // Country names come from the ONE canonical country catalogue the rest of
  // the product reads (never a second list).
  const tlm = await getTranslations("labourMarket");

  const availabilityKey = card.availabilityStatus
    ? `editor.availabilityOption.${card.availabilityStatus}`
    : null;

  return {
    title: t("title"),
    subtitle: t("subtitle"),
    skillsLabel: t("skillsLabel"),
    skillsHint: t("skillsHint"),
    candidateLabel: t("candidateLabel"),
    candidateHint: t("candidateHint"),
    evidenceLabel: t("evidenceLabel"),
    evidenceHint: t("evidenceHint"),
    attentionLabel: t("attentionLabel"),
    attentionHint: t("attentionHint"),
    attentionZero: t("attentionZero"),
    workCardLabel: t("workCardLabel"),
    workCardConfirmed: t("workCardConfirmed"),
    workCardPending: t("workCardPending"),
    namePlaceholder: t("namePlaceholder"),
    professionName:
      card.professionSlug && tProf.has(card.professionSlug)
        ? tProf(card.professionSlug)
        : null,
    availabilityLabel:
      availabilityKey && tWorkCard.has(availabilityKey)
        ? tWorkCard(availabilityKey)
        : null,
    availabilityFrom: card.availableFrom
      ? t("availabilityFrom", {
          date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
            new Date(card.availableFrom),
          ),
        })
      : null,
    // §5.2 LOCATION — the country NAME for the worker's own stated code.
    // An unknown code renders the raw code rather than a guessed country.
    locationName: card.locationCountry
      ? tlm.has(`countryNames.${card.locationCountry}`)
        ? (tlm(`countryNames.${card.locationCountry}`) as string)
        : card.locationCountry
      : null,
    // §5.2 DOCUMENTS — real counts only; absent when the surface is not
    // available for this account (the card then shows no documents block).
    documentsLabel: card.documents ? t("documentsLabel") : null,
    // A ZERO is stated in words, never rendered as a bare "0 valid" tile —
    // the same rule the reputation block follows. (Premium self-check on the
    // production card: "0 galiojantys" read as a verdict, not as an absence.)
    documentsValue: card.documents
      ? card.documents.total === 0
        ? t("documentsEmpty")
        : card.documents.expiring > 0
          ? t("documentsValueExpiring", {
              valid: card.documents.total,
              expiring: card.documents.expiring,
            })
          : t("documentsValue", { valid: card.documents.total })
      : null,
    // §5.2 REPUTATION — what other people really confirmed. No universal
    // score, no medal tier: a count of real confirmations, or the honest
    // "nothing confirmed yet" line.
    reputationLabel: t("reputationLabel"),
    reputationValue:
      card.managerConfirmations > 0
        ? t("reputationValue", { count: card.managerConfirmations })
        : null,
    reputationEmpty: t("reputationEmpty"),
    reputationHint: t("reputationHint"),
    workHistoryLabel: t("workHistoryLabel"),
    workHistoryUnnamed: t("workHistoryUnnamed"),
    workHistoryCurrent: t("workHistoryCurrent"),
    verifiedTitle: t("verifiedTitle"),
    verifiedEmpty: t("verifiedEmpty"),
    journalSupportedLabel: t("journalSupportedLabel"),
    journalSupportedHint: t("journalSupportedHint"),
    verifiedSkillNames: card.verifiedSkills.map((s) =>
      tSkill.has(s.slug) ? tSkill(s.slug) : s.slug.replace(/-/g, " "),
    ),
    latestEvidenceLabel: t("latestEvidenceLabel"),
    latestEvidenceValue: card.latestEvidenceAt
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(card.latestEvidenceAt),
        )
      : null,
    latestEvidenceEmpty: t("latestEvidenceEmpty"),
    thermoLabel: t("thermoLabel"),
    thermoHint: t("thermoHint"),
    thermoMissingPosition: t("thermoMissingPosition"),
    thermoMissingMarket: t("thermoMissingMarket"),
    thermoMissingBoth: t("thermoMissingBoth"),
    thermoSmallSample: t("thermoSmallSample"),
    readiness: {
      label: t("readiness.label"),
      hint: t("readiness.hint"),
      levelReady: t("readiness.levelReady"),
      levelBuilding: t("readiness.levelBuilding"),
      levelStart: t("readiness.levelStart"),
      signalsTemplate: t("readiness.signalsTemplate"),
      nextLabel: t("readiness.nextLabel"),
      pillars: {
        profession: t("readiness.pillars.profession"),
        availability: t("readiness.pillars.availability"),
        skills: t("readiness.pillars.skills"),
        journal: t("readiness.pillars.journal"),
        evidence: t("readiness.pillars.evidence"),
        workCard: t("readiness.pillars.workCard"),
      },
    },
  };
}
