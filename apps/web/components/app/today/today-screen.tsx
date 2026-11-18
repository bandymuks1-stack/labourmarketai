import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { HomeTrace } from "@/components/app/home/home-trace";
import { HomeEmployerVisibility } from "@/components/app/home/home-employer-visibility";
import {
  HomeAvailability,
  HomeBecause,
  HomeLinePending,
  HomeOutside,
  HomeRegionPending,
  HomeRunning,
  HomeWaiting,
} from "@/components/app/home/home-regions";
import type { ActiveLocale } from "@/lib/i18n/config";
import { AreaSwitcher } from "@/components/app/area-switcher";
import { deriveTodayState } from "@/lib/today/today-model";
import { PERSONAL_WORK_AREAS } from "@/lib/navigation/work-areas";
import { professionDisplayName } from "@/lib/worker/self-declared-profession";
import {
  loadTodayDisplayName,
  loadTodayProfessions,
  loadTodayWorkIntelligence,
} from "@/lib/today/today-server";

/**
 * ŠIANDIEN — the worker's OPENING CONTEXT inside the ONE conversation
 * (owner decision 0017, 2026-09-22; composition from
 * `docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md` §2, §5).
 *
 * It is not a page and not a second home: the conversation's thread renders
 * it ABOVE the greeting while the conversation is opening, and the composer
 * sits right under it — the person reads their "now" and types into the same
 * screen. The first real turn replaces it with the conversation. Top to
 * bottom:
 *
 *   1. header      name · profession · today's state
 *                  (replaces the opening intro card for the worker)
 *   2. WAITING     the work-card's ONE next action (the one gold action) +
 *                  what is waiting on the person (offers · invitations ·
 *                  unread · journal items)
 *   3. RUNNING     recorded work · assigned projects · one growth sentence
 *   4. BECAUSE     what happened and — only where the event's own fact IS a
 *                  state change — event → consequence → state
 *   5. OUTSIDE     the market: one opportunity sentence with band counts
 *   6. stations    the contextual workspaces, as text links, one tap —
 *                  opportunities (the former PASAULIS tab) first
 *
 * Regions 2–5 are the owner-FROZEN four-region home (design class
 * 4e695e261), re-ported through main's readers and the restraint directives
 * (`components/app/home/home-regions.tsx`, model `lib/home/home-state.ts`):
 * each streams from its own loader; a growth sentence, an opportunity line
 * and an empty "because" are ABSENT when they have nothing to say ("Tuščia =
 * tvarkinga", owner §20); a read that failed is still named
 * (`isTodayGrowthShown`, `isTodayOpportunityShown` in the pure model).
 *
 * MOBILE IS COMPOSED SEPARATELY (the frozen class's own rule): on a phone
 * the WAITING region — which holds the one primary action — follows the
 * header directly, and the market line comes before the "because" ledger
 * (the ledger is also the activity page; the market line is a door). From
 * md up the regions read in their canonical order.
 *
 * There is no "ask" door any more: the composer IS the door, and the
 * conversation is the home (the former PAKLAUSK tab is retired).
 *
 * Every figure is a reader's figure (`lib/today/today-server.ts`) read
 * through the pure model (`lib/today/today-model.ts`); a reader that could
 * not answer is rendered as "could not read", never as zero (SEP-7).
 *
 * Secondary actions are quiet links or bordered buttons, never gold (IA
 * §5.1, owner restraint 2026-10-09). No quick-nav strip — the one top bar,
 * the station links and the conversation carry navigation.
 */
/**
 * LAYOUT STABILITY — THE FRAME PAINTS FIRST (home CLS P0, 2026-10-26).
 *
 * Measured in production: cumulative layout shift ≈ 0.55 on a phone and
 * ≈ 0.31 on a desktop, in every locale. The largest single shift (0.154 in
 * the owner's own Chrome, t≈8.0 s) was THIS component: the head awaited
 * `loadTodayHead()` — the whole player card plus a second `workers` select —
 * only to print a name and a profession, so for the full card read the home
 * showed a three-line placeholder (~90 px) and then swapped in the entire
 * ŠIANDIEN frame (554 px on a desktop, past 1300 px on a phone), pushing the
 * greeting and the conversation below it down and out of view.
 *
 * Now the head awaits only what it already has: the translations and the
 * request-cached session name. Everything slow streams INSIDE a frame whose
 * size is known from the first paint:
 *   - the profession and today's state are inline text in ONE header line,
 *     each behind its own boundary with a same-line placeholder;
 *   - every region keeps its own boundary (#1011: no read holds the surface)
 *     and every pending state is a region-shaped placeholder that RESERVES
 *     the region's typical height — none of them is `fallback={null}` above
 *     the stations, so nothing appears out of nothing and pushes the screen;
 *   - the stations are rendered at once (their track is a fixed `h-40`).
 *
 * The pending component below is what the boundary shows in the rare case
 * the head has not resolved by the first flush. It draws the SAME footprint
 * (header · the two region columns · the stations), so even that swap moves
 * nothing the person can see.
 */
