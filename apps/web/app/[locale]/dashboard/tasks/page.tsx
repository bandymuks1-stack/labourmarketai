import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { listManagedProjects } from "@/lib/projects/projects";
import {
  createWorkTaskAction,
  setWorkTaskStatusAction,
  updateWorkTaskAction,
} from "@/lib/tasks/task-actions";
import {
  WORK_TASK_DESCRIPTION_MAX,
  WORK_TASK_PRIORITIES,
  WORK_TASK_TITLE_MAX,
  WORK_TASK_TITLE_MIN,
  isOpen,
  isOverdue,
  type WorkTask,
  type WorkTaskStatus,
} from "@/lib/tasks/task-model";
import {
  listMyTasks,
  listProjectTasks,
  type MyTasksResult,
} from "@/lib/tasks/tasks";

/**
 * Work tasks (control room PR D, capability gap map §3) — the role-aware
 * "my tasks" surface plus a simple accessible board view.
 *
 * Honest by construction:
 *  - reads come from the RLS-scoped work-task read service; writes go ONLY
 *    through the three gated RPCs (guard: lib/guards/work-tasks.test.ts);
 *  - while the owner-gated D2 migration is unapplied the page shows the calm
 *    "preparing — not available yet" state (the bookings/handover pattern) —
 *    no fake rows, no fake controls;
 *  - every control is a REAL action: status transitions and edits are
 *    NATIVE-NAV server-action forms that redirect back with an honest
 *    `?notice=` outcome; view switching is plain searchParams links
 *    (keyboard accessible, no drag-and-drop library, no client state);
 *  - the board is four columns of the same real rows (todo / in progress /
 *    blocked / done) — links and forms only.
 */

export const dynamic = "force-dynamic";

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTICES = new Set([
  "created",
  "updated",
  "invalid",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
]);

const OPEN_GROUPS: readonly WorkTaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
];
const CLOSED_GROUPS: readonly WorkTaskStatus[] = ["done", "cancelled"];
const BOARD_COLUMNS: readonly WorkTaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
];

/** Which transitions each status honestly offers (forms rendered per task). */
const TRANSITIONS: Record<
  WorkTaskStatus,
  readonly { action: string; to: WorkTaskStatus }[]
> = {
  todo: [
    { action: "start", to: "in_progress" },
    { action: "block", to: "blocked" },
    { action: "cancel", to: "cancelled" },
  ],
  in_progress: [
    { action: "complete", to: "done" },
    { action: "block", to: "blocked" },
    { action: "cancel", to: "cancelled" },
  ],
  blocked: [
    { action: "unblock", to: "todo" },
    { action: "cancel", to: "cancelled" },
  ],
  done: [{ action: "reopen", to: "todo" }],
  cancelled: [{ action: "reopen", to: "todo" }],
};

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue text-brand-blue";
const CHIP_IDLE = "border-ink-500 text-text-secondary hover:border-brand-blue";

