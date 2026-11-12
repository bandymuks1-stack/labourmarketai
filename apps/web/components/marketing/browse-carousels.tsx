import { getLocale, getTranslations } from "next-intl/server";

import { AreaSwitcher } from "@/components/app/area-switcher";
import { PUBLIC_INTENTS, type PublicIntentIconKey } from "@/lib/navigation/public-intents";
import { professionCards, SECTOR_ICONS } from "@/lib/navigation/profession-sectors";
import { WORK_CATEGORIES, type WorkLabel } from "@/lib/taxonomy/work-categories";
import type { WorkAreaIconKey } from "@/lib/navigation/work-area-icon-key";

/**
 * THE PUBLIC BROWSE CAROUSELS (owner P0 2026-11-12) — functions and
 * professions, both rendered by the ONE area switcher
 * (`components/app/area-switcher.tsx`): cards with light depth, arrows, ← →,
 * swipe, Tab, and no rotation or transitions under prefers-reduced-motion.
 * No second carousel exists.
 *
 * Every card is a real link:
 *   functions   → the destinations of the six public intents
 *                 (`lib/navigation/public-intents.ts`, each guarded to exist);
 *   professions → the public board filtered to that profession
 *                 (`/jobs?profession=<slug>` — a closed-set filter the board
 *                 already answers, honestly, even when it has no ads today).
 *
 * Icons are SVG; nothing here loads a photograph.
 */

const INTENT_AREA_ICON: Record<PublicIntentIconKey, WorkAreaIconKey> = {
  briefcase: "briefcase",
  userSearch: "userSearch",
  wrench: "wrench",
  fileSignature: "fileSignature",
  handshake: "handshake",
  building: "building",
};

async function switcherLabels() {
  const t = await getTranslations("common.nav");
  return { prevLabel: t("previous"), nextLabel: t("next"), hereLabel: t("youAreHere") };
}

/** What a visitor can do here — one card per live destination. */
export async function FunctionCarousel() {
  const [t, labels] = await Promise.all([getTranslations("siteNav"), switcherLabels()]);
  const seen = new Set<string>();
  const items = PUBLIC_INTENTS.flatMap((intent) =>
    intent.links
      .filter((link) => (seen.has(link.href) ? false : (seen.add(link.href), true)))
      .map((link) => ({
        id: link.id,
        href: link.href,
        label: t(`links.${link.id}`),
        caption: t(`intents.${intent.id}.title`),
        iconKey: INTENT_AREA_ICON[intent.iconKey],
        testId: `function-card-${link.id}`,
      })),
  );
  return (
    <div className="mx-auto w-full max-w-container px-4 py-8 sm:px-12">
      <AreaSwitcher
        title={t("carousels.functions")}
        items={items}
        testId="function-carousel"
        {...labels}
      />
    </div>
  );
}

/** Browse the public board by profession — every sector of the catalogue. */
export async function ProfessionCarousel() {
  const [t, tProf, labels, locale] = await Promise.all([
    getTranslations("siteNav"),
    getTranslations("professions"),
    switcherLabels(),
    getLocale(),
  ]);
  const sectorName = new Map(
    WORK_CATEGORIES.map((c) => [c.key, c[locale as keyof WorkLabel] ?? c.en]),
  );
  const items = professionCards().map((card) => ({
    id: card.slug,
    href: card.href,
    label: tProf.has(card.slug) ? tProf(card.slug) : card.slug,
    caption: sectorName.get(card.sector),
    iconKey: SECTOR_ICONS[card.sector],
    testId: `profession-card-${card.slug}`,
  }));
  return (
    <AreaSwitcher
      title={t("carousels.professions")}
      items={items}
      testId="profession-carousel"
      {...labels}
    />
  );
}
