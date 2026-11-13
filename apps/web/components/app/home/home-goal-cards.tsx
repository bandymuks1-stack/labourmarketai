import { getLocale, getTranslations } from "next-intl/server";

import { AskAssistantEntry } from "@/components/app/home/ask-composer-entry";
import { HomeGoalNavigator } from "@/components/app/home/home-goal-navigator";
import { GOAL_ICONS } from "@/lib/navigation/nav-card-icons";
import { signedInGoals, type HomeGoalRole } from "@/lib/navigation/home-goals";
import { loadGoalAdmission } from "@/lib/navigation/home-goals-server";
import { goalHref } from "@/lib/navigation/public-intents";
import { isPinnableRef } from "@/lib/workspace/pins-model";

/**
 * THE SIGNED-IN HOME'S GOAL NAVIGATION (owner P0 No. 1, 2026-11-12; V2: ONE
 * navigation system for the public site and the signed-in app).
 *
 * This is the server half only. It renders Lane A's shared `GoalNavigator`
 * (`components/navigation/goal-navigator.tsx`, which draws every rail with
 * the one `CardRail`; `home-goal-navigator.tsx` only fills the shared card's
 * pin slot from the pinned row's state) — the SAME component the public home mounts, with the
 * same six goals and the same goal names (`siteNav.intents.*`). No card, rail,
 * panel or motion is defined here.
 *
 * What differs when a person is signed in is DATA: the goals come in their
 * role's order, each goal opens the product's own functions instead of the
 * public pages, and only what the person may open is listed
 * (`signedInGoals` over the layout's own gate facts — a card is never a way
 * in). A goal is a fragment of the home (`#goal=work`), so browser Back
 * closes its panel; a function card opens the function itself: two
 * navigation actions from the home to the start of any function, one once it
 * is pinned.
 *
 * The profession catalogue is the public job board's; the signed-in home
 * hands the navigator no catalogue, so it shows functions only.
 */
export async function HomeGoalCards({ role, className }: { role: HomeGoalRole; className?: string }) {
  const [t, tAll, tNav, tGoals, admission, locale] = await Promise.all([
    getTranslations("siteNav"),
    getTranslations(),
    getTranslations("common.nav"),
    getTranslations("homeGoals"),
    loadGoalAdmission(),
    getLocale(),
  ]);
  const goals = signedInGoals(role, admission);
  if (goals.length === 0) return null;
  return (
    <div data-testid="home-goals" data-role={role} className={className}>
      <HomeGoalNavigator
        locale={locale}
        headingLevel="h2"
        goals={goals.map((goal) => ({
          id: goal.id,
          href: goalHref(goal.id),
          label: t(`intents.${goal.id}.short`),
          description: t(`intents.${goal.id}.description`),
          title: t(`intents.${goal.id}.title`),
          iconKey: GOAL_ICONS[goal.id],
          hasCatalogue: false,
          functions: goal.functions.map((fn) => {
            const label = tAll(fn.labelKey);
            // The same closed reference rule the pin store applies: a card
            // offers a pin only for a place the row could hold.
            const ref = `link:${fn.href}`;
            return {
              id: fn.id,
              href: fn.href,
              label,
              description: fn.hintKey ? tAll(fn.hintKey) : undefined,
              iconKey: fn.iconKey,
              pinning: isPinnableRef(ref)
                ? { ref, add: tGoals("pin.add", { label }), remove: tGoals("pin.remove", { label }) }
                : undefined,
            };
          }),
        }))}
        professions={[]}
        sectors={[]}
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
      {/* Anything that is not a card: say it in your own words. Opens the
          ONE composer already on this screen — no second chat. */}
      <AskAssistantEntry label={tGoals("ask.label")} hint={tGoals("ask.hint")} />
    </div>
  );
}

/**
 * The navigation's footprint while the home's head has not resolved (home CLS
 * P0): a heading line, one rail of the shared card's compact height and the
 * assistant entry — so the goals never appear out of nothing and push the day
 * down. A plain reserved box: the rail itself is Lane A's to draw.
 */
export function HomeGoalCardsPending() {
  return (
    <div aria-hidden data-testid="home-goals-pending" className="flex flex-col gap-4">
      <span className="block h-7 w-56 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
      <span className="block h-28 animate-pulse rounded-xl bg-ink-800 motion-reduce:animate-none" />
      <span className="block h-14 animate-pulse rounded-xl border border-dashed border-ink-600 motion-reduce:animate-none" />
    </div>
  );
}
