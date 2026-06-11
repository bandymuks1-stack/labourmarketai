import { getTranslations } from "next-intl/server";
import {
  CheckCircle2,
  ClipboardCheck,
  Hourglass,
  NotebookPen,
  Sparkles,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { getTodayScreen } from "@/lib/worker/today-screen";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { CountUp } from "@/components/app/today/count-up";
import { SkillIcon } from "@/components/app/today/skill-icon";

/**
 * Worker "šiandienos ekranas" (TASK 07 slice design-soul-scouting-ui-v1).
 * DESIGN_SOUL §2 applied by construction:
 *
 *   3 sekundžių — one big card answers "ką darau DABAR ir ką už tai gaunu".
 *   Žmogaus kalbos — copy speaks like a good foreman, never like a system.
 *   Kito žingsnio — every state ends in exactly ONE natural next step.
 *   Ramybės — icons over text; confirmed things glow quietly, nothing pulses
 *             for attention; pending review is information, not an alarm.
 *   Augimo — the week numbers + the one real growth suggestion show the
 *             record visibly growing from each confirmed entry.
 *
 * Honesty: every number is a real RLS-scoped count from the worker's own
 * journal chain (lib/worker/today-screen); no euros (no pay data exists), no
 * fake matching/score/demand claims; empty states are real empty states.
 */
export async function TodayScreen({ workerId }: { workerId: string | null }) {
  const [data, playerCard] = await Promise.all([
    getTodayScreen(workerId),
    getWorkerPlayerCard(),
  ]);
  const t = await getTranslations("todayScreen");
  const tSkill = await getTranslations("skillNames");

  const hasEntryToday = data.entriesToday > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="worker-today-screen">
      {/* ── 1 · ŠIANDIENOS VEIKSMAS — the one big move of the day ── */}
      <section
        className="card-border wow-card rise-in flex flex-col gap-3 p-6 sm:p-7"
        data-testid="today-action-card"
      >
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          <NotebookPen className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        {hasEntryToday ? (
          <>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tightest text-text-primary">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-state-success" aria-hidden />
              {t("action.doneTitle")}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
              {t("action.doneBody")}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
              {t("action.title")}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
              {t("action.body")}
            </p>
          </>
        )}
        {data.pendingReview > 0 ? (
          <p
            className="flex items-center gap-2 text-xs leading-relaxed text-text-secondary"
            data-testid="today-pending-review"
          >
            <Hourglass className="h-3.5 w-3.5 shrink-0 text-state-warning" aria-hidden />
            {t("action.pending", { n: data.pendingReview })}
          </p>
        ) : null}
        <Link
          href={"/dashboard/journal" as "/dashboard"}
          data-testid="today-action-cta"
          className="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-3 text-sm font-semibold text-ink-900 transition-transform duration-fast ease-out hover:-translate-y-0.5"
        >
          {hasEntryToday ? t("action.ctaAgain") : t("action.cta")} →
        </Link>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ── 2 · SAVAITĖS SITUACIJA — real confirmed work, no euros ── */}
        <section
          className="card-border glow-hover flex flex-col gap-3 p-5"
          data-testid="week-situation-card"
        >
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
            {t("week.eyebrow")}
          </span>
          <h3 className="font-display text-base font-semibold leading-snug text-text-primary">
            {data.weekConfirmedEntries > 0
              ? t("week.confirmedHeadline", { n: data.weekConfirmedEntries })
              : data.weekEntries > 0
                ? t("week.writtenHeadline", { n: data.weekEntries })
                : t("week.emptyHeadline")}
          </h3>
          <dl className="mt-auto flex flex-wrap gap-x-6 gap-y-3">
            <div className="flex flex-col">
              <CountUp
                text={String(data.weekEntries)}
                className="font-mono text-2xl font-bold tracking-tightest text-text-primary"
              />
              <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("week.entries")}
              </dt>
            </div>
            <div className="flex flex-col">
              <CountUp
                text={String(data.weekConfirmedEntries)}
                className={`font-mono text-2xl font-bold tracking-tightest ${
                  data.weekConfirmedEntries > 0
                    ? "text-trust-accent"
                    : "text-text-primary"
                }`}
              />
              <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("week.confirmed")}
              </dt>
            </div>
            {/* Hours appear ONLY when explicit durations were recorded on
                confirmed entries — never a fabricated 0h (Realumo). */}
            {data.weekConfirmedHours !== null ? (
              <div className="flex flex-col" data-testid="week-confirmed-hours">
                <span className="font-mono text-2xl font-bold tracking-tightest text-text-primary">
                  {data.weekConfirmedHours}
                </span>
                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("week.hours")}
                </dt>
              </div>
            ) : null}
          </dl>
        </section>

        {/* ── 3 · KELIAS Į DAUGIAU — one REAL taxonomy suggestion or an
               honest premium empty state. No salary promises, no fake demand. ── */}
        <section
          className="card-border glow-hover flex flex-col gap-3 p-5"
          data-testid="skill-path-card"
        >
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("path.eyebrow")}
          </span>
          {data.skillSuggestion ? (
            <>
              <h3 className="flex items-center gap-2 font-display text-base font-semibold leading-snug text-text-primary">
                <SkillIcon
                  slug={null}
                  className="h-4 w-4 shrink-0 text-brand-blue"
                />
                {tSkill.has(data.skillSuggestion.slug)
                  ? tSkill(data.skillSuggestion.slug)
                  : data.skillSuggestion.slug.replace(/-/g, " ")}
              </h3>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t("path.body")}
              </p>
              <Link
                href={"/dashboard/profile" as "/dashboard"}
                data-testid="skill-path-cta"
                className="mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10"
              >
                {t("path.cta")} →
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t("path.empty")}
              </p>
              <Link
                href={"/dashboard/profile" as "/dashboard"}
                data-testid="skill-path-cta"
                className="mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-ink-500 px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-ink-700"
              >
                {t("path.emptyCta")} →
              </Link>
            </>
          )}
        </section>
      </div>

      {/* ── 4 · PLAYER CARD — the scouting card of the real person ── */}
      {playerCard ? (
        <WorkerPlayerCard
          card={playerCard}
          labels={await buildPlayerCardLabels(playerCard)}
        />
      ) : null}
    </div>
  );
}
