import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import {
  getOwnThermometer,
  toThermometerView,
} from "@/lib/market/thermometer-data";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { WorkerReadinessPanel } from "@/components/app/worker-readiness-panel";
import { AvatarDisplay } from "@/components/app/avatar-display";
import { getOwnAvatar } from "@/lib/profile/avatar";

export const dynamic = "force-dynamic";

/**
 * "Mano kortelė" — the worker-first player-card (slice worker-player-card-v1,
 * premium scouting re-skin in TASK 07 slice design-soul-scouting-ui-v1).
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

  const labels = await buildPlayerCardLabels(card);
  const avatar = await getOwnAvatar();
  // Thermometer (S4): a score ONLY when both formula components exist;
  // otherwise the honest missing state — null for non-worker accounts.
  const thermometer = toThermometerView(await getOwnThermometer());

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-center gap-4">
        <AvatarDisplay
          signedUrl={avatar.signedUrl}
          displayName={card.displayName ?? t("pageTitle")}
          alt={card.displayName ?? t("pageTitle")}
          size="lg"
        />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("pageTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">{t("pageIntro")}</p>
        </div>
      </header>
      <WorkerPlayerCard card={card} labels={labels} thermometer={thermometer} />
      <WorkerReadinessPanel card={card} />
    </div>
  );
}
