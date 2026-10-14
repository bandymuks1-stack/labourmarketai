import { getTranslations } from "next-intl/server";

import { Region, Unreadable, retryLabels } from "@/components/app/home/home-regions";
import { loadConsequenceTrace } from "@/lib/home/consequence-trace-server";
import {
  traceReachedLivingCv,
  type ConsequenceTrace,
  type TraceItem,
  type TraceSkill,
  type TraceStep,
} from "@/lib/home/consequence-trace";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import { cn } from "@/lib/utils";

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

const NODE =
  "inline-flex min-h-8 max-w-full items-center gap-2 rounded-control border px-2.5 py-1 text-support leading-snug";
const NOTE = "text-support text-text-secondary";

export async function HomeTrace({ locale }: { readonly locale: ActiveLocale }) {
  return <HomeTraceView locale={locale} trace={await loadConsequenceTrace()} />;
}

export async function HomeTraceView({
  locale,
  trace,
}: {
  readonly locale: ActiveLocale;
  readonly trace: ConsequenceTrace;
}) {
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
  const skillList = (skills: readonly TraceSkill[]) => skills.map((s) => skillName(s.slug)).join(", ");

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
      <Region id="trace" index="02" title={t("title")} state="unknown" testId="home-trace" aside={allLink}>
        <Unreadable text={t("unknown")} testid="home-trace-unknown" labels={rl} />
      </Region>
    );
  }

  function stepNode(step: TraceStep, i: number, celebrate: boolean) {
    const delay = { animationDelay: `${i * 90}ms` };
    switch (step.kind) {
      case "recorded":
        return (
          <span className={cn(NODE, "ua-msg-in border-ink-500 text-text-primary")} style={delay} data-basis="fact">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-text-secondary" />
            {step.hours !== null
              ? t("step.recordedHours", { hours: fmtHours(step.hours) })
              : step.dayUnits !== null
                ? t("step.recordedDays", { days: fmtHours(step.dayUnits) })
                : t("step.recordedUntimed")}
          </span>
        );
      case "awaiting_review":
        return (
          <span className={cn(NODE, "ua-msg-in border-dashed border-brand-blue/70 text-text-primary")} style={delay} data-basis="pending">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border-2 border-brand-blue" />
            {t("step.awaiting")}
          </span>
        );
      case "reviewed": {
        if (step.decision === "approved" && step.selfOnly) {
          return (
            <span className={cn(NODE, "ua-msg-in border-ink-500 text-text-primary")} style={delay} data-basis="fact" data-self-only="true">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-text-secondary" />
              {t("step.selfApproved")}
            </span>
          );
        }
        if (step.decision === "approved") {
          return (
            <span className={cn(NODE, "ua-msg-in border-trust-accent/60 text-text-primary")} style={delay} data-basis="fact" data-decision="approved">
              <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-trust-accent">
                <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {step.automatic ? t("step.approvedAutomatic") : t("step.approvedBy", { role: roleName(step.role) })}
            </span>
          );
        }
        return (
          <span className={cn(NODE, "ua-msg-in border-state-warning/60 text-text-primary")} style={delay} data-basis="fact" data-decision={step.decision}>
            <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-state-warning" />
            {step.decision === "rejected" ? t("step.rejected") : t("step.changesRequested")}
          </span>
        );
      }
      case "living_cv":
        return (
          <span
            className={cn(NODE, "ua-msg-in border-brand-cyan/60 text-text-primary", celebrate && "ua-confirmed")}
            style={delay}
            data-basis="derived"
            data-testid="home-trace-cv"
          >
            <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-brand-cyan" />
            <span className="min-w-0">
              {step.skills === null
                ? t("step.cvUnknown")
                : step.unlinked
                  ? t("step.cvUnlinked")
                  : t("step.cv", {
                      skills: skillList(step.skills),
                      entries: step.skills[0]?.confirmedEntries ?? 0,
                      count: step.skills.length,
                    })}
            </span>
          </span>
        );
      case "matching":
        return (
          <span className={cn(NODE, "ua-msg-in border-brand-cyan/60 text-text-primary")} style={delay} data-basis="derived" data-testid="home-trace-matching">
            <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-brand-cyan" />
            <span className="min-w-0">
              {step.skills.some((s) => s.tier === "repeated_confirmed")
                ? t("step.matchingRepeated", { skills: skillList(step.skills) })
                : t("step.matching", { skills: skillList(step.skills) })}
            </span>
          </span>
        );
      case "state_change":
        return (
          <span className={cn(NODE, "ua-msg-in border-ink-500 text-text-primary")} style={delay} data-basis="fact">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-text-secondary" />
            {tChain(`consequence.${step.consequenceKey}`)} · {tChain(`state.${step.stateKey}`)}
          </span>
        );
    }
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
    <Region id="trace" index="02" title={t("title")} state="known" testId="home-trace" aside={allLink}>
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
          <span aria-hidden className="h-2 w-2 rounded-full bg-text-secondary" />
          {t("legend.fact")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full border-2 border-brand-blue" />
          {t("legend.pending")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rotate-45 bg-brand-cyan" />
          {t("legend.derived")}
        </span>
      </p>
    </Region>
  );
}
