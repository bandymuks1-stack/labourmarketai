"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { goalFromFragment, goalHref, type PublicIntentId } from "@/lib/navigation/public-intents";
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
/** The server renders no fragment: nothing chosen, the rail alone. */
const readServerFragment = () => "";

/**
 * THE GOAL NAVIGATOR — the six goals in one rail and ONE active panel under
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
  goals,
  professions,
  sectors,
  labels,
  locale,
  headingLevel = "h2",
}: {
  goals: readonly NavigatorGoal[];
  professions: readonly NavigatorProfession[];
  sectors: ReadonlyArray<{ readonly key: string; readonly label: string }>;
  labels: NavigatorLabels;
  locale: string;
  headingLevel?: "h1" | "h2";
}) {
  const fragment = useSyncExternalStore(subscribeToFragment, readFragment, readServerFragment);
  const activeId = goalFromFragment(fragment);
  const active = goals.find((g) => g.id === activeId) ?? null;
  /** How many goals this visit opened — Close then goes Back. */
  const pushed = useRef(0);
  const [tab, setTab] = useState<"functions" | "professions">("functions");
  const [sector, setSector] = useState<string | null>(null);
  const [fullList, setFullList] = useState(false);
  const Heading = headingLevel;

  const select = (card: RailCard) => {
    if (card.id === activeId) return;
    setTab("functions");
    // pushState, not `location.hash =`: no element carries this id, and the
    // page must not jump. popstate is not fired by pushState, so say so.
    window.history.pushState(null, "", goalHref(card.id as PublicIntentId));
    pushed.current += 1;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  const close = () => {
    if (pushed.current > 0) {
      const steps = pushed.current;
      pushed.current = 0;
      // Back to where the visitor chose from.
      window.history.go(-steps);
      return;
    }
    // Opened from a shared link: drop the fragment, stay on the page.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  const shown = useMemo(
    () => (sector ? professions.filter((p) => p.sector === sector) : professions),
    [professions, sector],
  );
  const showProfessions = active?.hasCatalogue && tab === "professions";
  const chip =
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors motion-reduce:transition-none";

  return (
    <section data-testid="goal-navigator" className="flex min-w-0 flex-col gap-4">
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

      {active && (
        <div
          data-testid="goal-panel"
          data-goal={active.id}
          className="flex min-w-0 flex-col gap-4 rounded-2xl border border-ink-600 bg-ink-900/60 p-4 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              aria-live="polite"
              className="font-display text-lg font-semibold text-text-primary sm:text-xl"
            >
              {active.title}
            </h2>
            <button
              type="button"
              onClick={close}
              data-testid="goal-panel-close"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-ink-500 px-3 text-sm font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary motion-reduce:transition-none"
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
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none",
                    tab === key
                      ? "bg-brand-blue text-text-on-brand"
                      : "text-text-secondary hover:text-text-primary",
                  )}
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
