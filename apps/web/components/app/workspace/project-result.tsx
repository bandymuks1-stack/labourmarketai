"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";
import {
  loadProjectDetailForResult,
  loadProjectsForResult,
  setProjectStatusAction,
} from "@/lib/projects/project-workspace";
import {
  acceptsAssignment,
  nextStatuses,
  type ProjectStatus,
} from "@/lib/projects/project-lifecycle-model";
import type {
  ProjectDetail,
  ProjectDetailResult,
  ProjectListResult,
} from "@/lib/projects/project-result-contract";

/**
 * THE PROJECT RESULT — the third defect the W11 audit named, closed.
 *
 * ─── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 * The `project` entry declared `dataReadiness: "real"` while `InlineResult` had
 * no `case "project"`. `canRenderInline` therefore returned true, `ResultBody`
 * took the inline branch and SKIPPED the fallback its own doc-comment calls
 * "the NO REGRESSION guarantee" — so the person got one sentence, "Preparing
 * this result.", and no way to `/dashboard/projects`. The W11 audit filed that
 * as P0-4; a later slice downgraded the entry to `unverified` to restore the
 * fallback, which was the honest stopgap. This is the renderer that entry was
 * always waiting for, and readiness returns to `real` in the SAME change.
 *
 * ─── ONLY REAL DATA ─────────────────────────────────────────────────────────
 * Everything here is a stored row: the canonical status, the assignment roster,
 * the stage rows, the real dates. There is NO progress bar, no completion
 * percentage, no estimated finish and no worker score — the project domain
 * stores none of those (the stage migration explicitly refuses a progress
 * column), and the contract this renders has no field that could carry one.
 *
 * Two absences are stated rather than smoothed over: a project whose status is
 * unreadable renders as unknown (never silently as draft), and stages that
 * cannot be read here (owner-gated migration) say so instead of showing a
 * confident empty list.
 *
 * ─── NO ROUTING ─────────────────────────────────────────────────────────────
 * Like every result body, the full screen is reached through `onOpenFull`. No
 * `<Link>`, no router. Depth lives in the URL as `?result=project&project=…`,
 * reusing the SAME param the market result already carries.
 *
 * ─── W11 F7: THE EXIT KEEPS THE PROJECT ─────────────────────────────────────
 * The picker's exit is the LIST, because at that depth no project is chosen.
 * The DETAIL view's exit used to be that same list — so a manager who had
 * already picked a project, and was reading its status, roster and stages,
 * was thrown back to a list to find it a second time. The project's operating
 * centre was consequently reachable only by typing the URL or by walking
 * list → stadium → the link at the very bottom of the arena.
 *
 * The detail exit is now project-scoped, and which surface it names follows
 * the SAME authority the assignment control already respects:
 *   - `canManage` → `/dashboard/projects/{id}/operations`, the operating
 *     centre (stages, Gantt, economics, defects, assets, handover, readiness);
 *   - otherwise  → `/dashboard/projects/{id}`, which is role-aware and
 *     fail-closed on its own (manager arena / assigned-worker panel / an
 *     honest no-access state).
 *
 * `canManage` is the SERVER's `can_manage_project` answer carried on the
 * contract — not a client guess, and not the active role. Both destinations
 * re-check on arrival, so an offered route is never itself an authority claim.
 */

const FULL_ROUTE = "/dashboard/projects";
const projectRoute = (projectId: string) => `/dashboard/projects/${projectId}`;
const operationsRoute = (projectId: string) => `${projectRoute(projectId)}/operations`;

type ListPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: ProjectListResult };

type DetailPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: ProjectDetailResult };

