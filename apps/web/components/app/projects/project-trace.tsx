import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { TraceChainList } from "@/components/app/home/home-trace";
import { Region, Unreadable, retryLabels } from "@/components/app/home/region-frame";
import { TraceMark, TraceStepNode } from "@/components/app/home/trace-step-node";
import type { TraceItem, TraceStep } from "@/lib/home/consequence-trace";
import { traceStepText, traceStepTone, type TraceCopyDeps } from "@/lib/home/consequence-trace-copy";
import type { ProjectTrace } from "@/lib/projects/project-trace";
import type { TraceStepTone } from "@/lib/home/consequence-trace-copy";
import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";

/**
 * KAS PASIKEITĖ PROJEKTE — the project's consequence trace (Future
 * Experience C over the F0 chain model). The SAME shapes, wording and row
 * markup as the home and the Living CV; only the scope is the project.
 *
 *   manager  the team's chain as counts (recorded → waiting → confirmed →
 *            Living CV) + the project's own facts. No names, no entry text.
 *   member   their own chains on this project + the project's own facts.
 *
 * Nothing in the window is said once, calmly; a failed read is named.
 */
const NOTE = "text-support text-text-secondary";

function Step({ tone, text, testId }: { readonly tone: TraceStepTone; readonly text: string; readonly testId: string }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5">
      <TraceStepNode tone={tone} text={text} testId={testId} />
    </li>
  );
}

export async function ProjectTraceRegion({
  trace,
  locale,
  reviewHref,
}: {
  readonly trace: ProjectTrace;
  readonly locale: string;
  /** Manager: where the waiting entries are reviewed (an existing route). */
  readonly reviewHref?: string;
}) {
  const [t, tHome, tChain, tRole, tSkill] = await Promise.all([
    getTranslations("projectTrace"),
    getTranslations("homeTrace"),
    getTranslations("homeRegions.chain"),
    getTranslations("journal.entry.confirmerRole"),
    getTranslations("skillNames"),
  ]);
  const rl = await retryLabels();
  const frame = (state: "known" | "unknown", aside: ReactNode, body: ReactNode) => (
    <Region id="trace" index="" title={t("title")} state={state} testId="project-trace" aside={aside}>
      {body}
    </Region>
  );

  if (trace.kind === "unknown") {
    return frame("unknown", null, <Unreadable text={t("unknown")} testid="project-trace-unknown" labels={rl} />);
  }

  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const when = (iso: string) => formatUtcDate(iso.slice(0, 10), locale) ?? "—";
  const copy: TraceCopyDeps = {
    t: (k, v) => tHome(k, v),
    chain: (k) => tChain(k),
    role: (role) => (role && tRole.has(role) ? tRole(role) : tHome("roleUnknown")),
    skill: (slug) => (tSkill.has(slug) ? tSkill(slug) : slug),
    number: fmt,
  };
  const stepNode = (step: TraceStep, i: number, celebrate: boolean) => (
    <TraceStepNode
      tone={traceStepTone(step)}
      text={traceStepText(step, copy)}
      celebrate={celebrate}
      style={{ animationDelay: `${i * 90}ms` }}
    />
  );
  const title = (item: TraceItem) =>
    item.title.kind === "entry" ? item.title.text || tHome("entryUntitled") : tHome("entryUntitled");

  const team = trace.team;
  const flags: string[] = [];
  if (trace.journalUnknown) flags.push(t("journalUnknown"));
  if (trace.stagesUnknown) flags.push(t("stagesUnknown"));
  if (trace.tasksUnknown) flags.push(t("tasksUnknown"));

  const aside =
    trace.audience === "manager" && reviewHref && team && team.awaiting > 0 ? (
      <Link
        href={reviewHref as "/dashboard"}
        data-testid="project-trace-review"
        className="inline-flex min-h-11 items-center text-support font-medium text-brand-blue underline-offset-4 hover:underline"
      >
        {t("review", { count: team.awaiting })}
      </Link>
    ) : null;

  return frame(
    "known",
    aside,
    <>
      {trace.quiet ? null : <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("window")}</p>}

      {trace.quiet ? (
        <p className={NOTE} data-testid="project-trace-empty">
          {trace.audience === "manager" ? t("emptyManager") : t("emptyMember")}
        </p>
      ) : null}

      {/* THE TEAM'S CHAIN — counts only (manager). */}
      {team && team.recorded > 0 ? (
        <ol
          className="relative flex flex-col gap-1.5 pl-4 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-ink-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5 sm:gap-y-1.5 sm:pl-0 sm:before:hidden"
          data-testid="project-trace-team"
          aria-label={t("teamLabel")}
        >
          <Step tone="fact" text={t("team.recorded", { count: team.recorded })} testId="project-trace-recorded" />
          {team.awaiting > 0 ? (
            <Step tone="pending" text={t("team.awaiting", { count: team.awaiting })} testId="project-trace-awaiting" />
          ) : null}
          {team.returned > 0 ? (
            <Step tone="negative" text={t("team.returned", { count: team.returned })} testId="project-trace-returned" />
          ) : null}
          {team.confirmed === null ? (
            <Step tone="fact" text={t("team.confirmedUnknown")} testId="project-trace-confirmed-unknown" />
          ) : team.confirmed > 0 ? (
            <>
              <Step tone="confirmed" text={t("team.confirmed", { count: team.confirmed })} testId="project-trace-confirmed" />
              <Step tone="derived" text={t("team.livingCv")} testId="project-trace-cv" />
            </>
          ) : null}
        </ol>
      ) : null}

      {/* THE MEMBER'S OWN CHAINS on this project. */}
      {trace.mine.length > 0 ? (
        <TraceChainList items={trace.mine} title={title} when={when} stepNode={stepNode} />
      ) : null}

      {/* THE PROJECT'S OWN FACTS. */}
      {trace.stagesDone.length > 0 || trace.tasksDone > 0 ? (
        <ul className="flex flex-col gap-1.5" data-testid="project-trace-facts">
          {trace.stagesDone.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2 text-support text-text-primary">
                <TraceMark tone="fact" />
                <span className="truncate">{t("stageDone", { name: s.name })}</span>
              </span>
              <span className="shrink-0 font-mono text-meta tabular-nums text-text-muted">{when(s.day)}</span>
            </li>
          ))}
          {trace.tasksDone > 0 ? (
            <li className="inline-flex items-center gap-2 text-support text-text-primary" data-testid="project-trace-tasks-done">
              <TraceMark tone="fact" />
              {t("tasksDone", { count: trace.tasksDone })}
            </li>
          ) : null}
        </ul>
      ) : null}

      {flags.length > 0 ? (
        <div className="border-t border-ink-600/60 pt-3">
          <Unreadable text={flags.join(" ")} testid="project-trace-partial" labels={rl} />
        </div>
      ) : null}
      {trace.truncated ? <p className="text-meta text-text-muted">{t("truncated")}</p> : null}

      {trace.quiet ? null : (
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-muted" data-testid="project-trace-legend">
        <span className="inline-flex items-center gap-1.5">
          <TraceMark tone="fact" />
          {tHome("legend.fact")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TraceMark tone="pending" />
          {tHome("legend.pending")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TraceMark tone="derived" />
          {tHome("legend.derived")}
        </span>
      </p>
      )}
    </>,
  );
}
