import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  OPERATIONAL_STATUSES,
  READINESS_STATUSES,
  type OperationalStatus,
  type ReadinessStatus,
} from "@/lib/projects/operations-derive";
import { DEFAULT_READINESS_ITEM_KEYS } from "@/lib/projects/readiness-items";
import { getOperationsCentre } from "@/lib/projects/operations-centre";
import {
  OPS_BOARD_ANCHOR,
  OPS_CENTRE_ATTENTION_MAX,
  deriveAttention,
  deriveProjectReadinessRatio,
  deriveWorkerResources,
  openProjectTasks,
} from "@/lib/projects/operations-centre-model";
import { isOverdue } from "@/lib/tasks/task-model";
import {
  ProjectOperationsBoard,
  type OperationsBoardLabels,
} from "@/components/app/project-operations-board";
import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";
import { HandoverPassportPanel } from "@/components/app/handover-passport-panel";
import { type Role } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * Project operating centre (control room PR G on top of Pilot Operations
 * Launch v1) — the worker operations board PLUS the composed project view:
 * header facts, real attention items, open project tasks (degrading), work
 * evidence counts, handover state and the per-worker resource/assignment-
 * readiness strip.
 *
 * Manager-only, project-scoped. Every read goes through the project's EXISTING
 * RLS (a manager reads only projects they manage and only their workers'
 * employer-visible signals). No migration, no new grant, no service_role.
 * Where a real model is absent (milestones, issues, resource tables) NOTHING
 * renders — the gap map §6/§7 records the gated follow-ups.
 */
