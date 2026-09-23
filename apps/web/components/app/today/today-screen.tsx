import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { buttonLinkClassName } from "@/components/ui/Button";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import { deriveTodayNext, deriveTodayState } from "@/lib/today/today-model";
import { TODAY_STATIONS } from "@/lib/today/today-route";
import { loadTodayHead, loadTodayWorkIntelligence } from "@/lib/today/today-server";

import { TodayOpportunitySection } from "./today-opportunity-section";
import { TodayWorkSection } from "./today-work-section";

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
 *   2. next        ONE primary action — the work-card engine's next
 *                  dimension with its own "why", nothing invented
 *   3. work        today · this week · what still needs a figure or a
 *                  look · one growth sentence  (streams: one journal read)
 *   4. world       one opportunity sentence with band counts  (streams)
 *                  — 3's growth sentence and 4 are ABSENT when they have
 *                  nothing to say ("Tuščia = tvarkinga", owner §20); a read
 *                  that failed is still named (`isTodayGrowthShown`,
 *                  `isTodayOpportunityShown` in the pure model)
 *   5. stations    the contextual workspaces, as text links, one tap —
 *                  opportunities (the former PASAULIS tab) first
 *
 * There is no "ask" door any more: the composer IS the door, and the
 * conversation is the home (the former PAKLAUSK tab is retired).
 *
 * Every figure is a reader's figure (`lib/today/today-server.ts`) read
 * through the pure model (`lib/today/today-model.ts`); a reader that could
 * not answer is rendered as "could not read", never as zero (SEP-7).
 *
 * Progressive disclosure: three first-level items above the fold on a
 * 390 px viewport (header, the action, today's work); the rest below.
 * Secondary actions are text links, not buttons (IA §5.1). No quick-nav
 * strip — the one top bar, the station links and the conversation carry
 * navigation.
 */
export async function TodayScreen({ locale }: { locale: ActiveLocale }) {
  const [t, tCard, tProf, head] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("auth.dashboard.workCard"),
    getTranslations("professions"),
    loadTodayHead(),
  ]);
  const next = deriveTodayNext(head.workCard);
  const professionLabel =
    head.professionSlug && tProf.has(head.professionSlug)
      ? tProf(head.professionSlug)
      : null;

  return (
    <div
      data-testid="today-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
    >
      {/* 1 · HEADER — who, what they do, where today stands. */}
      <header data-testid="today-header" className="flex flex-col gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-title font-bold tracking-tightest text-text-primary sm:text-title-lg">
          {head.displayName ?? t("headerNoName")}
        </h1>
        <p className="text-support text-text-secondary" data-testid="today-profession">
          {professionLabel ?? t("professionUnknown")}
        </p>
        <Suspense fallback={<Reading label={t("reading")} />}>
          <TodayStateLine locale={locale} />
        </Suspense>
      </header>

      {/* 2 · THE ONE PRIMARY ACTION. */}
      <section aria-labelledby="today-next-title" data-testid="today-next">
        <Card compact>
          <div className="flex flex-col gap-3">
            <h2
              id="today-next-title"
              className="font-mono text-meta uppercase tracking-label text-text-muted"
            >
              {t("next.title")}
            </h2>
            {next.kind === "action" ? (
              <>
                <p className="text-body text-text-primary">{tCard(`next.${next.dim}`)}</p>
                <p className="text-support text-text-secondary">{tCard(next.whyKey)}</p>
                {next.stale && (
                  <p className="text-support text-text-secondary" data-testid="today-next-stale">
                    {tCard("stale.body")}
                  </p>
                )}
                <Link
                  href={next.href as "/dashboard"}
                  data-testid="today-next-cta"
                  className={`${buttonLinkClassName("primary")} self-start`}
                >
                  {tCard(`next.${next.dim}`)}
                </Link>
              </>
            ) : (
              <p className="text-support text-text-secondary" data-testid="today-next-unknown">
                {t("next.unknown")}
              </p>
            )}
          </div>
        </Card>
      </section>

      {/* 3 · TODAY'S WORK · OPEN ITEMS · ONE GROWTH SENTENCE — one journal
          read, streamed so a slow journal never holds the header back. */}
      <Suspense fallback={<Reading label={t("reading")} />}>
        <TodayWorkSection locale={locale} />
      </Suspense>

      {/* 4 · ONE OPPORTUNITY SENTENCE — the conversation result's own rows. */}
      <Suspense fallback={<Reading label={t("reading")} />}>
        <TodayOpportunitySection />
      </Suspense>

      {/* 5 · STATIONS — the contextual workspaces as text links, one tap. */}
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
