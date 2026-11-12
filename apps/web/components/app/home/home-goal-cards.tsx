import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { AskAssistantEntry } from "@/components/app/home/ask-assistant-entry";
import { WORK_AREA_ICONS } from "@/components/app/work-area-icons";
import { iconControl } from "@/components/app/conversation/chat/icon-scale";
import { NavLinkPending } from "@/components/app/nav-link-pending";
import { Link } from "@/lib/i18n/navigation";
import {
  HOME_GOALS,
  admittedHomeGoals,
  homeGoalHintKey,
  homeGoalLabelKey,
  type HomeGoalRole,
} from "@/lib/navigation/home-goals";
import { loadGoalAdmission } from "@/lib/navigation/home-goals-server";
import { cn } from "@/lib/utils";

/** One card's frame — shared by the cards and by their placeholder. A compact
 *  row on a phone (icon beside the goal's name: two rows of cards leave the
 *  day's first action on the first screen), a taller card with its hint from
 *  `sm` up. Always above the 44px touch floor. */
const CARD =
  "relative flex h-full min-h-16 items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-800 p-3 transition-colors duration-150 hover:border-brand-blue motion-reduce:transition-none sm:min-h-28 sm:flex-col sm:items-start sm:gap-2 sm:p-3.5";
const GRID = "grid grid-cols-2 gap-2 sm:gap-3";
/** Four goals read as one row on a wide screen; six as two rows of three. */
const gridFor = (count: number) => cn(GRID, count > 4 ? "md:grid-cols-3" : "md:grid-cols-4");

/**
 * THE HOME'S GOAL CARDS (owner P0 No. 1, 2026-11-12): the acting role's goals
 * as large cards at the TOP of the signed-in home — one tap to the start of
 * each function, named as the thing the person wants to do.
 *
 * A plain grid, two cards wide on a phone: nothing is behind an arrow, a swipe
 * or a menu, and every card is a real link in the tab order. The list is the
 * ONE goal model (`lib/navigation/home-goals.ts`); this component never spells
 * a route. Only goals whose route the person may open are drawn
 * (`admittedHomeGoals` over the layout's own gate facts) — a card is never a
 * way in.
 *
 * `slots` lets the caller render a goal's ACTION through the product's own
 * tracked door (the company's need door is `NeedDoorLink`, whose address,
 * click event and wording are one thing by contract). The slot's link must
 * stretch over the card (`HOME_GOAL_SLOT_LINK`), so the whole card is the
 * target either way.
 */
export async function HomeGoalCards({
  role,
  slots,
  className,
}: {
  role: HomeGoalRole;
  slots?: Readonly<Record<string, ReactNode>>;
  className?: string;
}) {
  const [t, admission] = await Promise.all([getTranslations("homeGoals"), loadGoalAdmission()]);
  const goals = admittedHomeGoals(role, admission);
  if (goals.length === 0) return null;
  return (
    <nav aria-label={t("title")} data-testid="home-goals" data-role={role} className={className}>
      <h2 className="mb-2 text-support font-medium text-text-muted">{t("title")}</h2>
      <ul className={gridFor(goals.length)}>
        {goals.map((goal) => {
          const Icon = WORK_AREA_ICONS[goal.iconKey];
          const slot = slots?.[goal.id];
          const icon = (
            <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-brand-blue/15 text-brand-blue sm:size-10">
              <Icon {...iconControl()} aria-hidden />
            </span>
          );
          const label = (
            <span className="min-w-0 text-support font-semibold leading-snug text-text-primary hyphens-auto break-words sm:text-body">
              {t(homeGoalLabelKey(role, goal))}
            </span>
          );
          return (
            <li key={goal.id}>
              {slot ? (
                <div className={cn(CARD, "focus-within:border-brand-blue")} data-testid={`home-goal-${goal.id}`}>
                  {icon}
                  <span className="flex min-w-0 flex-col gap-0.5 sm:gap-2">
                    {label}
                    {slot}
                  </span>
                </div>
              ) : (
                <Link
                  href={goal.href as "/dashboard"}
                  data-testid={`home-goal-${goal.id}`}
                  className={cn(CARD, "outline-none focus-visible:ring-2 focus-visible:ring-brand-blue")}
                >
                  {icon}
                  {label}
                  {/* The hint joins from `sm`: on a phone the goal's name is the
                      whole card, so the choices read in one glance. */}
                  <span className="hidden text-support leading-snug text-text-secondary sm:block">
                    {t(homeGoalHintKey(role, goal))}
                  </span>
                  <NavLinkPending className="absolute right-3 top-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {/* Anything that is not a card: say it in your own words. Opens the
          ONE composer already on this screen — no second chat. */}
      <AskAssistantEntry label={t("ask.label")} hint={t("ask.hint")} />
    </nav>
  );
}

/** The class a slotted link carries so it covers its whole card. */
export const HOME_GOAL_SLOT_LINK =
  "text-support font-medium text-brand-blue underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand-blue";

/**
 * The cards' footprint while the home's head has not resolved (home CLS P0):
 * the same grid, the same card height, the full list of the role — so the
 * goals never appear out of nothing and push the day down.
 */
export function HomeGoalCardsPending({ role }: { role: HomeGoalRole }) {
  const count = HOME_GOALS[role].length;
  return (
    <div aria-hidden data-testid="home-goals-pending">
      <span className="mb-2 block h-5 w-40 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
      <div className={gridFor(count)}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={cn(CARD, "animate-pulse motion-reduce:animate-none")} />
        ))}
      </div>
      <span className="mt-2 block min-h-14 animate-pulse rounded-xl border border-dashed border-ink-600 motion-reduce:animate-none sm:mt-3" />
    </div>
  );
}
