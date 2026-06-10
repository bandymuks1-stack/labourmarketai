import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { getOwnThermometer } from "@/lib/market/thermometer-data";
import {
  WorkerPlayerCard,
  type PlayerCardLabels,
  type ThermometerView,
} from "@/components/app/worker-player-card";

export const dynamic = "force-dynamic";

/**
 * "Mano kortelė" — the worker-first player-card (slice worker-player-card-v1).
 * A calm, private summary of the worker's own real dimensions. No fabrication.
 */
export default async function PlayerCardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("playerCard");

  const card = await getWorkerPlayerCard();
  if (!card) redirect(`/${locale}/auth/login`);

  // Thermometer (S4): a score ONLY when both formula components exist;
  // otherwise the honest missing state — null for non-worker accounts.
  const thermo = await getOwnThermometer();
  const thermometer: ThermometerView | null = thermo
    ? thermo.result.kind === "score"
      ? {
          kind: "score",
          scoreEur: thermo.result.scoreEur,
          smallSample: thermo.smallSample,
        }
      : { kind: "insufficient_data", missing: thermo.result.missing }
    : null;

  const labels: PlayerCardLabels = {
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
    thermoLabel: t("thermoLabel"),
    thermoHint: t("thermoHint"),
    thermoMissingPosition: t("thermoMissingPosition"),
    thermoMissingMarket: t("thermoMissingMarket"),
    thermoMissingBoth: t("thermoMissingBoth"),
    thermoSmallSample: t("thermoSmallSample"),
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageIntro")}</p>
      </header>
      <WorkerPlayerCard card={card} labels={labels} thermometer={thermometer} />
    </div>
  );
}
