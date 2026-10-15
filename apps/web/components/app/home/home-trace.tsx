import { getTranslations } from "next-intl/server";

import { Region, Unreadable, retryLabels } from "@/components/app/home/home-regions";
import { TraceMark, TraceStepNode } from "@/components/app/home/trace-step-node";
import { loadConsequenceTrace } from "@/lib/home/consequence-trace-server";
import {
  traceReachedLivingCv,
  type ConsequenceTrace,
  type TraceItem,
  type TraceStep,
} from "@/lib/home/consequence-trace";
import { traceStepText, traceStepTone, type TraceCopyDeps } from "@/lib/home/consequence-trace-copy";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";

/**
 * KAS PASIKEITĖ — the consequence trace on the home (Future Experience A,
 * owner decision 2026-10-14): "what I did → what changed → what it opened",
 * drawn from `loadConsequenceTrace` (F0) and nothing else.
 *
 * One chain per row: the source fact first, then each step in the order it
 * happened, each step a word in a shape whose FORM says what kind of fact it
 * is — never colour alone:
 *
 *   fact     solid frame                       (recorded, decided, state)
 *   pending  dashed frame + open ring          (waiting for a second party)
 *   derived  frame + diamond, labelled derived (Living CV, matching)
 *
 * Green appears ONLY on a decision someone other than the person made
 * (a second party stands behind it) — the trust-accent rule. A chain that
 * reached the Living CV gets the one quiet celebration: the existing
 * `ua-confirmed` motion on that node (the motion system reserves it for a
 * REAL confirmation; it collapses under reduced motion).
 *
 * Honest states: a failed read is named with a retry (never an empty list);
 * nothing in the window is said once, calmly, with the door to the journal.
 */

const NOTE = "text-support text-text-secondary";

/** `surface="cv"`: the SAME trace on the Living CV (Future Experience B) —
 *  only the journal chains (the work that feeds the CV), no region number,
 *  its own test id. One reader, one wording, one component everywhere. */
export async function HomeTrace({
  locale,
  surface = "home",
}: {
  readonly locale: ActiveLocale;
  readonly surface?: "home" | "cv";
}) {
  return <HomeTraceView locale={locale} trace={await loadConsequenceTrace()} surface={surface} />;
}