function TodayScreenPending() {
  return (
    <div
      aria-hidden
      data-testid="today-screen-pending"
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5 lg:gap-6"
    >
      <div className="flex flex-col gap-1">
        <span className="h-5 w-24 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
        <span className="h-9 w-56 animate-pulse rounded bg-ink-700 motion-reduce:animate-none sm:h-10" />
        <span className="h-5 w-40 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:col-span-7 lg:gap-6">
          <HomeRegionPending size="action" />
          <HomeLinePending />
          <HomeRegionPending />
          <HomeRegionPending />
        </div>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:col-span-5 lg:gap-6">
          <HomeRegionPending />
        </div>
      </div>
      <div data-testid="today-stations-pending" className="border-t border-ink-600/70 pt-4 sm:pt-5">
        <span className="block h-5 w-32 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
        <div className="mt-2 h-40" />
      </div>
    </div>
  );
}

export function TodayScreen({ locale }: { locale: ActiveLocale }) {
  return (
    <Suspense fallback={<TodayScreenPending />}>
      <TodayScreenHead locale={locale} />
    </Suspense>
  );
}

/** Awaits NOTHING slow — translations and the request-cached session name
 *  only (`home-cls-stability.test.ts` pins that no player-card read is
 *  awaited here). The slow readers stream inside the frame it draws. */
async function TodayScreenHead({ locale }: { locale: ActiveLocale }) {
  const [t, tNav, displayName] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("common.nav"),
    loadTodayDisplayName(),
  ]);

  return (
    <div data-testid="today-screen" className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* 1 · HEADER — who, what they do, where today stands. The name is in
          hand at once; the profession and the state each stream into the
          SAME line behind a same-line placeholder, so the header's height is
          settled from the first paint. */}
      <header data-testid="today-header" className="flex flex-col gap-1">
        <p className="text-support font-medium text-text-muted">{t("eyebrow")}</p>
        <h1 className="font-display text-title font-bold tracking-tightest text-text-primary sm:text-title-lg lg:text-title-lg">
          {displayName ?? t("headerNoName")}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-support text-text-secondary">
          <Suspense fallback={<InlinePending />}>
            <TodayProfession />
          </Suspense>
          <span aria-hidden className="text-text-muted">
            ·
          </span>
          <Suspense fallback={<Reading label={t("reading")} />}>
            <TodayStateLine locale={locale} />
          </Suspense>
        </p>
      </header>

      {/* THE FOUR REGIONS — two columns from lg (01+02 | 03+04), one column
          on a phone in DOM order 01→04 (the one primary action first). Each
          streams from its own loader behind a placeholder that RESERVES the
          region's typical height (`HomeRegionPending` / `HomeLinePending`),
          so a region resolving late grows by a few lines at most instead of
          appearing out of nothing.

          `grid-cols-1` is load-bearing, not decoration: without an explicit
          template the phone gets ONE IMPLICIT `auto` column, which grows to
          the min-content of its widest child. A `truncate`d trace title is
          min-content = the whole unwrapped line, so the column (and every
          region in it) rendered 816px wide inside a 390px phone and the
          clipped overflow hid the buttons, counts and "Visa veikla"
          (UX review 2026-10-24). `grid-cols-1` is `minmax(0, 1fr)`; the
          columns carry `min-w-0` for the same reason on lg. */}
      <div data-testid="today-regions" className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:col-span-7 lg:gap-6">
          <Suspense fallback={<HomeRegionPending label={t("reading")} size="action" />}>
            <HomeWaiting locale={locale} />
          </Suspense>

          {/* CAN EMPLOYERS FIND ME? — the status line and its ONE action, on
              every visit, directly under the one primary action (which stays
              first on a phone — IA 2026-09-13 §5). Owner goal 2026-10-24,
              "matchability". It replaced the once-only ask, which vanished
              after any decision: a findable worker never saw on the home that
              they were findable, and "not now" removed the question for good.
              The SAME consent component as every other door (compact, source
              "home"); streams on its own, never blocks the regions. It renders
              for every worker row, so its pending state reserves the compact
              line's height — arriving out of nothing, it pushed the trace,
              the running region and the stations down. */}
          <Suspense fallback={<HomeLinePending />}>
            <HomeEmployerVisibility locale={locale} />
          </Suspense>

          {/* KAS PASIKEITĖ — the consequence trace (Future Experience A,
              owner 2026-10-14): what the person did → what changed → what it
              opened, from the ONE read-only trace reader. Directly under the
              one action, so the screen reads "what now · what my work did". */}
          <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
            <HomeTrace locale={locale} />
          </Suspense>

          <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
            <HomeRunning locale={locale} />
          </Suspense>
        </div>

        {/* The right column on lg; under the left column on a phone. A
            region with nothing to say is still left out once read ("Tuščia =
            tvarkinga"); while it reads it is a placeholder, never a nothing
            that then appears above the stations. */}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:col-span-5 lg:gap-6">
          <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
            <HomeOutside />
          </Suspense>
          <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
            <HomeBecause locale={locale} plainOnly />
          </Suspense>
        </div>
      </div>

      {/* 6 · STATIONS — the contextual workspaces, one tap each, as the light
          3D area switcher (owner order 2026-10-25): cards with depth, the
          chosen one in front, from the ONE area model (`PERSONAL_WORK_AREAS`,
          derived from TODAY_STATIONS — opportunities first). Rendered at once:
          no read stands behind it, and its track is a fixed height. */}
      <div data-testid="today-stations" className="border-t border-ink-600/70 pt-4 sm:pt-5">
        <AreaSwitcher
          title={t("stations.title")}
          prevLabel={tNav("previous")}
          nextLabel={tNav("next")}
          hereLabel={tNav("youAreHere")}
          testId="today-area-switcher"
          items={PERSONAL_WORK_AREAS.map((s) => ({
            id: s.id,
            href: s.href,
            iconKey: s.iconKey,
            label: t(`stations.${s.id}`),
            testId: `today-station-${s.id}`,
          }))}
        />
      </div>

      {/* PARTIAL vs TOTAL unavailability — from the same request-cached
          loaders (no extra reads). It can only be known once the SLOWEST
          region has answered, and it renders only when one of them failed —
          each of which already names its own failure with a retry in place.
          So it closes the frame, AFTER the stations: a line arriving late
          there can no longer push the painted home down, as it did from
          above the regions (it was the one `fallback={null}` boundary that
          could move everything). */}
      <Suspense fallback={null}>
        <HomeAvailability />
      </Suspense>
    </div>
  );
}

