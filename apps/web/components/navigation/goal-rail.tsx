import { getTranslations } from "next-intl/server";

import { AreaSwitcher } from "@/components/app/area-switcher";
import {
  PUBLIC_INTENTS,
  goalHref,
  type PublicIntent,
  type PublicIntentIconKey,
  type PublicIntentId,
} from "@/lib/navigation/public-intents";
import type { WorkAreaIconKey } from "@/lib/navigation/work-area-icon-key";

/**
 * THE NAVIGATION RAILS — one system, three levels (owner concept 2026-11-12),
 * all drawn by the ONE card rail (`components/app/area-switcher.tsx`: cards
 * with light depth, arrows, ← →, swipe, Tab; no rotation or transitions under
 * prefers-reduced-motion; fixed track height, so nothing shifts on load).
 *
 *   level 1  <GoalRail>          the six goals; a card opens the goal's view
 *   level 2  <GoalFunctionRail>  only that goal's functions; a card opens the
 *                                function itself
 *   level 3  catalogues          e.g. <ProfessionCarousel> on the goal's view
 *
 * Server components that hand the rail plain strings; safe on public pages
 * and in the signed-in app (Lane A2 reuses them and the rail directly).
 * The lists live in `lib/navigation/public-intents.ts`.
 */

const INTENT_AREA_ICON: Record<PublicIntentIconKey, WorkAreaIconKey> = {
  briefcase: "briefcase",
  userSearch: "userSearch",
  wrench: "wrench",
  fileSignature: "fileSignature",
  handshake: "handshake",
  building: "building",
};

async function railLabels() {
  const t = await getTranslations("common.nav");
  return { prevLabel: t("previous"), nextLabel: t("next"), hereLabel: t("youAreHere") };
}

/** LEVEL 1 — the six goals. On a wide track all six show at once; on a phone
 *  the rail swipes with the next card peeking. On a goal's own view the rail
 *  marks that goal (the level indicator). */
export async function GoalRail({ title }: { title?: string }) {
  const [t, labels] = await Promise.all([getTranslations("siteNav"), railLabels()]);
  return (
    <AreaSwitcher
      title={title ?? t("start.choose")}
      testId="goal-rail"
      fitAll
      {...labels}
      items={PUBLIC_INTENTS.map((intent) => ({
        id: intent.id,
        href: goalHref(intent.id),
        label: t(`intents.${intent.id}.short`),
        caption: t(`intents.${intent.id}.description`),
        iconKey: INTENT_AREA_ICON[intent.iconKey],
        testId: `goal-card-${intent.id}`,
      }))}
    />
  );
}

/** LEVEL 2 — one goal's functions, each card the function itself. */
export async function GoalFunctionRail({ intent }: { intent: PublicIntent }) {
  const [t, labels] = await Promise.all([getTranslations("siteNav"), railLabels()]);
  return (
    <AreaSwitcher
      title={t("start.functions")}
      testId="goal-function-rail"
      fitAll
      {...labels}
      items={intent.links.map((link) => ({
        id: link.id,
        href: link.href,
        label: t(`links.${link.id}`),
        caption: link.account ? t("account") : undefined,
        iconKey: INTENT_AREA_ICON[intent.iconKey],
        testId: `goal-function-${link.id}`,
      }))}
    />
  );
}

export type { PublicIntentId };
