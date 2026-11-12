import { getLocale, getTranslations } from "next-intl/server";

import { GoalNavigator } from "@/components/navigation/goal-navigator";
import { PUBLIC_INTENTS, goalHref } from "@/lib/navigation/public-intents";
import {
  FUNCTION_ICONS,
  GOAL_ICONS,
  PROFESSION_ICONS,
} from "@/lib/navigation/nav-card-icons";
import { professionCards } from "@/lib/navigation/profession-sectors";
import { WORK_CATEGORIES, type WorkLabel } from "@/lib/taxonomy/work-categories";

/** Goals that carry a profession catalogue. */
const CATALOGUE_GOALS = new Set(["work"]);

/**
 * The goal navigator's server half: resolves every label and hands the client
 * island plain data. The lists are the navigation's own
 * (`lib/navigation/public-intents.ts`, `profession-sectors.ts`,
 * `nav-card-icons.ts`); nothing is spelled here. Used on the public home and
 * on `/start/<goal>` — the same component, so it is one experience; the
 * signed-in home (Lane A2) mounts it the same way.
 */
export async function GoalNavigation({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const [t, tNav, tProf, locale] = await Promise.all([
    getTranslations("siteNav"),
    getTranslations("common.nav"),
    getTranslations("professions"),
    getLocale(),
  ]);
  const sectorLabel = new Map(
    WORK_CATEGORIES.map((c) => [c.key as string, c[locale as keyof WorkLabel] ?? c.en]),
  );
  const cards = professionCards();
  const usedSectors = [...new Set(cards.map((c) => c.sector as string))];

  return (
    <GoalNavigator
      locale={locale}
      headingLevel={headingLevel}
      goals={PUBLIC_INTENTS.map((intent) => ({
        id: intent.id,
        href: goalHref(intent.id),
        label: t(`intents.${intent.id}.short`),
        description: t(`intents.${intent.id}.description`),
        title: t(`intents.${intent.id}.title`),
        iconKey: GOAL_ICONS[intent.id],
        hasCatalogue: CATALOGUE_GOALS.has(intent.id),
        functions: intent.links.map((link) => ({
          id: link.id,
          href: link.href,
          label: t(`links.${link.id}`),
          note: link.account ? t("nav.signInWhenOpen") : t("nav.opensNow"),
          iconKey: FUNCTION_ICONS[link.id as keyof typeof FUNCTION_ICONS],
        })),
      }))}
      professions={cards.map((card) => ({
        id: card.slug,
        href: card.href,
        label: tProf.has(card.slug) ? tProf(card.slug) : card.slug,
        note: sectorLabel.get(card.sector),
        sector: card.sector,
        iconKey: PROFESSION_ICONS[card.slug as keyof typeof PROFESSION_ICONS],
      }))}
      sectors={usedSectors.map((key) => ({ key, label: sectorLabel.get(key) ?? key }))}
      labels={{
        heading: t("nav.heading"),
        swipe: t("nav.swipe"),
        previous: tNav("previous"),
        next: tNav("next"),
        close: t("nav.close"),
        functions: t("nav.functions"),
        professions: t("nav.professions"),
        searchLabel: t("start.searchLabel"),
        searchPlaceholder: t("start.searchPlaceholder"),
        searchSubmit: t("start.searchSubmit"),
        allSectors: t("nav.allSectors"),
        fullList: t("nav.fullList"),
        viewAll: t("start.viewAll"),
      }}
    />
  );
}
