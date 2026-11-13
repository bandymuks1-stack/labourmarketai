"use client";

import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import {
  GOAL_FRAGMENT_PREFIX,
  MORE_GOAL_ID,
  goalIdFromFragment,
} from "@/lib/navigation/public-intents";
import { CardRail, type RailCard } from "@/components/navigation/card-rail";
import { cn } from "@/lib/utils";

export type NavigatorGoal = RailCard & {
  /** The goal's full name, shown as the panel title. */
  readonly title: string;
  readonly functions: readonly RailCard[];
  /** True when the goal has a profession catalogue. */
  readonly hasCatalogue: boolean;
};

export type NavigatorProfession = RailCard & { readonly sector: string };

export type NavigatorLabels = {
  readonly heading: string;
  readonly swipe: string;
  readonly previous: string;
  readonly next: string;
  readonly close: string;
  readonly functions: string;
  readonly professions: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly searchSubmit: string;
  readonly allSectors: string;
  readonly fullList: string;
  readonly viewAll: string;
};

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const readFragment = () => window.location.hash;

/** History-state key: goal entries between this entry and the origin page. */
const GOAL_DEPTH_KEY = "lmGoalDepth";
function goalDepth(): number {
  const value = (window.history.state as Record<string, unknown> | null)?.[GOAL_DEPTH_KEY];
  return typeof value === "number" && value > 0 ? value : 0;
}
/**
 * The goal fragment the person last ASKED for — from every announced change
 * of the address (a card, Close, Back, a link). Kept at module level so it is
 * listening from the moment this script loads, before the component has
 * rendered or attached anything: a tap can land in that gap. `null` until the
 * first announcement. The router's silent rewrites announce nothing, so they
 * never reach it.
 */
let askedFragment: string | null = null;
/** When, after mounting, the address is checked for a dropped fragment. */
const STARTUP_CHECKS_MS = [0, 100, 250, 500, 800, 1200, 1800, 2500, 3500, 5000] as const;
/** Navigators on screen. When the last one leaves (the person went to another
 *  page), what was asked there is forgotten, so coming back opens nothing. */
let mountedNavigators = 0;
if (typeof window !== "undefined") {
  const note = () => {
    const now = window.location.hash;
    askedFragment = goalIdFromFragment(now) ? now : "";
  };
  window.addEventListener("hashchange", note);
  window.addEventListener("popstate", note);
}

const PANEL_CLASS =
  "min-w-0 flex-col gap-4 rounded-2xl border border-ink-600 bg-ink-900/60 p-4 sm:p-6";
const PANEL_TITLE_CLASS = "font-display text-lg font-semibold text-text-primary sm:text-xl";
const PANEL_CLOSE_CLASS =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-ink-500 px-3 text-sm font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary motion-reduce:transition-none";
const TAB_CLASS =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none";
const TAB_ON_CLASS = "bg-brand-blue text-text-on-brand";
const TAB_OFF_CLASS = "text-text-secondary hover:text-text-primary";

/** The server renders no fragment: nothing chosen, no goal marked as open. */
const readServerFragment = () => "";

/**
 * THE GOAL NAVIGATOR — the goals (and an optional "More") in one rail and ONE active panel under
 * it (owner-approved structure, 2026-11-12).
 *
 * Nothing chosen: the rail alone, so the first screen stays short. Choosing a
 * goal fills the panel with that goal's name, its function cards (each opens
 * the function itself — two actions from the home screen), and, for a goal
 * with a catalogue, a "Functions | Professions" switch: search, sector chips,
 * the profession rail and a full-list toggle. Only one rail shows at a time.
 *
 * THE URL IS THE STATE — as a fragment of this page (`#goal=work`), never a
 * page of its own. Choosing a goal sets the fragment, so browser Back closes
 * the panel and a reload or a shared link opens the same view; the page
 * itself stays one static document and no new screen is added. The server
 * renders the rail alone; the panel appears once the fragment is read.
 * The rail is a native scroller, so choosing never resets its position.
 */
