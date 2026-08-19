import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Link } from "@/lib/i18n/navigation";
import { WorkflowTimeline } from "@/components/app/workflow-timeline";
import {
  createStandardTimesheetTemplateAction,
  createTimesheetAction,
  refreshTimesheetAction,
  reopenTimesheetAction,
  submitTimesheetAction,
  syncTimesheetDecisionAction,
} from "@/lib/timesheets/timesheets-actions";
import {
  TIMESHEET_REOPEN_NOTE_MAX,
  currentMonthPeriod,
  isEditableTimesheetStatus,
  isReopenableTimesheetStatus,
  type TimesheetNotice,
  type TimesheetRow,
} from "@/lib/timesheets/timesheets-model";
import {
  getTimesheetsOverview,
  type TimesheetTemplateState,
  type TimesheetWorkflowState,
} from "@/lib/timesheets/timesheets";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Timesheets area of the planning (calendar) page — the audit's MISSING
 * "timesheet" row made real.
 *
 * Constitution note: deliberately NOT a new dashboard route. The blessed
 * pattern for new capability is expansion INSIDE an existing declared
 * surface (the network #approvals precedent); the calendar is the
 * time-and-periods surface, a timesheet is a period document over the same
 * journal-derived time facts the calendar already renders, so the area
 * lives here under the #timesheets anchor.
 *
 * DERIVED, NEVER A SECOND HOURS STORE: every number shown is a frozen or
 * recomputed COPY of journal work-item hours. Editing hours happens in the
 * Work Journal; approval decisions happen in the approvals area on
 * /dashboard/network (the canonical Workflow & Approval Engine) — this
 * section links to both and re-implements neither.
 *
 * Honest degradation: while the human-gated timesheets migration is
 * unapplied the whole area shows a calm "not enabled yet" state; an org
 * without a published timesheet template gets a clear message (and org
 * admins a one-click standard template) instead of a dead submit button.
 */

const STATUS_TONE: Record<TimesheetRow["status"], string> = {
  draft: "border-ink-500 text-text-muted",
  submitted: "border-brand-blue/50 text-brand-blue",
  approved: "border-state-success/50 text-state-success",
  rejected: "border-state-danger/50 text-state-danger",
  reopened: "border-state-warning/50 text-state-warning",
};

const SUCCESS_NOTICES: readonly TimesheetNotice[] = [
  "created",
  "refreshed",
  "submitted",
  "reopened",
  "approved",
  "template_created",
];

export async function TimesheetsSection({
  locale,
  notice,
}: {
  locale: string;
  notice: TimesheetNotice | null;
}) {
  const t = await getTranslations("timesheets");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });
  const overview = await getTimesheetsOverview();

  if (overview.status === "not-authed") return null;

  const header = (
    <div className="flex flex-col gap-1">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {t("title")}
      </h2>
      <p className="text-xs text-text-muted">{t("intro")}</p>
    </div>
  );

  const noticeBanner = notice ? (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${
        (SUCCESS_NOTICES as readonly string[]).includes(notice)
          ? "border-state-success/50 bg-state-success/10 text-state-success"
          : "border-state-warning/50 bg-state-warning/10 text-text-primary"
      }`}
      data-testid={`timesheets-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  if (overview.status === "needs-migration") {
    return (
      <section
        id="timesheets"
        className="flex flex-col gap-3"
        data-testid="timesheets-section"
      >
        {header}
        {noticeBanner}
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="timesheets-needs-migration"
        >
          {t("needsMigration")}
        </p>
      </section>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const defaultPeriod = currentMonthPeriod(today);
  const fmt = (d: string) => dateFmt(d) ?? d;

  function totalsLine(sheet: TimesheetRow): string {
    const parts = [
      t("totals.hours", { hours: sheet.snapshot.totals.totalHours }),
    ];
    if (sheet.snapshot.totals.totalDayUnits > 0) {
      parts.push(t("totals.dayUnits", { days: sheet.snapshot.totals.totalDayUnits }));
    }
    parts.push(t("totals.lines", { count: sheet.snapshot.totals.lineCount }));
    return parts.join(" · ");
  }

  function SheetLines({ sheet }: { sheet: TimesheetRow }) {
    if (sheet.snapshot.lines.length === 0) {
      return <p className="text-xs text-text-muted">{t("noLines")}</p>;
    }
    return (
      <ul className="flex flex-col gap-1" data-testid={`timesheet-lines-${sheet.id}`}>
        {sheet.snapshot.lines.map((line) => (
          <li
            key={line.lineKey}
            className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
          >
            <span className="font-mono text-meta text-text-muted">{line.day}</span>
            <span className="min-w-0 break-words">{line.title}</span>
            <span className="font-mono tabular-nums">
              {line.value} {t(`unit.${line.unit}`)}
            </span>
            {line.projectTitle ? (
              <span className="text-text-muted">{line.projectTitle}</span>
            ) : null}
            {/* Chain step A. Attributed only when exactly one live task link
                exists; more than one is stated plainly rather than guessed. */}
            {line.taskTitle ? (
              <span className="text-text-secondary">{line.taskTitle}</span>
            ) : line.taskLinkCount > 1 ? (
              <span className="text-text-muted">
                {t("taskAmbiguous", { count: line.taskLinkCount })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  function WorkflowBlock({
    sheet,
    wf,
  }: {
    sheet: TimesheetRow;
    wf: TimesheetWorkflowState | undefined;
  }) {
    if (!wf) return null;
    return (
      <details className="rounded-md border border-ink-600 bg-ink-800/20 p-2">
        <summary className="cursor-pointer text-xs text-text-secondary">
          {t("approvalTimeline")}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <WorkflowTimeline
            locale={locale}
            steps={wf.steps}
            slots={wf.slots}
            transitions={wf.transitions}
          />
          <Link
            href={"/dashboard/network#approvals" as "/dashboard"}
            className="text-xs text-brand-blue underline-offset-2 hover:underline"
            data-testid={`timesheet-approvals-link-${sheet.id}`}
          >
            {t("openApprovals")}
          </Link>
        </div>
      </details>
    );
  }

  const templateFor = (orgId: string): TimesheetTemplateState | undefined =>
    overview.templates.get(orgId);

  return (
    <section
      id="timesheets"
      className="flex flex-col gap-4"
      data-testid="timesheets-section"
    >
      {header}
      {noticeBanner}
      {overview.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-xs text-text-primary">
          {t("readError")}
        </p>
      ) : null}

      {/* ── My documents (worker side) ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("mine.title")}
        </h3>
        <p className="text-xs text-text-muted">{t("mine.derivedNote")}</p>

        {overview.orgOptions.length > 0 ? (
          <form
            action={createTimesheetAction}
            className="flex flex-wrap items-end gap-2 rounded-md border border-ink-600 bg-ink-800/20 p-3"
            data-testid="timesheet-create-form"
          >
            <input type="hidden" name="locale" value={locale} />
            <div className="flex flex-col gap-1">
              <Label>{t("create.organization")}</Label>
              <Select id="timesheet-org" name="organizationId" required>
                {overview.orgOptions.map((o) => (
                  <option key={o.organizationId} value={o.organizationId}>
                    {o.name ?? t("create.unnamedOrganization")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t("create.periodStart")}</Label>
              <Input
                id="timesheet-start"
                type="date"
                name="periodStart"
                defaultValue={defaultPeriod.start}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t("create.periodEnd")}</Label>
              <Input
                id="timesheet-end"
                type="date"
                name="periodEnd"
                defaultValue={defaultPeriod.end}
                required
              />
            </div>
            <Button type="submit" data-testid="timesheet-create-submit">
              {t("create.action")}
            </Button>
            <p className="w-full text-xs text-text-muted">{t("create.hint")}</p>
          </form>
        ) : (
          <p className="text-xs text-text-muted">{t("mine.noOrganizations")}</p>
        )}

        {overview.mine.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
            data-testid="timesheets-mine-empty"
          >
            {t("mine.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="timesheets-mine-list">
            {overview.mine.map((sheet) => {
              const wf = overview.workflows.get(sheet.id);
              const template = templateFor(sheet.organizationId);
              const editable = isEditableTimesheetStatus(sheet.status);
              return (
                <li
                  key={sheet.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                  data-testid={`timesheet-${sheet.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {fmt(sheet.periodStart)} – {fmt(sheet.periodEnd)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[sheet.status]}`}
                      data-testid={`timesheet-status-${sheet.id}`}
                    >
                      {t(`status.${sheet.status}`)}
                    </span>
                    <span className="text-meta text-text-muted">
                      {totalsLine(sheet)}
                    </span>
                  </div>
                  <details className="rounded-md border border-ink-600 bg-ink-800/20 p-2">
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {t("linesTitle", { count: sheet.snapshot.totals.lineCount })}
                    </summary>
                    <div className="mt-2">
                      <SheetLines sheet={sheet} />
                    </div>
                  </details>
                  <WorkflowBlock sheet={sheet} wf={wf} />
                  <div className="flex flex-wrap items-center gap-2">
                    {editable ? (
                      <>
                        <form action={refreshTimesheetAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="timesheetId" value={sheet.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            data-testid={`timesheet-refresh-${sheet.id}`}
                          >
                            {t("actions.refresh")}
                          </Button>
                        </form>
                        {template?.published ? (
                          <form action={submitTimesheetAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="timesheetId" value={sheet.id} />
                            <Button
                              type="submit"
                              data-testid={`timesheet-submit-${sheet.id}`}
                            >
                              {t("actions.submit")}
                            </Button>
                          </form>
                        ) : (
                          <span
                            className="text-xs text-text-muted"
                            data-testid={`timesheet-no-template-${sheet.id}`}
                          >
                            {t("noTemplateNote")}
                          </span>
                        )}
                      </>
                    ) : null}
                    {sheet.status === "submitted" ? (
                      <form action={syncTimesheetDecisionAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="timesheetId" value={sheet.id} />
                        <Button
                          type="submit"
                          variant="secondary"
                          data-testid={`timesheet-sync-${sheet.id}`}
                        >
                          {t("actions.sync")}
                        </Button>
                      </form>
                    ) : null}
                    <a
                      href={`/${locale}/dashboard/planning/timesheets/${sheet.id}/export`}
                      className="text-xs text-brand-blue underline-offset-2 hover:underline"
                      data-testid={`timesheet-export-${sheet.id}`}
                    >
                      {t("actions.exportCsv")}
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Documents of workers I manage (org side) ───────────────────── */}
      {overview.org.length > 0 || overview.orgOptions.some((o) => !templateFor(o.organizationId)?.published) ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("org.title")}
          </h3>
          <p className="text-xs text-text-muted">{t("org.decideNote")}</p>

          {/* Honest template state + one-click standard template. The engine
              itself re-checks governance authority — a non-admin pressing
              this simply hears not_authorized, nothing silently happens. */}
          {overview.orgOptions
            .filter((o) => !templateFor(o.organizationId)?.published)
            .map((o) => (
              <form
                key={o.organizationId}
                action={createStandardTimesheetTemplateAction}
                className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/20 p-3"
                data-testid={`timesheet-template-offer-${o.organizationId}`}
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="organizationId" value={o.organizationId} />
                <span className="text-xs text-text-secondary">
                  {t("org.noTemplateFor", {
                    name: o.name ?? t("create.unnamedOrganization"),
                  })}
                </span>
                <Button type="submit" variant="secondary">
                  {t("org.createTemplate")}
                </Button>
              </form>
            ))}

          {overview.org.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="timesheets-org-list">
              {overview.org.map((sheet) => {
                const wf = overview.workflows.get(sheet.id);
                return (
                  <li
                    key={sheet.id}
                    className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                    data-testid={`timesheet-org-${sheet.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {overview.workerNames.get(sheet.workerId) ??
                          t("org.unnamedWorker")}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {fmt(sheet.periodStart)} – {fmt(sheet.periodEnd)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[sheet.status]}`}
                      >
                        {t(`status.${sheet.status}`)}
                      </span>
                      <span className="text-meta text-text-muted">
                        {totalsLine(sheet)}
                      </span>
                    </div>
                    <details className="rounded-md border border-ink-600 bg-ink-800/20 p-2">
                      <summary className="cursor-pointer text-xs text-text-secondary">
                        {t("linesTitle", { count: sheet.snapshot.totals.lineCount })}
                      </summary>
                      <div className="mt-2">
                        <SheetLines sheet={sheet} />
                      </div>
                    </details>
                    <WorkflowBlock sheet={sheet} wf={wf} />
                    <div className="flex flex-wrap items-center gap-2">
                      {sheet.status === "submitted" ? (
                        <Link
                          href={"/dashboard/network#approvals" as "/dashboard"}
                          className="text-xs text-brand-blue underline-offset-2 hover:underline"
                        >
                          {t("org.decideInApprovals")}
                        </Link>
                      ) : null}
                      {isReopenableTimesheetStatus(sheet.status) ? (
                        <form
                          action={reopenTimesheetAction}
                          className="flex flex-wrap items-end gap-2"
                          data-testid={`timesheet-reopen-form-${sheet.id}`}
                        >
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="timesheetId" value={sheet.id} />
                          <div className="flex flex-col gap-1">
                            <Label>
                              {t("org.reopenNote")}
                            </Label>
                            <Input
                              id={`reopen-note-${sheet.id}`}
                              name="note"
                              maxLength={TIMESHEET_REOPEN_NOTE_MAX}
                              required
                              placeholder={t("org.reopenNotePlaceholder")}
                            />
                          </div>
                          <Button type="submit" variant="secondary">
                            {t("org.reopen")}
                          </Button>
                        </form>
                      ) : null}
                      <a
                        href={`/${locale}/dashboard/planning/timesheets/${sheet.id}/export`}
                        className="text-xs text-brand-blue underline-offset-2 hover:underline"
                      >
                        {t("actions.exportCsv")}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
