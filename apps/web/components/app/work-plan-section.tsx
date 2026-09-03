import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { WorkPlanCancelButton, WorkPlanForm } from "@/components/app/work-plan-form";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { listManagedProjects } from "@/lib/projects/projects";
import { getEmployerWorkerAvailability, unavailabilityOverlaps } from "@/lib/planning/employer-availability";
import { listPlannableWorkers, listWorkPlanEntries } from "@/lib/planning/work-plan";
import { isWorkPlanOutcome } from "@/lib/planning/work-plan-model";
import { createClient } from "@/lib/supabase/server";
import { formatUtcDate } from "@/lib/time/display";

/**
 * PLANNED WORK section of the workforce planning zone (FINAL COMPLETION
 * Train F1). Managers plan who works where and when; the calendar projects
 * it; the journal keeps what actually happened. Reads: the active
 * organization, its plannable roster, its projects and objects, the next
 * 60 days of planned windows, and the roster's approved leave — so a window
 * that overlaps leave is FLAGGED (never silently accepted, never refused:
 * a manager may knowingly plan over a pending request).
 *
 * Honest by construction: unapplied migration → one line saying planning is
 * not available here; empty roster → say so and point at inviting people;
 * nothing invented.
 */
const PLAN_HORIZON_DAYS = 60;

function isoDayPlus(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function WorkPlanSection({
  locale,
  outcome,
}: {
  locale: string;
  outcome: string | undefined;
}) {
  const t = await getTranslations("workPlan");
  const org = await getActiveOrganizationContext();
  const organizationId = org.activeOrganizationId;
  const today = new Date().toISOString().slice(0, 10);
  const rangeEnd = isoDayPlus(today, PLAN_HORIZON_DAYS);

  const [entries, workers, projects, availability] = organizationId
    ? await Promise.all([
        listWorkPlanEntries({ rangeStart: today, rangeEnd, organizationId }),
        listPlannableWorkers(),
        listManagedProjects(),
        getEmployerWorkerAvailability(),
      ])
    : [null, [], [], null];

  // Work objects of the active organization — read here (RLS-scoped select
  // on an existing table) rather than through a new lib, until an object
  // list reader exists elsewhere.
  let workObjects: { id: string; name: string }[] = [];
  if (organizationId) {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("work_objects")
      .select("id, name")
      .eq("organization_id", organizationId)
      .limit(100);
    workObjects = ((data ?? []) as { id: string; name: string | null }[])
      .filter((o) => o.name)
      .map((o) => ({ id: o.id, name: o.name as string }));
  }

  const notice = isWorkPlanOutcome(outcome) ? outcome : null;
  const noticeTone =
    notice === "planned" || notice === "cancelled"
      ? "border-state-success/40 bg-state-success/5 text-state-success"
      : "border-state-warning/50 bg-state-warning/10 text-state-warning";

  return (
    <section id="work-plan" data-testid="work-plan-section">
      <Card compact>
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("title")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">{t("intro")}</p>

        {notice && (
          <p
            role={notice === "planned" || notice === "cancelled" ? "status" : "alert"}
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${noticeTone}`}
            data-testid="work-plan-notice"
            data-outcome={notice}
          >
            {t(`outcome.${notice}`)}
          </p>
        )}

        {!organizationId || entries === null || !entries.applied ? (
          <p className="mt-4 text-sm text-text-secondary" data-testid="work-plan-unavailable">
            {t("unavailable")}
          </p>
        ) : workers.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary" data-testid="work-plan-no-workers">
            {t("noWorkers")}
          </p>
        ) : (
          <div className="mt-4">
            <WorkPlanForm
              locale={locale}
              organizationId={organizationId}
              workers={workers}
              projects={projects
                .filter((p) => p.organizationId === organizationId && p.title)
                .map((p) => ({ id: p.id, title: p.title as string }))}
              workObjects={workObjects}
              today={today}
              labels={{
                worker: t("worker"),
                project: t("project"),
                workObject: t("workObject"),
                startDate: t("startDate"),
                endDate: t("endDate"),
                startTime: t("startTime"),
                endTime: t("endTime"),
                note: t("note"),
                submit: t("submit"),
                pending: t("pending"),
                none: t("none"),
              }}
            />
          </div>
        )}

        {entries && entries.applied && (
          <div className="mt-6 border-t border-ink-600 pt-4">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("listTitle")}
            </p>
            {entries.entries.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary" data-testid="work-plan-empty">
                {t("empty")}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-ink-600" data-testid="work-plan-list">
                {entries.entries.map((e) => {
                  const overlapsLeave =
                    availability?.status === "ok" &&
                    availability.unavailability.some(
                      (u) =>
                        u.workerId === e.workerId &&
                        unavailabilityOverlaps({ startDate: e.startDate, endDate: e.endDate }, u.item),
                    );
                  return (
                    <li
                      key={e.id}
                      id={`work-plan-${e.id}`}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                      data-testid="work-plan-entry"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="text-sm font-medium text-text-primary">
                          {e.workerName ?? e.workerId.slice(0, 8)}
                          {e.projectTitle ? ` · ${e.projectTitle}` : ""}
                          {e.workObjectName ? ` · ${e.workObjectName}` : ""}
                        </p>
                        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                          {formatUtcDate(e.startDate, locale)}
                          {e.endDate !== e.startDate ? ` – ${formatUtcDate(e.endDate, locale)}` : ""}
                          {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : ""}
                        </p>
                        {e.note && <p className="text-xs text-text-secondary">{e.note}</p>}
                        {overlapsLeave && (
                          <p
                            className="text-xs text-state-warning"
                            data-testid="work-plan-overlap"
                          >
                            {t("overlap")}
                          </p>
                        )}
                      </div>
                      <WorkPlanCancelButton
                        locale={locale}
                        entryId={e.id}
                        labels={{ cancel: t("cancel"), pending: t("cancelPending") }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
