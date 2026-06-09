import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import {
  WorkerPlayerCard,
  type PlayerCardLabels,
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

  const labels: PlayerCardLabels = {
    title: t("title"),
    subtitle: t("subtitle"),
    skillsLabel: t("skillsLabel"),
    skillsHint: t("skillsHint"),
    evidenceLabel: t("evidenceLabel"),
    evidenceHint: t("evidenceHint"),
    attentionLabel: t("attentionLabel"),
    attentionHint: t("attentionHint"),
    attentionZero: t("attentionZero"),
    workCardLabel: t("workCardLabel"),
    workCardConfirmed: t("workCardConfirmed"),
    workCardPending: t("workCardPending"),
    namePlaceholder: t("namePlaceholder"),
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageIntro")}</p>
      </header>
      <WorkerPlayerCard card={card} labels={labels} />
    </div>
  );
}