export function ProjectResult({
  projectId,
  locale,
  onSelectProject,
  onBack,
  onOpenFull,
  onAssignWorker,
  onStageStatus,
}: {
  /** Which project the panel is showing, or null for the project list. */
  projectId: string | null;
  locale: string;
  onSelectProject: (projectId: string) => void;
  onBack: () => void;
  onOpenFull: (route: string) => void;
  /**
   * Hand the assignment back to the conversation, which owns the ONE flow that
   * dispatches `company.assign-worker`. The panel never grows an action of its
   * own — the same rule the Context Panel follows for every chip.
   */
  onAssignWorker: (projectId: string) => void;
  onStageStatus: (projectId: string, stageId: string, status: "done") => void;
}) {
  return projectId === null ? (
    <ProjectPicker onSelectProject={onSelectProject} onOpenFull={onOpenFull} />
  ) : (
    <ProjectDetailView
      projectId={projectId}
      locale={locale}
      onBack={onBack}
      onOpenFull={onOpenFull}
      onAssignWorker={onAssignWorker}
      onStageStatus={onStageStatus}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Depth 0 — which project?
// ═══════════════════════════════════════════════════════════════════════════

function ProjectPicker({
  onSelectProject,
  onOpenFull,
}: {
  onSelectProject: (projectId: string) => void;
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<ListPhase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadProjectsForResult()
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (phase.kind === "loading") return <Pending testId="project-loading" />;
  if (phase.kind === "error") {
    return (
      <Failed
        testId="project-error"
        text={t("projectError")}
        retryLabel={t("retry")}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  const { view } = phase;
  if (view.kind === "no-company-context") {
    return (
      <Explained
        testId="project-no-company"
        text={t("projectNoCompany")}
        openLabel={t("openFull")}
        onOpenFull={() => onOpenFull(FULL_ROUTE)}
      />
    );
  }
  if (view.kind === "blocked") {
    return (
      <Explained
        testId="project-blocked"
        text={t("projectBlocked")}
        openLabel={t("openFull")}
        onOpenFull={() => onOpenFull(FULL_ROUTE)}
      />
    );
  }
  if (view.kind === "empty") {
    return (
      <Explained
        testId="project-empty"
        text={t("projectEmpty")}
        openLabel={t("openFull")}
        onOpenFull={() => onOpenFull(FULL_ROUTE)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="project-picker">
      <p className="text-basis text-text-secondary">{t("projectPick")}</p>
      <ul className="flex flex-col divide-y divide-border/40">
        {view.projects.map((p) => (
          <li key={p.projectId}>
            <button
              type="button"
              onClick={() => onSelectProject(p.projectId)}
              data-testid={`project-row-${p.projectId}`}
              className="flex min-h-11 w-full flex-col items-start gap-0.5 py-2 text-left hover:bg-ink-800/40"
            >
              <span className="text-basis font-semibold text-text-primary">{p.title}</span>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                <StatusWord status={p.status} />
                {p.city ? ` · ${p.city}` : ""}
                {p.orgName ? ` · ${p.orgName}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <OpenFull label={t("openFull")} onOpenFull={() => onOpenFull(FULL_ROUTE)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Depth 1 — one project, its people, its stages, its lifecycle
// ═══════════════════════════════════════════════════════════════════════════

function ProjectDetailView({
  projectId,
  locale,
  onBack,
  onOpenFull,
  onAssignWorker,
  onStageStatus,
}: {
  projectId: string;
  locale: string;
  onBack: () => void;
  onOpenFull: (route: string) => void;
  onAssignWorker: (projectId: string) => void;
  onStageStatus: (projectId: string, stageId: string, status: "done") => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<DetailPhase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /**
   * THE LIFECYCLE OUTCOME LIVES HERE, NOT IN THE CONTROLS.
   *
   * A successful transition refreshes the panel, and the refresh puts this
   * component back into `loading` — which unmounts `LifecycleControls` and
   * would destroy any state it held. Found in the authenticated browser:
   * the success line was set and then thrown away before anyone could read
   * it, so the ONE place a person is told how many work periods their
   * irreversible completion ended (`projectCompletedEnded`, carrying the
   * server's real count) was effectively invisible. Failures survived only
   * because they do not refresh.
   *
   * Holding it in the parent, which the refresh does not unmount, means the
   * outcome is still on screen next to the state it produced.
   */
  const [outcome, setOutcome] = useState<{ text: string; error: boolean } | null>(null);
  // The opener stamps `pr` when it re-addresses the same project after a
  // write; a changed stamp is a changed question, so the detail re-reads.
  const searchParams = useSearchParams();
  const refreshStamp = searchParams?.get("pr") ?? null;

  // A different project is a different question — never carry an answer over.
  useEffect(() => {
    setOutcome(null);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadProjectDetailForResult(projectId)
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt, refreshStamp]);

  const back = (
    <button
      type="button"
      onClick={onBack}
      data-testid="project-back"
      className="self-start text-support font-semibold text-brand-blue hover:underline"
    >
      {t("projectBackToList")}
    </button>
  );

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Pending testId="project-loading" />
      </div>
    );
  }
  if (phase.kind === "error") {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Failed
          testId="project-error"
          text={t("projectError")}
          retryLabel={t("retry")}
          onRetry={reload}
        />
      </div>
    );
  }

  const { view } = phase;
  if (view.kind !== "project") {
    const text =
      view.kind === "not-found"
        ? t("projectNotFound")
        : view.kind === "no-company-context"
          ? t("projectNoCompany")
          : t("projectBlocked");
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Explained
          testId={`project-${view.kind}`}
          text={text}
          openLabel={t("openFull")}
          onOpenFull={() => onOpenFull(FULL_ROUTE)}
        />
      </div>
    );
  }

  const p = view.project;

  return (
    <div className="flex flex-col gap-3" data-testid="project-detail">
      {back}

      <div className="flex flex-col gap-0.5">
        <span className="font-display text-card-title font-semibold text-text-primary">
          {p.title}
        </span>
        <span
          className="font-mono text-meta uppercase tracking-label text-text-muted"
          data-testid="project-status"
          data-status={p.status ?? "unknown"}
        >
          <StatusWord status={p.status} />
          {p.orgName ? ` · ${p.orgName}` : ""}
        </span>
      </div>

      <dl className="flex flex-col gap-1 text-support">
        {(p.city || p.country) && (
          <Row
            label={t("fieldPlace")}
            value={[p.city, p.country].filter(Boolean).join(", ")}
          />
        )}
        {/* Dates render ONLY when the row really carries them. The project row
            still has no write path for start/end (a documented gap), so their
            absence is the common case and is simply not shown — never a
            placeholder date and never an estimate. */}
        {p.startDate && <Row label={t("fieldStart")} value={p.startDate} />}
        {p.endDate && <Row label={t("fieldEnd")} value={p.endDate} />}
        <Row label={t("projectAssignedCount")} value={String(p.assignmentTotal)} />
      </dl>

      <LifecycleControls
        project={p}
        locale={locale}
        onDone={reload}
        onOutcome={setOutcome}
      />

      {outcome && (
        <p
          role="status"
          className={`text-meta ${outcome.error ? "text-state-danger" : "text-state-success"}`}
          data-testid="project-lifecycle-message"
        >
          {outcome.text}
        </p>
      )}

      {p.assignments.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="project-assignments">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("projectAssigned")}
          </p>
          <ul className="flex flex-col divide-y divide-border/40">
            {p.assignments.map((a) => (
              <li
                key={a.workerProfileId}
                className="flex items-center justify-between gap-2 py-1.5 text-support"
              >
                <span className="text-text-primary">{a.name}</span>
                <span className="font-mono text-meta text-text-muted">
                  {a.assignedAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pulse pulse={p.pulse} assignmentTotal={p.assignmentTotal} />
      <Stages stages={p.stages} canManage={p.canManage} onMarkDone={(stageId) => onStageStatus(p.projectId, stageId, "done")} />

      {/* ASSIGNMENT. Offered only where the canonical rule allows it, and only
          to someone the server says may manage the project. A completed
          project shows the reason instead of a control that would be refused. */}
      {p.canManage &&
        (acceptsAssignment(p.status) ? (
          <ChatActionRow>
            <ChatAction
              tone="secondary"
              testId="project-assign-worker"
              onClick={() => onAssignWorker(p.projectId)}
            >
              {t("projectAssignWorker")}
            </ChatAction>
          </ChatActionRow>
        ) : (
          <p className="text-meta text-text-muted" data-testid="project-no-assign">
            {t("projectCompletedNoAssign")}
          </p>
        ))}

      {/* W11 F7 — the exit carries the project the person already chose. */}
      <OpenFull
        label={p.canManage ? t("projectOpenOperations") : t("projectOpenProject")}
        testId={p.canManage ? "project-open-operations" : "project-open-project"}
        onOpenFull={() =>
          onOpenFull(
            p.canManage ? operationsRoute(p.projectId) : projectRoute(p.projectId),
          )
        }
      />
    </div>
  );
}

/**
 * The lifecycle controls.
 *
 * The buttons are DERIVED from the shared matrix (`nextStatuses`), not written
 * out per state — so a control can never be offered for a transition the server
 * would reject, and `completed` shows nothing because nothing leads out of it.
 * Completing asks for an explicit confirmation that states, in plain words,
 * what becomes true.
 */
function LifecycleControls({
  project,
  locale,
  onDone,
  onOutcome,
}: {
  project: ProjectDetail;
  locale: string;
  onDone: () => void;
  /** Reported UP, because a successful transition unmounts this component. */
  onOutcome: (outcome: { text: string; error: boolean } | null) => void;
}) {
  const t = useTranslations("conversation.results");
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const targets = nextStatuses(project.status);
  if (!project.canManage || targets.length === 0) {
    if (project.status === "completed") {
      return (
        <p className="text-meta text-text-muted" data-testid="project-terminal">
          {t("projectTerminal")}
        </p>
      );
    }
    return null;
  }

  const run = (to: ProjectStatus) => {
    onOutcome(null);
    start(async () => {
      const res = await setProjectStatusAction(locale, project.projectId, to);
      setConfirming(false);
      if (res.kind === "transitioned") {
        // The REAL count from the server — the panel never estimates it.
        onOutcome({
          text:
            res.assignmentsEnded > 0
              ? t("projectCompletedEnded", { count: res.assignmentsEnded })
              : t("projectTransitioned"),
          error: false,
        });
        onDone();
        return;
      }
      onOutcome({
        text:
          res.kind === "already_in_state"
            ? t("projectAlreadyInState")
            : res.kind === "invalid_transition"
              ? t("projectInvalidTransition")
              : res.kind === "not_authorized"
                ? t("projectNotAuthorized")
                : res.kind === "not_found"
                  ? t("projectNotFound")
                  : res.kind === "needs_migration"
                    ? t("projectNeedsMigration")
                    : res.kind === "conflict"
                      ? t("projectConflict")
                      : t("projectError"),
        error: true,
      });
    });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="project-lifecycle">
      {confirming ? (
        <div
          className="flex flex-col gap-2 rounded-control border border-state-warning/40 bg-state-warning/5 p-3"
          data-testid="project-complete-confirm"
        >
          {/* Exactly what becomes true — including the one thing this slice
              does NOT do, so nobody expects an experience record to appear. */}
          <p className="text-support font-semibold text-text-primary">
            {t("projectCompleteTitle")}
          </p>
          <p className="text-meta leading-relaxed text-text-secondary">
            {t("projectCompleteBody")}
          </p>
          <ChatActionRow>
            <ChatAction
              tone="primary"
              loading={pending}
              testId="project-complete-confirm-cta"
              onClick={() => run("completed")}
            >
              {pending ? t("projectWorking") : t("projectCompleteCta")}
            </ChatAction>
            <ChatAction
              tone="secondary"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t("projectCancel")}
            </ChatAction>
          </ChatActionRow>
        </div>
      ) : (
        <ChatActionRow>
          {targets.map((to) =>
            to === "completed" ? (
              <ChatAction
                key={to}
                tone="secondary"
                disabled={pending}
                testId="project-action-completed"
                onClick={() => setConfirming(true)}
              >
                {t("projectActionCompleted")}
              </ChatAction>
            ) : (
              <ChatAction
                key={to}
                // Publishing / resuming is the recommended move; pausing is not.
                tone={to === "live" ? "primary" : "secondary"}
                loading={pending}
                disabled={pending}
                testId={`project-action-${to}`}
                onClick={() => run(to)}
              >
                {to === "live"
                  ? project.status === "draft"
                    ? t("projectActionPublish")
                    : t("projectActionResume")
                  : t("projectActionPause")}
              </ChatAction>
            ),
          )}
        </ChatActionRow>
      )}
    </div>
  );
}

/**
 * The living project (owner contract §11): what is happening now, what
 * evidence exists, what is open or overdue, how ready the roster is — and
 * ONE honest "next" line derived from those same numbers. Unavailable reads
 * render nothing (no zero pretending to be a fact).
 */
function Pulse({ pulse, assignmentTotal }: { pulse: ProjectDetail["pulse"]; assignmentTotal: number }) {
  const t = useTranslations("conversation.results");
  if (!pulse) return null;
  const next =
    assignmentTotal === 0
      ? t("pulseNextAssign")
      : pulse.tasksOverdue > 0
        ? t("pulseNextOverdue", { count: pulse.tasksOverdue })
        : pulse.workersWithMissingDocs > 0
          ? t("pulseNextDocs", { count: pulse.workersWithMissingDocs })
          : pulse.evidenceEntries === 0
            ? t("pulseNextNoWork")
            : null;
  return (
    <div className="flex flex-col gap-1" data-testid="project-pulse">
      <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("pulseTitle")}</h3>
      <dl className="flex flex-col gap-1 text-support">
        <Row label={t("pulseToday")} value={String(pulse.entriesToday)} />
        <Row label={t("pulseEvidence")} value={t("pulseEvidenceValue", { entries: pulse.evidenceEntries, photos: pulse.evidencePhotos })} />
        <Row label={t("pulseTasks")} value={t("pulseTasksValue", { open: pulse.tasksOpen, overdue: pulse.tasksOverdue })} />
        {pulse.readinessTotal > 0 && (
          <Row label={t("pulseReadiness")} value={`${pulse.readinessChecked}/${pulse.readinessTotal}`} />
        )}
      </dl>
      {next && (
        <p className="text-support text-text-secondary" data-testid="project-pulse-next">
          {next}
        </p>
      )}
    </div>
  );
}
function Stages({
  stages,
  canManage,
  onMarkDone,
}: {
  stages: ProjectDetail["stages"];
  canManage: boolean;
  onMarkDone: (stageId: string) => void;
}) {
  const t = useTranslations("conversation.results");
  // The five stored statuses, worded by the same catalogue the operations page uses.
  const ts = useTranslations("projectStages");
  // `null` = the stage source is not readable here. That is NOT "no stages",
  // and saying so is the whole point of carrying the distinction this far.
  if (stages === null) {
    return (
      <p className="text-meta text-text-muted" data-testid="project-stages-unavailable">
        {t("projectStagesUnavailable")}
      </p>
    );
  }
  if (stages.length === 0) {
    return (
      <p className="text-meta text-text-muted" data-testid="project-stages-empty">
        {t("projectStagesEmpty")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="project-stages">
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("projectStages")}
      </p>
      <ul className="flex flex-col divide-y divide-border/40">
        {stages.map((s) => {
          // Real dates only: the ACTUAL span when it exists, otherwise the
          // PLANNED one. Never an interpolation between them.
          const span =
            s.actualStart || s.actualEnd
              ? [s.actualStart, s.actualEnd].filter(Boolean).join(" — ")
              : [s.plannedStart, s.plannedEnd].filter(Boolean).join(" — ");
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-support" data-testid={`project-stage-${s.id}`}>
              <span className="min-w-0 truncate text-text-primary">{s.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-meta text-text-muted">{span}</span>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted" data-testid={`project-stage-status-${s.id}`}>{ts(`statuses.${s.status}`)}</span>
                {/* PROGRESS is a stored status the manager sets — never derived, never a bar (§11). The same
                    dispatch the sentence "etapas X baigtas" runs; the operations page's stage panel calls
                    the same action. Terminal stages carry no control. */}
                {canManage && s.status !== "done" && s.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => onMarkDone(s.id)}
                    data-testid={`project-stage-done-${s.id}`}
                    className="rounded-full border border-ink-500 px-2.5 py-0.5 text-meta font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue"
                  >
                    {t("projectStageMarkDone")}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The canonical status word. An unreadable status says "unknown" rather than
 *  borrowing another state's label. */
function StatusWord({ status }: { status: ProjectStatus | null }) {
  const t = useTranslations("conversation.results");
  if (status === null) return <>{t("projectStatusUnknown")}</>;
  return (
    <>
      {status === "draft"
        ? t("projectStatus.draft")
        : status === "live"
          ? t("projectStatus.live")
          : status === "paused"
            ? t("projectStatus.paused")
            : t("projectStatus.completed")}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared presentation pieces
// ═══════════════════════════════════════════════════════════════════════════

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}

function Pending({ testId }: { testId: string }) {
  const t = useTranslations("conversation.results");
  return (
    <p className="text-basis text-text-muted" data-testid={testId} aria-busy="true">
      {t("pendingInline")}
    </p>
  );
}

function Failed({
  testId,
  text,
  retryLabel,
  onRetry,
}: {
  testId: string;
  text: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-basis text-text-secondary">{text}</p>
      <ChatActionRow>
        <ChatAction tone="secondary" testId={`${testId}-retry`} onClick={onRetry}>
          {retryLabel}
        </ChatAction>
      </ChatActionRow>
    </div>
  );
}

function Explained({
  testId,
  text,
  openLabel,
  onOpenFull,
}: {
  testId: string;
  text: string;
  openLabel: string;
  onOpenFull: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-basis text-text-secondary">{text}</p>
      <OpenFull label={openLabel} onOpenFull={onOpenFull} />
    </div>
  );
}

function OpenFull({
  label,
  onOpenFull,
  testId = "project-open-full",
}: {
  label: string;
  onOpenFull: () => void;
  /** The detail exit names its real destination, so a proof can tell the
   *  operating centre apart from the list without reading the label. */
  testId?: string;
}) {
  return (
    <ChatActionRow>
      <ChatAction tone="secondary" testId={testId} onClick={onOpenFull}>
        {label}
      </ChatAction>
    </ChatActionRow>
  );
}