export default async function ProjectOperationsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projectOps");
  const tTasks = await getTranslations("tasks");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role = (profile?.active_role as Role) ?? "worker";

  if (!MANAGER_ROLES.has(role)) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("eyebrow")}
        </h1>
        <p className="card-border p-4 text-sm text-text-secondary">{t("managerOnly")}</p>
      </div>
    );
  }

  const centre = await getOperationsCentre(id);
  if (!centre) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("eyebrow")}
        </h1>
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="ops-not-authorized">
          {t("notAuthorized")}
        </p>
      </div>
    );
  }

  const { ops, passport, tasks, evidence, housingProvided } = centre;

  const labels: OperationsBoardLabels = {
    eyebrow: t("eyebrow"),
    untitledProject: t("untitledProject"),
    statusLabel: t("statusLabel"),
    locationLabel: t("locationLabel"),
    startLabel: t("startLabel"),
    notSet: t("notSet"),
    schemaNote: t("schemaNote"),
    countersTitle: t("countersTitle"),
    totalAssigned: t("counters.totalAssigned"),
    ready: t("counters.ready"),
    readyBasis: t("counters.readyBasis"),
    needsDeclaredSkills: t("counters.needsDeclaredSkills"),
    needsEvidence: t("counters.needsEvidence"),
    needsFollowUp: t("counters.needsFollowUp"),
    openReviewItems: t("counters.openReviewItems"),
    instructionsSent: t("counters.instructionsSent"),
    actionsTitle: t("actionsTitle"),
    assignAction: t("actions.assign"),
    instructionsAction: t("actions.instructions"),
    csvAction: t("actions.csv"),
    printAction: t("actions.print"),
    candidatesAction: t("actions.candidates"),
    workersTitle: t("workersTitle"),
    noWorkers: t("noWorkers"),
    readyChip: t("worker.readyChip"),
    notReadyChip: t("worker.notReadyChip"),
    declaredSkills: t("worker.declaredSkills"),
    confirmedSkills: t("worker.confirmedSkills"),
    evidence: t("worker.evidence"),
    reviewItems: t("worker.reviewItems"),
    lastActivity: t("worker.lastActivity"),
    noActivity: t("worker.noActivity"),
    assignedAt: t("worker.assignedAt"),
    missingTitle: t("worker.missingTitle"),
    missingName: t("worker.missingName"),
    missingDeclaredSkills: t("worker.missingDeclaredSkills"),
    missingEvidence: t("worker.missingEvidence"),
    followUpChip: t("worker.followUpChip"),
    playerCardLink: t("worker.playerCardLink"),
    instructionLink: t("worker.instructionLink"),
    skillClarifyLink: t("worker.skillClarifyLink"),
    notesTitle: t("notesTitle"),
    documentsNote: t("notes.documents"),
    candidateSkillNote: t("notes.candidateSkill"),
    readinessHonestyNote: t("notes.readiness"),
    // v2 — operational status
    statusTitle: t("statusTitle"),
    statusEmpty: t("statusEmpty"),
    statusHelper: t("statusHelper"),
    save: t("save"),
    saving: t("saving"),
    saved: t("saved"),
    saveError: t("saveError"),
    needsMigration: t("needsMigration"),
    statusLabels: Object.fromEntries(
      OPERATIONAL_STATUSES.map((s) => [s, t(`statuses.${s}`)]),
    ) as Record<OperationalStatus, string>,
    // v2 — checklist
    checklist: {
      title: t("checklist.title"),
      empty: t("checklist.empty"),
      seed: t("checklist.seed"),
      addItem: t("checklist.addItem"),
      addPlaceholder: t("checklist.addPlaceholder"),
      missing: t("checklist.missing"),
      received: t("checklist.received"),
      checked: t("checklist.checked"),
      blocked: t("checklist.blocked"),
      helper: t("checklist.helper"),
    },
    readinessStatusLabels: Object.fromEntries(
      READINESS_STATUSES.map((s) => [s, t(`readinessStatuses.${s}`)]),
    ) as Record<ReadinessStatus, string>,
    defaultItemLabels: Object.fromEntries(
      DEFAULT_READINESS_ITEM_KEYS.map((k) => [k, t(`defaults.${k}`)]),
    ) as Record<string, string>,
    // v2 — filters
    filters: {
      title: t("filters.title"),
      all: t("filters.all"),
      byStatus: t("filters.byStatus"),
      anyStatus: t("filters.anyStatus"),
      missingDocs: t("filters.missingDocs"),
      ready: t("filters.ready"),
      needsSkillInfo: t("filters.needsSkillInfo"),
      followUp: t("filters.followUp"),
      none: t("filters.none"),
    },
    counters2: {
      withMissingDocs: t("counters2.withMissingDocs"),
      docsReceived: t("counters2.docsReceived"),
      docsChecked: t("counters2.docsChecked"),
      docsBlocked: t("counters2.docsBlocked"),
    },
  };

  // ── PR G derivations: pure functions over the composed real reads ──
  const tCentre = await getTranslations("projectOps.centre");
  const tasksHref = `/dashboard/tasks?project=${id}`;
  const taskList = tasks.status === "ok" ? tasks.tasks : [];
  const openTasks = openProjectTasks(taskList);
  const openTaskCount = openProjectTasks(taskList, taskList.length).length;
  const readiness = deriveProjectReadinessRatio(ops.workers);
  const now = new Date();
  const attention = deriveAttention({
    workers: ops.workers,
    tasks: taskList,
    tasksHref,
    now,
  }).slice(0, OPS_CENTRE_ATTENTION_MAX);
  const resources = deriveWorkerResources({
    workers: ops.workers,
    availability: centre.availability,
    bookings: centre.bookings,
    project: {
      startDate: ops.project.startDate,
      endDate: ops.project.endDate,
    },
  });
  const hasProjectWindow = ops.project.startDate !== null;

  const chipClass =
    "inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary";
  const sectionTitleClass =
    "font-mono text-[10px] uppercase tracking-label text-text-muted";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {/* ARENA rhythm (TASK 07 slice 2): the S3.5 one-tap confirm queue
          pulse — the real gated reviewable count, one tap to confirm. */}
      <ConfirmPulse />

      {/* ── PR G header strip: real project facts + real counts only.
            Status is the stored enum VERBATIM; every number is a raw count
            of rows this session read under RLS. ── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="ops-centre-header"
      >
        <h2 className={sectionTitleClass}>{tCentre("summaryTitle")}</h2>
        <div className="flex flex-wrap gap-2">
          <span className={chipClass} data-testid="ops-centre-status">
            {t("statusLabel")}: {ops.project.status ?? t("notSet")}
          </span>
          <span className={chipClass} data-testid="ops-centre-dates">
            {tCentre("datesLabel")}: {ops.project.startDate ?? t("notSet")} →{" "}
            {ops.project.endDate ?? t("notSet")}
          </span>
          <span className={chipClass}>
            {t("counters.totalAssigned")}: {ops.counters.totalAssigned}
          </span>
          {tasks.status === "ok" ? (
            <span className={chipClass} data-testid="ops-centre-open-tasks">
              {tCentre("openTasksLabel")}: {openTaskCount}
            </span>
          ) : (
            <span className={chipClass} data-testid="ops-centre-tasks-preparing">
              {tCentre("openTasksLabel")}: {tCentre("tasksPreparingShort")}
            </span>
          )}
          {readiness.total > 0 ? (
            <span className={chipClass} data-testid="ops-centre-readiness">
              {tCentre("readinessLabel")}: {readiness.checked}/{readiness.total}
            </span>
          ) : (
            <span className={chipClass} data-testid="ops-centre-readiness-none">
              {tCentre("readinessLabel")}: {tCentre("readinessNone")}
            </span>
          )}
          <span className={chipClass} data-testid="ops-centre-housing">
            {tCentre("housingLabel")}:{" "}
            {housingProvided === true
              ? tCentre("housingYes")
              : housingProvided === false
                ? tCentre("housingNo")
                : tCentre("housingUnknown")}
          </span>
        </div>
      </section>

      {/* ── PR G attention: blockers derived ONLY from real records —
            manager-set statuses, open checklist rows, overdue/blocked
            project tasks. Each row links where it is resolved. ── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="ops-centre-attention"
      >
        <h2 className={sectionTitleClass}>{tCentre("attention.title")}</h2>
        {attention.length === 0 ? (
          <p
            className="text-sm leading-relaxed text-text-secondary"
            data-testid="ops-attention-empty"
          >
            {tCentre("attention.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((a) => {
              const body = (
                <>
                  <span className="inline-flex shrink-0 items-center rounded-md border border-state-warning/30 bg-state-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning">
                    {tCentre(`attention.kind.${a.kind}`)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {a.subject}
                  </span>
                  <span aria-hidden className="text-text-muted">
                    →
                  </span>
                </>
              );
              return (
                <li key={a.id} data-testid={`ops-attention-${a.kind}`}>
                  {a.href.startsWith("#") ? (
                    <a
                      href={a.href}
                      className="flex min-h-11 items-center gap-2 rounded-md border border-ink-600 px-3 py-2 transition-colors duration-fast hover:border-brand-blue"
                    >
                      {body}
                    </a>
                  ) : (
                    <Link
                      href={a.href as "/dashboard"}
                      className="flex min-h-11 items-center gap-2 rounded-md border border-ink-600 px-3 py-2 transition-colors duration-fast hover:border-brand-blue"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-text-muted">
          {tCentre("attention.note")}
        </p>
      </section>

      {/* The board keeps everything it rendered before — the attention rows
          above anchor into it (OPS_BOARD_ANCHOR). */}
      <div id={OPS_BOARD_ANCHOR.slice(1)} className="flex flex-col gap-6">
        <ProjectOperationsBoard
          ops={ops}
          labels={labels}
          locale={locale}
          projectId={id}
          csvHref={`/${locale}/dashboard/projects/${id}/operations/report`}
        />
      </div>

      {/* §8.8 handover passport shell (branch 19) — append-only manager
          record on the SAME project spine. Responsible parties are the real
          active assignments already loaded above (names only). The panel
          owns the honest "not yet available" state while the owner-gated
          migration is unapplied. */}
      <HandoverPassportPanel
        projectId={id}
        data={passport}
        responsibleWorkers={ops.workers.map((w) => ({ name: w.name }))}
      />

      {/* ── PR G resources: per assigned worker — manager-set status
            VERBATIM, real checklist ratio, the worker's own recorded
            availability fields, and accepted-booking overlaps with the
            project band (planning-model semantics). Accommodation/transport
            needs are NOT tracked yet, so nothing renders for them. ── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="ops-centre-resources"
      >
        <h2 className={sectionTitleClass}>{tCentre("resources.title")}</h2>
        {resources.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("noWorkers")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {resources.map((r) => (
              <li
                key={r.workerId}
                className="flex flex-col gap-2 rounded-md border border-ink-600 p-3"
                data-testid="ops-resource-row"
              >
                <p className="text-sm font-semibold text-text-primary">
                  {r.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClass}>
                    {t("statusTitle")}:{" "}
                    {r.operationalStatus
                      ? t(`statuses.${r.operationalStatus}`)
                      : t("statusEmpty")}
                  </span>
                  <span className={chipClass}>
                    {tCentre("resources.checklistLabel")}:{" "}
                    {r.readiness.total > 0
                      ? `${r.readiness.checked}/${r.readiness.total}`
                      : tCentre("readinessNone")}
                  </span>
                  <span className={chipClass}>
                    {tCentre("resources.availabilityLabel")}:{" "}
                    {r.availability.availabilityStatus ??
                      tCentre("resources.notRecorded")}
                  </span>
                  {r.availability.availableFrom ? (
                    <span className={chipClass}>
                      {tCentre("resources.availableFromLabel")}:{" "}
                      {r.availability.availableFrom}
                    </span>
                  ) : null}
                  {!hasProjectWindow ? (
                    <span
                      className={chipClass}
                      data-testid="ops-resource-no-window"
                    >
                      {tCentre("resources.noWindow")}
                    </span>
                  ) : r.overlappingBookings > 0 ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-state-warning/30 bg-state-warning/10 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-state-warning"
                      data-testid="ops-resource-booking-overlap"
                    >
                      {tCentre("resources.bookingConflict", {
                        n: r.overlappingBookings,
                      })}
                    </span>
                  ) : (
                    <span className={chipClass}>
                      {tCentre("resources.noConflict")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-text-muted">
          {tCentre("resources.note")}
        </p>
      </section>

      {/* ── PR G tasks: open project tasks inline (bounded), honest
            preparing note while the owner-gated work_tasks migration is
            unapplied; the tasks page stays the full surface. ── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="ops-centre-tasks"
      >
        <h2 className={sectionTitleClass}>{tCentre("tasksTitle")}</h2>
        {tasks.status === "needs-migration" ? (
          <p
            className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted"
            data-testid="ops-tasks-preparing"
          >
            {tTasks("unavailable")}
          </p>
        ) : openTasks.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary">
            {tCentre("tasksEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {openTasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 px-3 py-2"
                data-testid="ops-task-row"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {task.title}
                </span>
                <span className={chipClass}>
                  {tTasks(`status.${task.status}`)}
                </span>
                {task.dueAt ? (
                  <span
                    className={
                      isOverdue(task.dueAt, now)
                        ? "inline-flex items-center rounded-full border border-state-warning/30 bg-state-warning/10 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-state-warning"
                        : chipClass
                    }
                  >
                    {tTasks("dueLabel")}: {task.dueAt.slice(0, 10)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {/* Work tasks bridge (control room PR D) — navigation only: the tasks
            page owns the project-scoped read (RLS) and degrades honestly until
            the owner-gated work_tasks migration is applied. */}
        <p className="text-sm" data-testid="ops-project-tasks-link">
          <Link
            href={tasksHref as "/dashboard"}
            className="text-brand-blue hover:underline"
          >
            {tTasks("projectSection.link")} →
          </Link>
        </p>
      </section>

      {/* ── PR G work evidence: real counts of journal entries linked to
            this project and their uploaded photos — a summary of the SAME
            gallery the project page shows, never a second photo system. ── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="ops-centre-evidence"
      >
        <h2 className={sectionTitleClass}>{tCentre("evidence.title")}</h2>
        <div className="flex flex-wrap gap-2">
          <span className={chipClass} data-testid="ops-evidence-entries">
            {tCentre("evidence.entriesLabel")}: {evidence.entryCount}
          </span>
          <span className={chipClass} data-testid="ops-evidence-photos">
            {tCentre("evidence.photosLabel")}: {evidence.photoCount}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {tCentre("evidence.note")}
        </p>
        <Link
          href={`/dashboard/projects/${id}` as "/dashboard"}
          data-testid="ops-evidence-gallery-link"
          className="text-sm text-brand-blue hover:underline"
        >
          {tCentre("evidence.link")} →
        </Link>
      </section>

      {/* Honest scope line: the centre composes records that already exist —
          nothing absent (milestones, issue registers, resource tables) is
          simulated. */}
      <p
        className="text-[11px] leading-relaxed text-text-muted"
        data-testid="ops-centre-honest-note"
      >
        {tCentre("honestNote")}
      </p>
    </div>
  );
}
