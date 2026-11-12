import { getTranslations } from "next-intl/server";

import { CardRail } from "@/components/navigation/card-rail";
import { AREA_CARD_ICONS } from "@/lib/navigation/home-goals";
import type { WorkAreaIconKey } from "@/lib/navigation/work-areas";

export type HomeArea = {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly iconKey: WorkAreaIconKey;
};

/**
 * THE HOME'S OTHER AREAS, on the ONE rail (V2, owner-approved 2026-11-12: one
 * navigation system — one rail, one card). The areas the goals above do not
 * already offer used to be drawn by a second carousel of their own; they are
 * now cards of the shared `CardRail`, the same card the goals and their
 * functions use. Nothing is drawn here: a heading and the shared rail.
 *
 * The list is the caller's, from the ONE area model
 * (`lib/navigation/work-areas.ts`) minus what the goals offer
 * (`areasBeyondGoals`); this component never spells a route. Absent when
 * nothing is left to show.
 */
export async function HomeAreaRail({
  title,
  areas,
  testId,
}: {
  title: string;
  areas: readonly HomeArea[];
  testId: string;
}) {
  if (areas.length === 0) return null;
  const [t, tNav] = await Promise.all([getTranslations("siteNav.nav"), getTranslations("common.nav")]);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
      <CardRail
        label={title}
        cards={areas.map((a) => ({ id: a.id, href: a.href, label: a.label, iconKey: AREA_CARD_ICONS[a.iconKey] }))}
        swipeHint={t("swipe")}
        prevLabel={tNav("previous")}
        nextLabel={tNav("next")}
        testId={testId}
      />
    </section>
  );
}