function tasksHref(opts: {
  view?: "board" | null;
  project?: string | null;
  closed?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts.view === "board") params.set("view", "board");
  if (opts.project) params.set("project", opts.project);
  if (opts.closed) params.set("closed", "1");
  const qs = params.toString();
  return qs ? `/dashboard/tasks?${qs}` : "/dashboard/tasks";
}

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    project?: string;
    closed?: string;
    notice?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const view: "my" | "board" = sp.view === "board" ? "board" : "my";
  const projectFilter =
    sp.project && UUID_RX.test(sp.project) ? sp.project : null;
  const showClosed = sp.closed === "1";
  const notice = sp.notice && NOTICES.has(sp.notice) ? sp.notice : null;

  const t = await getTranslations("tasks");

  const [myResult, projectResult, managedProjects] = await Promise.all([
    listMyTasks(),
    projectFilter
      ? listProjectTasks(projectFilter)
      : Promise.resolve<MyTasksResult | null>(null),
    listManagedProjects(),
  ]);

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const now = new Date();

  /* ---------------------------------------------------------------- */
  /* Shared render helpers (server-side, pure presentation)            */
  /* ---------------------------------------------------------------- */

  const priorityTone: Record<WorkTask["priority"], string> = {
    high: "border-brand-orange/50 text-brand-orange",
    normal: "border-ink-500 text-text-secondary",
    low: "border-ink-500 text-text-muted",
  };

  function hiddenContext() {
    return (
      <>
        <input type="hidden" name="locale" value={locale} />
        {view === "board" ? (
          <input type="hidden" name="view" value="board" />
        ) : null}
        {projectFilter ? (
          <input type="hidden" name="project" value={projectFilter} />
        ) : null}
      </>
    );
  }

  function TaskCard({ task }: { task: WorkTask }) {
    const overdue = isOpen(task.status) && isOverdue(task.dueAt, now);
    return (
      <li
        className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
        data-testid={`task-card-${task.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold text-text-primary">
            {task.title}
          </p>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${priorityTone[task.priority]}`}
          >
            {t(`priority.${task.priority}`)}
          </span>
        </div>

        {task.description ? (
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">
            {task.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <span>{t(`status.${task.status}`)}</span>
          {task.dueAt ? (
            <span className={overdue ? "text-state-danger" : undefined}>
              {t("dueLabel")}: {dateFmt.format(new Date(task.dueAt))}
            </span>
          ) : null}
          {overdue ? (
            <span
              className="inline-flex items-center rounded-full border border-state-danger/50 bg-state-danger/10 px-2 py-0.5 text-state-danger"
              data-testid="task-flag-overdue"
            >
              {t("flags.overdue")}
            </span>
          ) : null}
          {task.status === "blocked" ? (
            <span
              className="inline-flex items-center rounded-full border border-state-warning/50 bg-state-warning/10 px-2 py-0.5 text-state-warning"
              data-testid="task-flag-blocked"
            >
              {t("flags.blocked")}
            </span>
          ) : null}
          {task.projectId ? (
            <Link
              href={
                `/dashboard/tasks?project=${task.projectId}` as "/dashboard"
              }
              className="underline decoration-dotted underline-offset-2 hover:text-brand-blue"
            >
              {t("projectLinked")}
            </Link>
          ) : null}
        </div>

        {/* Status transitions — every control a real RPC-backed action. */}
        <div className="flex flex-wrap items-center gap-2">
          {TRANSITIONS[task.status].map(({ action, to }) => (
            <form key={action} action={setWorkTaskStatusAction}>
              {hiddenContext()}
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value={to} />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                data-testid={`task-action-${action}-${task.id}`}
              >
                {t(`actions.${action}`)}
              </Button>
            </form>
          ))}
        </div>

        {/* Bounded field edit — native <details>, keyboard accessible. */}
        <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
          <summary className="cursor-pointer text-xs text-text-secondary">
            {t("actions.details")}
          </summary>
          <form
            action={updateWorkTaskAction}
            className="mt-2 flex flex-col gap-2"
          >
            {hiddenContext()}
            <input type="hidden" name="taskId" value={task.id} />
            <label className="flex flex-col gap-1">
              <Label>{t("form.titleLabel")}</Label>
              <Input
                name="title"
                defaultValue={task.title}
                minLength={WORK_TASK_TITLE_MIN}
                maxLength={WORK_TASK_TITLE_MAX}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.descriptionLabel")}</Label>
              <textarea
                name="description"
                defaultValue={task.description ?? ""}
                maxLength={WORK_TASK_DESCRIPTION_MAX}
                rows={3}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.priorityLabel")}</Label>
              <Select name="priority" defaultValue={task.priority}>
                {WORK_TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.dueLabel")}</Label>
              <Input
                name="dueDate"
                type="date"
                defaultValue={task.dueAt ? task.dueAt.slice(0, 10) : ""}
              />
            </label>
            <Button type="submit" variant="secondary" size="sm">
              {t("actions.save")}
            </Button>
          </form>
        </details>
      </li>
    );
  }

  function TaskList({
    tasks,
    emptyLabel,
    testid,
  }: {
    tasks: readonly WorkTask[];
    emptyLabel: string;
    testid: string;
  }) {
    if (tasks.length === 0) {
      return (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid={`${testid}-empty`}
        >
          {emptyLabel}
        </p>
      );
    }
    return (
      <ul className="flex flex-col gap-2" data-testid={testid}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </ul>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Page states                                                       */
  /* ---------------------------------------------------------------- */

  const header = (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("intro")}</p>
    </header>
  );

  if (myResult.status === "not-authed") {
    return (
      <div className="flex flex-col gap-6" data-testid="tasks-page">
        {header}
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("notAuthed")}
        </p>
      </div>
    );
  }

  if (myResult.status === "needs-migration") {
    // Calm honest pre-apply state (the bookings/handover pattern): the
    // owner-gated D2 migration is not applied yet — no fake UI, no controls.
    return (
      <div className="flex flex-col gap-6" data-testid="tasks-page">
        {header}
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="tasks-unavailable"
        >
          {t("unavailable")}
        </p>
      </div>
    );
  }

  const myTasks = myResult.tasks;
  const openTasks = myTasks.filter((task) => isOpen(task.status));
  const closedTasks = myTasks.filter((task) => !isOpen(task.status));

  return (
    <div className="flex flex-col gap-6" data-testid="tasks-page">
      {header}

      {notice ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            notice === "created" || notice === "updated"
              ? "border-state-success/50 bg-state-success/10 text-state-success"
              : "border-state-warning/50 bg-state-warning/10 text-text-primary"
          }`}
          data-testid={`tasks-notice-${notice}`}
        >
          {t(`notice.${notice}`)}
        </p>
      ) : null}

      {/* Internal-only honesty note — a task contacts nobody. */}
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="tasks-honest-note"
      >
        {t("honestNote")}
      </p>

      {myResult.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("loadError")}
        </p>
      ) : null}

      {/* View switch — plain searchParams links, the activity-centre pattern. */}
      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label={t("views.label")}
        data-testid="tasks-view-switch"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("views.label")}
        </span>
        <Link
          href={tasksHref({ project: projectFilter }) as "/dashboard"}
          aria-current={view === "my" ? "true" : undefined}
          data-testid="tasks-view-my"
          className={`${CHIP_BASE} ${view === "my" ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("views.my")}
        </Link>
        <Link
          href={
            tasksHref({ view: "board", project: projectFilter }) as "/dashboard"
          }
          aria-current={view === "board" ? "true" : undefined}
          data-testid="tasks-view-board"
          className={`${CHIP_BASE} ${view === "board" ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("views.board")}
        </Link>
      </nav>

      {/* Create — a real RPC-backed form. Self-assign is the default; a
          project select appears only with the caller's own manageable
          projects (RLS read — workers simply see none). No people-picker.
          Density pass (worker-workspace UX audit v2): collapsed into a
          disclosure so the OPEN TASKS lead the page — the ~10-field form no
          longer pushes the task list below the fold. Same form, same action. */}
      <details
        className="group rounded-md border border-ink-500 bg-ink-800/30"
        data-testid="tasks-create"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-display text-lg font-semibold tracking-tight text-text-primary [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="text-text-muted transition-transform group-open:rotate-90">›</span>
          {t("form.title")}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
        <form action={createWorkTaskAction} className="flex flex-col gap-3">
          {hiddenContext()}
          <label className="flex flex-col gap-1">
            <Label>{t("form.titleLabel")}</Label>
            <Input
              name="title"
              placeholder={t("form.titlePlaceholder")}
              minLength={WORK_TASK_TITLE_MIN}
              maxLength={WORK_TASK_TITLE_MAX}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>{t("form.descriptionLabel")}</Label>
            <textarea
              name="description"
              maxLength={WORK_TASK_DESCRIPTION_MAX}
              rows={3}
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Label>{t("form.priorityLabel")}</Label>
              <Select name="priority" defaultValue="normal">
                {WORK_TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.dueLabel")}</Label>
              <Input name="dueDate" type="date" />
            </label>
          </div>
          {managedProjects.length > 0 ? (
            <label className="flex flex-col gap-1">
              <Label>{t("form.projectLabel")}</Label>
              <Select name="projectId" defaultValue={projectFilter ?? ""}>
                <option value="">{t("form.projectNone")}</option>
                {managedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title ?? p.id.slice(0, 8)}
                    {p.city ? ` — ${p.city}` : ""}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              name="assignSelf"
              defaultChecked
              className="h-4 w-4 rounded border-ink-500 bg-ink-700 accent-brand-blue"
            />
            {t("form.assignSelfLabel")}
          </label>
          <p className="text-xs text-text-muted">{t("form.assignSelfHint")}</p>
          <div>
            <Button type="submit" size="sm" data-testid="tasks-create-submit">
              {t("form.submit")}
            </Button>
          </div>
        </form>
        </div>
      </details>

      {/* Project-filtered section (linked from project operations). RLS
          scopes the read — a non-manager of the project simply sees less. */}
      {projectFilter && projectResult && projectResult.status === "ok" ? (
        <section className="flex flex-col gap-3" data-testid="tasks-project">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
              {t("projectTasks.title")}
            </h2>
            <Link
              href={tasksHref({ view: view === "board" ? "board" : null }) as "/dashboard"}
              className="text-xs text-brand-blue hover:underline"
              data-testid="tasks-project-clear"
            >
              {t("projectTasks.back")}
            </Link>
          </div>
          <TaskList
            tasks={projectResult.tasks}
            emptyLabel={t("projectTasks.empty")}
            testid="tasks-project-list"
          />
        </section>
      ) : null}

      {view === "board" ? (
        /* Board — four columns of the same real rows. Accessible sections
           with headings; transitions are the same inline forms. */
        <section
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="tasks-board"
        >
          {BOARD_COLUMNS.map((status) => {
            const column = myTasks.filter((task) => task.status === status);
            return (
              <section
                key={status}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/20 p-3"
                data-testid={`tasks-board-column-${status}`}
              >
                <h3 className="flex items-center justify-between font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t(`status.${status}`)}
                  <span className="tabular-nums text-text-muted">
                    {column.length}
                  </span>
                </h3>
                <TaskList
                  tasks={column}
                  emptyLabel={t("board.columnEmpty")}
                  testid={`tasks-board-list-${status}`}
                />
              </section>
            );
          })}
        </section>
      ) : (
        /* My tasks — open groups by status; done/cancelled behind a link. */
        <section className="flex flex-col gap-4" data-testid="tasks-my">
          {openTasks.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary"
              data-testid="tasks-my-empty"
            >
              {t("myEmpty")}
            </p>
          ) : (
            OPEN_GROUPS.map((status) => {
              const group = openTasks.filter((task) => task.status === status);
              if (group.length === 0) return null;
              return (
                <div key={status} className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-secondary">
                    {t(`status.${status}`)}
                    <span className="tabular-nums text-text-muted">
                      {group.length}
                    </span>
                  </h2>
                  <TaskList
                    tasks={group}
                    emptyLabel={t("myEmpty")}
                    testid={`tasks-group-${status}`}
                  />
                </div>
              );
            })
          )}

          {/* Finished tasks collapse behind an honest link toggle. */}
          <div className="flex flex-col gap-2">
            <Link
              href={
                tasksHref({
                  project: projectFilter,
                  closed: !showClosed,
                }) as "/dashboard"
              }
              className="self-start text-xs text-brand-blue hover:underline"
              data-testid="tasks-closed-toggle"
            >
              {showClosed
                ? t("closed.hide")
                : `${t("closed.show")} (${closedTasks.length})`}
            </Link>
            {showClosed ? (
              CLOSED_GROUPS.map((status) => {
                const group = closedTasks.filter(
                  (task) => task.status === status,
                );
                if (group.length === 0) return null;
                return (
                  <div key={status} className="flex flex-col gap-2">
                    <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t(`status.${status}`)}
                    </h2>
                    <TaskList
                      tasks={group}
                      emptyLabel={t("closed.empty")}
                      testid={`tasks-group-${status}`}
                    />
                  </div>
                );
              })
            ) : null}
            {showClosed && closedTasks.length === 0 ? (
              <p className="text-xs text-text-muted">{t("closed.empty")}</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
