import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { HomeBecause, HomeOutside, HomeRegionPending, HomeRunning, HomeWaiting } from "@/components/app/home/home-regions";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import { deriveTodayState } from "@/lib/today/today-model";
import { TODAY_STATIONS } from "@/lib/today/today-route";
import { playerInitials } from "@/lib/identity/player-identity";
import { getOwnAvatar } from "@/lib/profile/avatar";
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
 *   2. WAITING     the work-card's ONE next action + what is waiting on the
 *                  person (offers · invitations · unread · journal items)
 *   3. RUNNING     recorded work · assigned projects · one growth sentence
 *   4. BECAUSE     what happened and — only where the event's own fact IS a
 *                  state change — event → consequence → state
 *   5. OUTSIDE     the market: one opportunity sentence with band counts
 *   6. stations    the contextual workspaces, as text links, one tap —
 *                  opportunities (the former PASAULIS tab) first
 *
 * Regions 2–5 are the FROZEN FOUR-STATE GRAMMAR (`components/app/home`,
 * model `lib/home/home-state.ts`): each streams from its own loader; a
 * growth sentence, an opportunity line and an empty "because" are ABSENT
 * when they have nothing to say ("Tuščia = tvarkinga", owner §20); a read
 * that failed is still named (`isTodayGrowthShown`,
 * `isTodayOpportunityShown` in the pure model).
 *
 * There is no "ask" door any more: the composer IS the door, and the
 * conversation is the home (the former PAKLAUSK tab is retired).
 *
 * Every figure is a reader's figure (`lib/today/today-server.ts`) read
 * through the pure model (`lib/today/today-model.ts`); a reader that could
 * not answer is rendered as "could not read", never as zero (SEP-7).
 *
 * Progressive disclosure: the header and the WAITING region lead; the rest
 * streams below. The composer stays directly under it (sticky on a phone).
 * Secondary actions are text links, not buttons (IA §5.1). No quick-nav
 * strip — the one top bar, the station links and the conversation carry
 * navigation.
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
      className="mx-auto flex w-full max-w-3xl flex-col gap-2"
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
  const [t, tProf, head, avatar] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("professions"),
    loadTodayHead(),
    getOwnAvatar(),
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
    <div
      data-testid="today-screen"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8"
    >
      {/* 1 · HEADER — who, what they do, where today stands. */}
      <header data-testid="today-header" className="flex items-center gap-4 sm:gap-5">
        <PersonPortrait
          name={head.displayName ?? t("headerNoName")}
          avatarUrl={avatar.signedUrl}
          initials={playerInitials(head.displayName ?? "")}
          width="64px"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-support font-medium text-brand-blue">{t("eyebrow")}</p>
          <h1 className="font-display text-title font-bold tracking-tightest text-text-primary sm:text-title-lg">
            {head.displayName ?? t("headerNoName")}
          </h1>
          <p className="text-support text-text-secondary" data-testid="today-profession">
            {professionLabel ?? t("professionUnknown")}
          </p>
          <Suspense fallback={<Reading label={t("reading")} />}>
            <TodayStateLine locale={locale} />
          </Suspense>
        </div>
      </header>

      {/* 2 · WAITING FOR YOU · 3 · RUNNING NOW · 4 · BECAUSE · 5 · OUTSIDE —
          one loader each, so each region streams on its own and a slow
          journal never holds the others back. */}
      <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
        <HomeWaiting locale={locale} />
      </Suspense>
      <Suspense fallback={<HomeRegionPending label={t("reading")} />}>
        <HomeRunning locale={locale} />
      </Suspense>
      <Suspense fallback={null}>
        <HomeBecause locale={locale} />
      </Suspense>
      <Suspense fallback={null}>
        <HomeOutside />
      </Suspense>

      {/* 6 · STATIONS — the contextual workspaces as text links, one tap. */}
      <nav
        aria-label={t("stations.title")}
        data-testid="today-stations"
        className="flex flex-col gap-1 border-t border-ink-600 pt-6"
      >
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("stations.title")}
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-0">
          {TODAY_STATIONS.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href as "/dashboard"}
                data-testid={`today-station-${s.id}`}
                className="inline-flex min-h-11 items-center text-body text-text-primary underline-offset-4 hover:text-brand-blue hover:underline"
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

/** Today's state under the name — from the SAME journal read the work
 *  section streams (request-cached), so the header and the figures can
 *  never disagree. */
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
    <p
      className="text-support text-text-secondary"
      data-testid="today-state"
      data-state={state.kind}
    >
      {text}
    </p>
  );
}

/** The honest streaming placeholder: a sentence that says a read is in
 *  progress — never an empty box that reads as "nothing here". */
function Reading({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="text-support text-text-muted">
      {label}
    </p>
  );
}
