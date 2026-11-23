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
import type { NavCardIconKey } from "@/lib/navigation/nav-card-icons";

/** A signed-in goal's function card, already labelled (N4). */
export type OwnGoalFunction = {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly iconKey: NavCardIconKey;
};

/** Goals that carry a profession catalogue. */
const CATALOGUE_GOALS = new Set(["work"]);

/**
 * The goal navigator's server half: resolves every label and hands the client
 * island plain data. The lists are the navigation's own
 * (`lib/navigation/public-intents.ts`, `profession-sectors.ts`,
 * `nav-card-icons.ts`); nothing is spelled here. Mounted on the public home; the
 * signed-in home (Lane A2) mounts the same component.
 */
export async function GoalNavigation({
  headingLevel = "h2",
  lead,
  ownFunctions,
  variant,
}: {
  headingLevel?: "h1" | "h2";
  lead?: string;
  /** `strip`: the inner pages' compact goal row (N5). */
  variant?: "full" | "strip";
  /**
   * SIGNED IN (CAROUSEL_NAVIGATION_SPEC N4, owner P0 2026-11-23): the same
   * six goals, each opening the functions THIS person may use
   * (`components/navigation/signed-in-goal-navigation.tsx` builds the map
   * from `lib/navigation/signed-in-goals.ts`). Same navigator, same cards,
   * same `#goal=` state as the public home. Kept as plain data so the public
   * landing's import graph never reaches the signed-in modules.
   */
  ownFunctions?: ReadonlyMap<string, readonly OwnGoalFunction[]>;
}) {
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
      lead={lead}
      variant={variant}
      goals={withOwnFunctions(
        PUBLIC_INTENTS.map((intent) => ({
        id: intent.id,
        href: goalHref(intent.id),
        label: t(`intents.${intent.id}.short`),
        description: t(`intents.${intent.id}.description`),
        title: t(`intents.${intent.id}.title`),
        iconKey: GOAL_ICONS[intent.id],
        hasCatalogue: CATALOGUE_GOALS.has(intent.id),
        functions: intent.links.map((link) => ({
          id: link.id,
          // A link to a fragment of the landing is a fragment of THIS page
          // here: a plain in-page link, announced by the browser.
          href: link.href.startsWith("/#") ? link.href.slice(1) : link.href,
          guestHref: link.guestHref,
          label: t(`links.${link.id}`),
          // Only a card that asks for sign-in carries a note. The "No account
          // required" badge on every other card was removed as interface noise
          // (owner decision 0032, 2026-11-15).
          note: link.account ? t("nav.signInWhenOpen") : undefined,
          // Signed out, a card with a guest door opens SIGN-UP: the existing
          // "Sign up", not "Sign-in required".
          guestNote: link.account && link.guestHref ? t("signUp") : undefined,
          iconKey: FUNCTION_ICONS[link.id as keyof typeof FUNCTION_ICONS],
        })),
      })),
        ownFunctions,
      )}
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

/** The public goals with their functions swapped for this person's own, when
 *  the signed-in home hands them in; the public home passes nothing. */
function withOwnFunctions<G extends { readonly id: string; readonly functions: readonly unknown[] }>(
  goals: readonly G[],
  own: ReadonlyMap<string, readonly OwnGoalFunction[]> | undefined,
): readonly G[] {
  if (!own) return goals;
  return goals.map((goal) => ({ ...goal, functions: own.get(goal.id) ?? goal.functions }));
}
