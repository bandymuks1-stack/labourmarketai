import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { EpistemicMark } from "@/components/app/planning/epistemic-mark";
import { playerInitials } from "@/lib/identity/player-identity";
import { createUtcFormatter } from "@/lib/time/display";
import type { TimelinePerson } from "@/lib/planning/roster-timeline-model";
import { epistemicForBar, type ProjectInTime } from "@/lib/planning/time-lens";

/**
 * THE FOCUS — what you selected, and the doors out of it.
 *
 * Selecting a person or a project in a perspective keeps the context (the
 * perspective, the window and the selection stay in the URL) and offers the
 * real routes: the PERSON page, the TEAM roster, the PROJECT and its
 * operations centre, the JOURNAL day, the CONVERSATIONS list. Nothing here is
 * a second detail page — it is a short statement of what the axis shows for
 * the selection, then the way to the record itself.
 */

const door =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const doorPrimary = `${door} border-brand-blue/50 text-brand-blue hover:bg-brand-blue/10`;
const doorQuiet = `${door} border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary`;

/** Carries the time context into the target (extra query is ignored by pages
 *  that do not read it; the journal reads `date` for real). */
function ctx(path: string, date: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}from=planning&date=${date}`;
}

export async function PersonFocus({
  person,
  avatarUrl,
  today,
  locale,
  closeHref,
  anchorDate,
}: {
  readonly person: TimelinePerson;
  readonly avatarUrl: string | null;
  readonly today: string;
  readonly locale: string;
  readonly closeHref: string;
  readonly anchorDate: string;
}) {
  const t = await getTranslations("workInTime");
  const fmt = createUtcFormatter(locale, { day: "numeric", month: "short" });
  const name = person.name ?? t("people.unnamed");
  return (
    <aside
      id="wit-focus"
      className="flex flex-col gap-4 rounded-2xl border border-brand-blue/30 bg-gradient-to-b from-surface-1/80 to-surface-1/20 p-4 sm:p-5"
      aria-label={t("focus.person", { name })}
      data-testid="wit-focus-person"
    >
      <div className="flex items-center gap-4">
        <PersonPortrait name={name} avatarUrl={avatarUrl} initials={playerInitials(person.name ?? "?")} width="64px" lit />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-support font-medium text-text-muted">{t("focus.selected")}</span>
          <span className="font-display text-xl font-bold leading-tight tracking-tightest text-text-primary">{name}</span>
        </div>
        <Link href={closeHref as "/dashboard"} className={doorQuiet} data-testid="wit-focus-close">
          {t("focus.close")}
        </Link>
      </div>

      {person.bars.length > 0 ? (
        <ul className="flex flex-col divide-y divide-ink-600/70 border-y border-ink-600/70">
          {person.bars.map((b) => {
            const state = epistemicForBar(b, today);
            const pid = b.kind === "project" ? b.key.slice("project:".length) : null;
            const body = (
              <>
                <EpistemicMark state={state} label={t(`state.${state}`)} />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {b.kind === "absence" ? t("people.away") : (b.label ?? t(`people.kind.${b.kind}`))}
                </span>
                <span className="shrink-0 tabular-nums text-support text-text-muted">
                  {b.startDate === b.endDate ? fmt(b.startDate) : `${fmt(b.startDate)} – ${fmt(b.endDate)}`}
                </span>
                {b.conflict ? <span className="shrink-0 text-support font-medium text-state-danger">{t("people.overlap")}</span> : null}
              </>
            );
            return (
              <li key={b.key} data-testid={`wit-focus-bar-${b.key}`}>
                {pid ? (
                  <Link
                    href={ctx(`/dashboard/projects/${pid}`, b.startDate > today ? b.startDate : today) as "/dashboard"}
                    className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <EpistemicMark state="unknown" label={t("state.unknown")} />
          {t("focus.nothingOnRecord")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={ctx(`/dashboard/people/${person.workerId}`, anchorDate) as "/dashboard"} className={doorPrimary} data-testid="wit-door-person">
          {t("focus.openPerson")} →
        </Link>
        <Link href={"/dashboard/company/people" as "/dashboard"} className={doorQuiet} data-testid="wit-door-team">
          {t("focus.openTeam")}
        </Link>
        <Link href={"/dashboard/communication" as "/dashboard"} className={doorQuiet} data-testid="wit-door-conversations">
          {t("focus.openConversations")}
        </Link>
      </div>
    </aside>
  );
}

export async function ProjectFocus({
  project,
  avatars,
  locale,
  closeHref,
  personHref,
  anchorDate,
}: {
  readonly project: ProjectInTime;
  readonly avatars: Readonly<Record<string, string | null>>;
  readonly locale: string;
  readonly closeHref: string;
  readonly personHref: (workerId: string) => string;
  readonly anchorDate: string;
}) {
  const t = await getTranslations("workInTime");
  const fmt = createUtcFormatter(locale, { day: "numeric", month: "short" });
  const label = project.label ?? t("projects.untitled");
  const people = [...new Map(project.staffed.map((p) => [p.workerId, p])).values()];
  return (
    <aside
      id="wit-focus"
      className="flex flex-col gap-4 rounded-2xl border border-brand-blue/30 bg-gradient-to-b from-surface-1/80 to-surface-1/20 p-4 sm:p-5"
      aria-label={t("focus.project", { name: label })}
      data-testid="wit-focus-project"
    >
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-support font-medium text-text-muted">{t("focus.selected")}</span>
          <span className="font-display text-xl font-bold leading-tight tracking-tightest text-text-primary">{label}</span>
          <span className="flex flex-wrap items-center gap-2">
            <EpistemicMark state={project.state} label={t(`state.${project.state}`)} />
            <span className="text-support tabular-nums text-text-muted">
              {project.startDate ? `${fmt(project.startDate)} – ${fmt(project.endDate ?? project.startDate)}` : t("projects.noDates")}
            </span>
          </span>
        </div>
        <Link href={closeHref as "/dashboard"} className={doorQuiet} data-testid="wit-focus-close">
          {t("focus.close")}
        </Link>
      </div>

      {project.stages.length > 0 ? (
        <ul className="flex flex-col divide-y divide-ink-600/70 border-y border-ink-600/70">
          {project.stages.map((s) => (
            <li key={s.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <EpistemicMark state={s.state} label={t(`state.${s.state}`)} />
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{s.label ?? t("projects.stage")}</span>
              <span className="shrink-0 tabular-nums text-support text-text-muted">
                {fmt(s.startDate)} – {fmt(s.endDate)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <EpistemicMark state="notProvided" label={t("state.notProvided")} />
          {t("projects.noStages")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-support font-medium text-text-muted">{t("projects.staffed", { count: people.length })}</span>
        {people.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={p.workerId}>
                <Link
                  href={personHref(p.workerId) as "/dashboard"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink-500 py-1 pl-1 pr-3 text-sm text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <PersonPortrait name={p.name ?? t("people.unnamed")} avatarUrl={avatars[p.workerId] ?? null} initials={playerInitials(p.name ?? "?")} width="32px" shape="round" />
                  <span>{p.name ?? t("people.unnamed")}</span>
                  {p.conflict ? <span className="text-support text-state-danger">{t("people.overlap")}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <EpistemicMark state="unknown" label={t("state.unknown")} />
            {t("projects.noStaffingRecord")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={ctx(`/dashboard/projects/${project.projectId}`, anchorDate) as "/dashboard"} className={doorPrimary} data-testid="wit-door-project">
          {t("focus.openProject")} →
        </Link>
        <Link href={ctx(`/dashboard/projects/${project.projectId}/operations`, anchorDate) as "/dashboard"} className={doorQuiet} data-testid="wit-door-operations">
          {t("focus.openWork")}
        </Link>
        <Link href={"/dashboard/company/people" as "/dashboard"} className={doorQuiet} data-testid="wit-door-team">
          {t("focus.openTeam")}
        </Link>
        <Link href={"/dashboard/communication" as "/dashboard"} className={doorQuiet} data-testid="wit-door-conversations">
          {t("focus.openConversations")}
        </Link>
      </div>
    </aside>
  );
}
