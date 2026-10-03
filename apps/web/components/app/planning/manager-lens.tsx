import { getTranslations } from "next-intl/server";

import { EpistemicMark } from "@/components/app/planning/epistemic-mark";
import { PeopleInTime } from "@/components/app/planning/people-in-time";
import { ProjectsInTime } from "@/components/app/planning/projects-in-time";
import { PersonFocus, ProjectFocus } from "@/components/app/planning/time-focus";
import { getAvatarForVisibleWorker } from "@/lib/profile/avatar";
import { getEmployerWorkerAvailability } from "@/lib/planning/employer-availability";
import { getRosterCommitments } from "@/lib/planning/roster-commitments";
import { getPlanning } from "@/lib/planning/planning";
import { parseIsoDay } from "@/lib/planning/planning-model";
import {
  buildRosterTimeline,
  mondayOf,
  shiftDay,
  type RosterTimeline,
} from "@/lib/planning/roster-timeline-model";
import {
  buildProjectsInTime,
  lensHref,
  type TimeFocus,
  type TimeLens,
} from "@/lib/planning/time-lens";
import { getWorkforce } from "@/lib/workforce/workforce";
import { buildPlanningZoneView } from "@/lib/workforce/planning-zone-view";
import { PROFESSION_SKILLS } from "@/lib/taxonomy/profession-skills";

/** The window both manager perspectives share: four weeks, moved by whole windows. */
export const WORK_IN_TIME_DAYS = 28;
/** Photos are looked up per person under the viewer's own session; bounded. */
const AVATAR_LIMIT = 60;

/**
 * The manager perspectives (PEOPLE IN TIME / PROJECTS IN TIME) of
 * /dashboard/planning.
 *
 * DATA SOURCES — all existing, RLS-scoped, read-only (no new read, no new
 * store):
 *   roster        getWorkforce()                  the company's assigned workers
 *   commitments   getRosterCommitments()          project assignments, accepted bookings, trips
 *   leave         getEmployerWorkerAvailability() approved absences — dates only, never the reason
 *   projects      getPlanning() items             project bands + dated stages
 *   needs         getWorkforce() entries via buildPlanningZoneView (stated headcount vs covered)
 *   photos        getAvatarForVisibleWorker()     the one photo rule; else initials
 *
 * Every source degrades on its own: a failed read is UNKNOWN, never an empty
 * lane that would read as "free".
 */