export function GoalNavigator({
  goals: ownGoals,
  more,
  professions,
  sectors,
  labels,
  locale,
  headingLevel = "h2",
}: {
  goals: readonly NavigatorGoal[];
  /**
   * One extra card after the goals: "More" — the areas that belong to no
   * goal (signed-in: work in numbers, profile, gallery …). It behaves like a
   * goal: its panel lists those areas as function cards. Its id is `more`.
   * Omit it where every destination already belongs to a goal (the public
   * landing, whose remaining links sit behind the header's "More").
   */
  more?: Omit<NavigatorGoal, "id" | "hasCatalogue">;
  professions: readonly NavigatorProfession[];
  sectors: ReadonlyArray<{ readonly key: string; readonly label: string }>;
  labels: NavigatorLabels;
  locale: string;
  headingLevel?: "h1" | "h2";
}) {
  const fragment = useSyncExternalStore(subscribeToFragment, readFragment, readServerFragment);
  const goals = useMemo<readonly NavigatorGoal[]>(
    () => (more ? [...ownGoals, { ...more, id: MORE_GOAL_ID, hasCatalogue: false }] : ownGoals),
    [ownGoals, more],
  );
  // The fragment names a card of THIS navigator, or nothing is open.
  const active = goals.find((g) => g.id === goalIdFromFragment(fragment)) ?? null;
  const activeId = active?.id ?? null;
  // A GOAL CHOSEN WHILE THE PAGE IS STARTING IS NOT LOST. The goal cards are
  // real links, so a tap before the scripts attach sets the fragment
  // natively; and for a moment after they attach, the framework's router is
  // still putting the address it loaded with back — silently, with no event —
  // which drops the fragment, and the choice with it (found by the evidence
  // walk, 2026-11-12). So for the first seconds the fragment the person last
  // asked for (`askedFragment`, or the address at first render) is put back
  // if it disappears without anyone having closed the panel.
  const [bootFragment] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  // THE FIRST TAP DOES NOT WAIT FOR THE SCRIPTS. On a slow phone connection
  // this component comes alive seconds after the page is painted (measured
  // 2026-11-13: about 4 s), and until then a tapped goal showed nothing. So
  // the server also sends every goal's panel, hidden, each right after an
  // anchor carrying that goal's fragment as its id; the goal cards are real
  // links to those fragments, and plain CSS (`:target`) shows the panel the
  // moment the address changes — no script involved. Once this component is
  // alive it draws the one live panel itself and these are taken out for good
  // (`started`), so the address works exactly as before from then on.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    setStarted(true);
  }, []);
  useEffect(() => {
    mountedNavigators += 1;
    const restore = () => {
      // What the person last asked for; before any announcement, the address
      // this component first saw.
      const wanted = askedFragment ?? (goalIdFromFragment(bootFragment) ? bootFragment : "");
      if (!wanted || window.location.hash !== "") return;
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search + wanted,
      );
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    restore();
    // A fixed handful of checks while the page starts, then never again:
    // after that the address is left alone.
    const checks = STARTUP_CHECKS_MS.map((ms) => window.setTimeout(restore, ms));
    return () => {
      checks.forEach((t) => window.clearTimeout(t));
      mountedNavigators -= 1;
      // After the current task: a development double-mount is not a leave.
      window.setTimeout(() => {
        if (mountedNavigators === 0) askedFragment = null;
      }, 0);
    };
  }, [bootFragment]);

  const [tab, setTab] = useState<"functions" | "professions">("functions");
  const [sector, setSector] = useState<string | null>(null);
  const [fullList, setFullList] = useState(false);
  const Heading = headingLevel;

  const select = (card: RailCard) => {
    if (card.id === activeId) return;
    setTab("functions");
    // pushState, not `location.hash =`: no element carries this id, and the
    // page must not jump. The entry itself records how many goal entries lie
    // between it and the page the visitor chose from, so Close is right
    // however they moved through history in between (Back, Forward, another
    // goal). popstate is not fired by pushState, so say so.
    window.history.pushState(
      // Only our own key: the router adds its own bookkeeping to a new
      // entry, and copying the current entry's would hand it a stale one.
      { [GOAL_DEPTH_KEY]: goalDepth() + 1 },
      "",
      `${GOAL_FRAGMENT_PREFIX}${card.id}`,
    );
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  /** Drop the goal fragment from the current entry, staying on the page. */
  const clearGoal = () => {
    if (!goalIdFromFragment(window.location.hash)) {
      // Nothing in the address (the router may have rewritten it while the
      // page was starting): still say so, so an open panel closes.
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  const close = () => {
    const depth = goalDepth();
    if (depth === 0) {
      // Opened from a shared link: drop the fragment, stay on the page.
      clearGoal();
      return;
    }
    // Back to exactly where the visitor chose from — never further. If that
    // entry itself carries a goal (they arrived on a shared goal link and
    // then picked another), Close still means "no goal": clear it there too.
    window.addEventListener("popstate", clearGoal, { once: true });
    window.history.go(-depth);
  };

  const shown = useMemo(
    () => (sector ? professions.filter((p) => p.sector === sector) : professions),
    [professions, sector],
  );
  const showProfessions = active?.hasCatalogue && tab === "professions";
  const chip =
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors motion-reduce:transition-none";

  return (
    <section data-testid="goal-navigator" className="relative flex min-w-0 flex-col gap-4">
      <Heading className="font-display text-xl font-bold tracking-tightest text-text-primary sm:text-2xl">
        {labels.heading}
      </Heading>

      <CardRail
        label={labels.heading}
        testId="goal-rail"
        size="compact"
        cards={goals}
        activeId={activeId}
        onSelect={select}
        swipeHint={labels.swipe}
        prevLabel={labels.previous}
        nextLabel={labels.next}
      />

      {/* Before the scripts are alive: one hidden panel per goal, shown by
          `:target` alone. The anchor sits at the top of the navigator so the
          browser has nowhere to jump to; the panel follows it directly so
          one rule pairs them. Same frame as the live panel below, so nothing
          moves when the live one takes over. */}
      {!started &&
        !active &&
        goals.map((goal) => (
          <Fragment key={goal.id}>
            <span
              id={`${GOAL_FRAGMENT_PREFIX.slice(1)}${goal.id}`}
              data-goal-anchor=""
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 scroll-mt-32"
            />
            <div
              data-testid="goal-panel-early"
              data-goal={goal.id}
              className={cn("hidden [[data-goal-anchor]:target+&]:flex", PANEL_CLASS)}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className={PANEL_TITLE_CLASS}>{goal.title}</h2>
                {/* A plain link to the page without a fragment: Close with no script. */}
                <a href="#" data-testid="goal-panel-early-close" className={PANEL_CLOSE_CLASS}>
                  <X aria-hidden className="size-4" />
                  {labels.close}
                </a>
              </div>
              {goal.hasCatalogue && (
                // Same switch as the live panel, in its place so nothing
                // shifts; it starts working when the live panel takes over.
                <div role="group" aria-label={goal.title} className="flex w-fit rounded-full border border-ink-600 p-1">
                  {(["functions", "professions"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={key === "functions"}
                      className={cn(TAB_CLASS, key === "functions" ? TAB_ON_CLASS : TAB_OFF_CLASS)}
                    >
                      {labels[key]}
                    </button>
                  ))}
                </div>
              )}
              <CardRail
                label={labels.functions}
                testId="function-rail-early"
                cards={goal.functions}
                swipeHint={labels.swipe}
                prevLabel={labels.previous}
                nextLabel={labels.next}
              />
            </div>
          </Fragment>
        ))}

      {active && (
        <div data-testid="goal-panel" data-goal={active.id} className={cn("flex", PANEL_CLASS)}>
          <div className="flex items-start justify-between gap-3">
            <h2 aria-live="polite" className={PANEL_TITLE_CLASS}>
              {active.title}
            </h2>
            <button
              type="button"
              onClick={close}
              data-testid="goal-panel-close"
              className={PANEL_CLOSE_CLASS}
            >
              <X aria-hidden className="size-4" />
              {labels.close}
            </button>
          </div>

          {active.hasCatalogue && (
            <div role="group" aria-label={active.title} className="flex w-fit rounded-full border border-ink-600 p-1">
              {(["functions", "professions"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  data-testid={`goal-tab-${key}`}
                  className={cn(TAB_CLASS, tab === key ? TAB_ON_CLASS : TAB_OFF_CLASS)}
                >
                  {labels[key]}
                </button>
              ))}
            </div>
          )}

          {!showProfessions && (
            <CardRail
              label={labels.functions}
              testId="function-rail"
              cards={active.functions}
              swipeHint={labels.swipe}
              prevLabel={labels.previous}
              nextLabel={labels.next}
            />
          )}

          {showProfessions && (
            <div className="flex min-w-0 flex-col gap-3" data-testid="profession-box">
              {/* A plain GET form to the board: search works without JS. */}
              <form action={`/${locale}/jobs`} method="get" className="flex gap-2">
                <label htmlFor="goal-q" className="sr-only">
                  {labels.searchLabel}
                </label>
                <input
                  id="goal-q"
                  name="q"
                  type="search"
                  maxLength={120}
                  placeholder={labels.searchPlaceholder}
                  className="min-h-11 min-w-0 flex-1 rounded-control border border-ink-500 bg-ink-900 px-3 text-sm text-text-primary placeholder:text-text-muted"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control bg-brand-blue px-4 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne motion-reduce:transition-none"
                >
                  {labels.searchSubmit}
                </button>
              </form>

              <div className="flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="sector-chips">
                <button
                  type="button"
                  aria-pressed={sector === null}
                  onClick={() => setSector(null)}
                  className={cn(chip, sector === null ? "border-brand-blue bg-ink-800 text-text-primary" : "border-ink-600 text-text-secondary")}
                >
                  {labels.allSectors}
                </button>
                {sectors.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sector === s.key}
                    onClick={() => setSector(s.key)}
                    data-testid={`sector-chip-${s.key}`}
                    className={cn(chip, sector === s.key ? "border-brand-blue bg-ink-800 text-text-primary" : "border-ink-600 text-text-secondary")}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {!fullList && (
                <CardRail
                  label={labels.professions}
                  testId="profession-rail"
                  cards={shown}
                  swipeHint={labels.swipe}
                  prevLabel={labels.previous}
                  nextLabel={labels.next}
                />
              )}
              {fullList && (
                <ul data-testid="profession-list" className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-4">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={p.href}
                        className="flex min-h-11 items-center text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
                      >
                        {p.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-x-4">
                <button
                  type="button"
                  aria-pressed={fullList}
                  onClick={() => setFullList((v) => !v)}
                  data-testid="profession-full-list"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-text-primary underline underline-offset-4 hover:text-brand-blue"
                >
                  {labels.fullList}
                </button>
                <Link
                  href="/jobs"
                  data-testid="goal-view-all"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-text-secondary underline underline-offset-4 hover:text-text-primary"
                >
                  {labels.viewAll}
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