/** The person's profession, in the header line — from the ONE cached
 *  profession read (`loadTodayProfessions`), never the player card. The first
 *  profession this person holds that can be named — a registry one through
 *  the catalogue, or their OWN WORDS exactly as typed. The registry primary
 *  still leads when there is one; nothing here interprets the words. */
async function TodayProfession() {
  const [t, tProf, head] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("professions"),
    loadTodayProfessions(),
  ]);
  const professionLabel =
    head.professions
      .map((entry) =>
        professionDisplayName(entry, (slug) => (tProf.has(slug) ? tProf(slug) : null)),
      )
      .find((name): name is string => !!name) ??
    (head.professionSlug && tProf.has(head.professionSlug)
      ? tProf(head.professionSlug)
      : null);
  return <span data-testid="today-profession">{professionLabel ?? t("professionUnknown")}</span>;
}

/** A same-line placeholder for an inline header fact: it holds the line's
 *  height and about a word's width, says nothing, and is hidden from
 *  assistive tech (the state line beside it announces the read). */
function InlinePending() {
  return (
    <span
      aria-hidden
      className="inline-block h-[1em] w-24 animate-pulse rounded bg-ink-700 align-middle motion-reduce:animate-none"
    />
  );
}

/** Today's state under the name — from the SAME journal read the RUNNING
 *  region streams (request-cached), so the header and the figures can never
 *  disagree. */
async function TodayStateLine({ locale }: { locale: ActiveLocale }) {
  const [t, wi] = await Promise.all([
    getTranslations("todayScreen.home"),
    loadTodayWorkIntelligence(),
  ]);
  const state = deriveTodayState(wi);
  const text =
    state.kind === "recorded"
      ? t("state.recorded", {
          entries: state.entries,
          hours: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(state.hours),
        })
      : state.kind === "nothing"
        ? t("state.nothing")
        : t("state.unknown");
  return (
    <span className="text-text-secondary" data-testid="today-state" data-state={state.kind}>
      {text}
    </span>
  );
}

/** The honest streaming placeholder: a sentence that says a read is in
 *  progress — never an empty box that reads as "nothing here". */
function Reading({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="text-support text-text-muted">
      {label}
    </span>
  );
}