export async function ManagerLens({
  lens,
  locale,
  today,
  rawDate,
  focus,
}: {
  readonly lens: Exclude<TimeLens, "me">;
  readonly locale: string;
  readonly today: string;
  readonly rawDate: string | undefined;
  readonly focus: TimeFocus | null;
}) {
  const t = await getTranslations("workInTime");
  const from = mondayOf(parseIsoDay(rawDate) ?? today);
  const to = shiftDay(from, WORK_IN_TIME_DAYS - 1);

  const workforce = await getWorkforce();
  if (workforce.status === "not-authed") {
    return (
      <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted" data-testid="wit-not-authed">
        {t("notAuthed")}
      </p>
    );
  }
  const rosterWorkerIds = workforce.workers.map((w) => w.workerId);

  // The roster-dependent reads and the project read travel together.
  const [commitments, availability, planning] = await Promise.all([
    getRosterCommitments(rosterWorkerIds),
    getEmployerWorkerAvailability(),
    lens === "projects" ? getPlanning({ rangeStart: from, rangeEnd: to }) : null,
  ]);

  if (workforce.sources.workers.status === "error" || commitments.status !== "ok") {
    return (
      <p role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary" data-testid="wit-roster-unknown">
        <EpistemicMark state="unknown" label={t("state.unknown")} />
        {t("roster.unknown")}
      </p>
    );
  }

  const absenceReadFailed = availability.status !== "ok";
  const timeline: RosterTimeline = buildRosterTimeline({
    rows: commitments.rows,
    absences:
      availability.status === "ok"
        ? availability.unavailability.map((u) => ({
            workerId: u.workerId,
            workerName: u.workerName,
            sourceId: u.item.id,
            startDate: u.item.startDate,
            endDate: u.item.endDate,
          }))
        : [],
    from,
    days: WORK_IN_TIME_DAYS,
    today,
  });

  const hrefFor = (opts: { date?: string | null; focus?: TimeFocus | null; anchor?: string }) =>
    lensHref({
      lens,
      date: opts.date === undefined ? from : opts.date,
      today,
      focus: opts.focus ?? null,
      anchor: opts.anchor,
    });
  const nav = {
    prev: hrefFor({ date: shiftDay(from, -WORK_IN_TIME_DAYS), focus }),
    next: hrefFor({ date: shiftDay(from, WORK_IN_TIME_DAYS), focus }),
    today: hrefFor({ date: null, focus }),
  };
  const closeHref = hrefFor({ focus: null });
  const anchorDate = today >= from && today <= to ? today : from;

  // Photos: only for the people drawn, under the viewer's own session.
  const avatarIds = timeline.people.slice(0, AVATAR_LIMIT).map((p) => p.workerId);
  const avatars: Record<string, string | null> = Object.fromEntries(
    await Promise.all(avatarIds.map(async (id) => [id, await getAvatarForVisibleWorker(id)] as const)),
  );

  if (lens === "people") {
    const focused = focus?.kind === "person" ? timeline.people.find((p) => p.workerId === focus.id) : undefined;
    return (
      <div className="flex flex-col gap-6">
        {focused ? (
          <PersonFocus
            person={focused}
            avatarUrl={avatars[focused.workerId] ?? null}
            today={today}
            locale={locale}
            closeHref={closeHref}
            anchorDate={anchorDate}
          />
        ) : null}
        <PeopleInTime
          timeline={timeline}
          avatars={avatars}
          today={today}
          locale={locale}
          focusWorkerId={focused?.workerId ?? null}
          absenceReadFailed={absenceReadFailed}
          withoutRecord={commitments.withoutCommitment}
          hrefs={{
            ...nav,
            person: (workerId) => hrefFor({ focus: { kind: "person", id: workerId }, anchor: "wit-focus" }),
          }}
        />
      </div>
    );
  }

  // PROJECTS IN TIME
  const zone = buildPlanningZoneView({
    entries: workforce.entries,
    plans: workforce.plans,
    workers: workforce.workers,
    assignments: workforce.assignments,
    brigades: workforce.brigades,
    sources: workforce.sources,
    catalog: { professions: Object.keys(PROFESSION_SKILLS), professionSkills: PROFESSION_SKILLS },
  });
  const zoneEntries = [...zone.months.flatMap((m) => m.entries), ...zone.undated];
  const items = planning && planning.status === "ok" ? planning.items : [];
  const model = buildProjectsInTime({ items, timeline, entries: zoneEntries, today });
  const planningUnknown = planning === null || planning.status !== "ok";
  const focused = focus?.kind === "project" ? model.projects.find((p) => p.projectId === focus.id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {planningUnknown ? (
        <p role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-ink-500 px-3 py-2 text-sm text-text-secondary" data-testid="wit-projects-unknown">
          <EpistemicMark state="unknown" label={t("state.unknown")} />
          {t("projects.unknown")}
        </p>
      ) : null}
      {focused ? (
        <ProjectFocus
          project={focused}
          avatars={avatars}
          locale={locale}
          closeHref={closeHref}
          anchorDate={anchorDate}
          personHref={(workerId) => `/dashboard/people/${workerId}?from=planning&date=${anchorDate}`}
        />
      ) : null}
      <ProjectsInTime
        model={model}
        timeline={timeline}
        today={today}
        locale={locale}
        focusProjectId={focused?.projectId ?? null}
        hrefs={{
          ...nav,
          project: (projectId) => hrefFor({ focus: { kind: "project", id: projectId }, anchor: "wit-focus" }),
        }}
      />
    </div>
  );
}
