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
  };
}
