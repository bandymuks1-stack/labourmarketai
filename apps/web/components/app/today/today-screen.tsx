import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { EmployerVisibilityAsk } from "@/components/app/employer-visibility-ask";
import {
  HomeAvailability,
  HomeBecause,
  HomeOutside,
  HomeRegionPending,
  HomeRunning,
  HomeWaiting,
} from "@/components/app/home/home-regions";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import { deriveTodayState } from "@/lib/today/today-model";
import { TODAY_STATIONS } from "@/lib/today/today-route";
import { professionDisplayName } from "@/lib/worker/self-declared-profession";
import { loadTodayHead, loadTodayWorkIntelligence } from "@/lib/today/today-server";

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
 * What the home shows while the ŠIANDIEN head is still being read. The head
 * waits on the player card; without its own boundary it held the WHOLE home —
 * conversation, composer, nav — behind the route skeleton until that read
 * finished (owner walk 2026-09-28: "login has become slow"). Now the
 * workspace is usable at once and the head streams in; the placeholder keeps
 * the head's footprint so nothing jumps when it arrives.
 */
function TodayScreenPending() {
  return (
    <div
      aria-hidden
      data-testid="today-screen-pending"
      className="mx-auto flex w-full max-w-6xl flex-col gap-2"
    >
      <span className="h-3 w-24 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
      <span className="h-8 w-56 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
      <span className="h-4 w-40 animate-pulse rounded bg-ink-700 motion-reduce:animate-none" />
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

async function TodayScreenHead({ locale }: { locale: ActiveLocale }) {
  const [t, tCard, tProf, head] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("auth.dashboard.workCard"),
    getTranslations("professions"),
    loadTodayHead(),
  ]);
  // The first profession this person holds that can be named — a registry one
  // through the catalogue, or their OWN WORDS exactly as typed. The registry
  // primary still leads when there is one; nothing here interprets the words.
  const professionLabel =
    head.professions
      .map((entry) =>
        professionDisplayName(entry, (slug) => (tProf.has(slug) ? tProf(slug) : null)),
      )
      .find((name): name is string => !!name) ??
    (head.professionSlug && tProf.has(head.professionSlug)
      ? tProf(head.professionSlug)
      : null);

  return (
    <div data-testid="today-screen" className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* 1 · HEADER — who, what they do, where today stands. */}
      <header data-testid="today-header" className="flex flex-col gap-1">
        <p className="text-support font-medium text-text-muted">{t("eyebrow")}</p>
        <h1 className="font-display text-title font-bold tracking-tightest text-text-primary sm:text-title-lg lg:text-title-lg">
          {head.displayName ?? t("headerNoName")}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-support text-text-secondary">
          <span data-testid="today-profession">{professionLabel ?? t("professionUnknown")}</span>
          <span aria-hidden className="text-text-muted">
            ·
          </span>
          <Suspense fallback={<Reading label={t("reading")} />}>
            <TodayStateLine locale={locale} />
          </Suspense>
        </p>
      </header>

      {/* PARTIAL vs TOTAL unavailability — one line above the regions, from
          the same request-cached loaders (no extra reads). */}
      <Suspense fallback={null}>
        <HomeAvailability />
      </Suspense>

      {/* THE FOUR REGIONS — two columns from lg (01+02 | 03+04), one column
          on a phone in DOM order 01→04 (the one primary action first). Each
          streams from its own loader. */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-7 lg:gap-6">
          <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
            <HomeWaiting locale={locale} />
          </Suspense>

          {/* THE EMPLOYER-VISIBILITY ASK — the SAME once-only door the
              work-card save shows (never a consent of its own: it opens the
              canonical consent screen; "not now" ends it on this device). On
              the home too, because the save-only moment never reached the
              workers who onboarded before the consent step existed (prod
              2026-10-10: 0 of 18 real workers had ever been asked). Renders
              nothing once decided. */}
          <div className="empty:hidden">
            <EmployerVisibilityAsk
              labels={{
                title: tCard("visibilityAsk.title"),
                body: t("visibilityAskBody"),
                open: tCard("visibilityAsk.open"),
                dismiss: tCard("visibilityAsk.dismiss"),
              }}
            />
          </div>

          <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
            <HomeRunning locale={locale} />
          </Suspense>
        </div>

        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-5 lg:gap-6">
          <Suspense fallback={null}>
            <HomeOutside />
          </Suspense>
          <Suspense fallback={null}>
            <HomeBecause locale={locale} />
          </Suspense>
        </div>
      </div>

      {/* 6 · STATIONS — the contextual workspaces, one tap each: a compact
          grid on a phone, one row from sm up. */}
      <nav aria-label={t("stations.title")} data-testid="today-stations" className="flex flex-col gap-1 border-t border-ink-600/70 pt-4 sm:gap-2 sm:pt-5">
        <p className="text-support font-medium text-text-muted">{t("stations.title")}</p>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-0 sm:flex sm:flex-wrap sm:gap-x-6">
          {TODAY_STATIONS.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href as "/dashboard"}
                data-testid={`today-station-${s.id}`}
                className="inline-flex min-h-11 items-center text-support text-text-primary underline-offset-4 hover:underline sm:text-body"
              >
                {t(`stations.${s.id}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
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