export async function HomeTraceView({
  locale,
  trace: input,
  surface = "home",
}: {
  readonly locale: ActiveLocale;
  readonly trace: ConsequenceTrace;
  readonly surface?: "home" | "cv";
}) {
  // On the Living CV only the work chains belong; bookings and other state
  // changes stay on the home.
  const trace: ConsequenceTrace =
    surface === "cv" && input.kind === "known"
      ? { ...input, items: input.items.filter((i) => i.origin === "journal"), eventsUnknown: false }
      : input;
  const regionIndex = surface === "cv" ? "" : "02";
  const regionTestId = surface === "cv" ? "cv-trace" : "home-trace";
  const [t, tChain, tTypes, tRole, tSkill] = await Promise.all([
    getTranslations("homeTrace"),
    getTranslations("homeRegions.chain"),
    getTranslations("auth.notifications.types"),
    getTranslations("journal.entry.confirmerRole"),
    getTranslations("skillNames"),
  ]);
  const rl = await retryLabels();
  const fmtHours = (h: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const skillName = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const roleName = (role: string | null) => (role && tRole.has(role) ? tRole(role) : t("roleUnknown"));
  const when = (iso: string) => formatUtcDate(iso.slice(0, 10), locale) ?? "—";

  const allLink = (
    <Link
      href="/dashboard/activity"
      data-testid="home-trace-all"
      className="inline-flex min-h-11 items-center text-support text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
    >
      {t("all")}
    </Link>
  );

  if (trace.kind === "unknown") {
    return (
      <Region id="trace" index={regionIndex} title={t("title")} state="unknown" testId={regionTestId} aside={allLink}>
        <Unreadable text={t("unknown")} testid="home-trace-unknown" labels={rl} />
      </Region>
    );
  }

  const copy: TraceCopyDeps = {
    t: (k, v) => t(k, v),
    chain: (k) => tChain(k),
    role: roleName,
    skill: skillName,
    number: fmtHours,
  };

  function stepNode(step: TraceStep, i: number, celebrate: boolean) {
    const tone = traceStepTone(step);
    return (
      <TraceStepNode
        tone={tone}
        text={traceStepText(step, copy)}
        celebrate={celebrate}
        style={{ animationDelay: `${i * 90}ms` }}
        testId={step.kind === "living_cv" ? "home-trace-cv" : step.kind === "matching" ? "home-trace-matching" : undefined}
        extra={
          step.kind === "reviewed"
            ? {
                "data-decision": step.decision,
                "data-self-only": step.decision === "approved" && step.selfOnly ? "true" : undefined,
              }
            : undefined
        }
      />
    );
  }

  const title = (item: TraceItem) =>
    item.title.kind === "entry"
      ? item.title.text || t("entryUntitled")
      : tTypes.has(item.title.renderedType)
        ? tTypes(item.title.renderedType)
        : tTypes("generic");

  const flags: string[] = [];
  if (trace.journalUnknown) flags.push(t("journalUnknown"));
  if (trace.eventsUnknown) flags.push(t("eventsUnknown"));

  return (
    <Region id="trace" index={regionIndex} title={t("title")} state="known" testId={regionTestId} aside={allLink}>
      {trace.items.length === 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-testid="home-trace-empty">
          <p className={NOTE}>{t("empty")}</p>
          <Link
            href="/dashboard/journal"
            className="inline-flex min-h-11 items-center text-support text-text-primary underline-offset-4 hover:underline"
          >
            {t("openJournal")}
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-ink-600/60" data-testid="home-trace-items">
          {trace.items.map((item) => {
            const reached = traceReachedLivingCv(item);
            return (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0" data-origin={item.origin} data-reached-cv={reached ? "true" : undefined}>
                <Link
                  href={item.href as "/dashboard"}
                  className="group -mx-2 flex flex-col gap-2 rounded-control px-2 py-1 transition-colors hover:bg-ink-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid={`home-trace-${item.origin}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-body font-medium text-text-primary">{title(item)}</span>
                    <span className="shrink-0 font-mono text-meta tabular-nums text-text-muted">{when(item.at)}</span>
                  </span>
                  {/* THE CHAIN — steps in the order they happened. A phone
                      reads it as a column with a rail; wider screens as one
                      wrapping line with arrows. */}
                  <ol className="relative flex flex-col gap-1.5 pl-4 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-ink-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5 sm:gap-y-1.5 sm:pl-0 sm:before:hidden">
                    {item.steps.map((step, i) => (
                      <li key={`${item.id}-${i}`} className="flex min-w-0 items-center gap-1.5">
                        {i > 0 ? (
                          <span aria-hidden className="hidden text-text-muted sm:inline">
                            →
                          </span>
                        ) : null}
                        {stepNode(step, i, reached && step.kind === "living_cv")}
                      </li>
                    ))}
                  </ol>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {flags.length > 0 ? (
        <div className="border-t border-ink-600/60 pt-3">
          <Unreadable text={flags.join(" ")} testid="home-trace-partial" labels={rl} />
        </div>
      ) : null}
      {trace.truncated ? (
        <p className="text-meta text-text-muted" data-testid="home-trace-truncated">
          {t("truncated")}
        </p>
      ) : null}

      {/* What each shape means — the shapes are the legend, never colour alone. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-muted" data-testid="home-trace-legend">
        <span className="inline-flex items-center gap-1.5">
          <TraceMark tone="fact" />
          {t("legend.fact")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TraceMark tone="pending" />
          {t("legend.pending")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TraceMark tone="derived" />
          {t("legend.derived")}
        </span>
      </p>
    </Region>
  );
}
