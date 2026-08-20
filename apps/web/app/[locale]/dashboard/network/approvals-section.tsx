import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { WorkflowTimeline } from "@/components/app/workflow-timeline";
import {
  createWorkflowDefinitionAction,
  cancelWorkflowInstanceAction,
  decideWorkflowStepAction,
  delegateWorkflowStepAction,
  markOverdueWorkflowStepsAction,
  publishWorkflowVersionAction,
  startWorkflowRequestAction,
  withdrawWorkflowInstanceAction,
} from "@/lib/approvals/approvals-actions";
import {
  WORKFLOW_APPROVAL_MODES,
  WORKFLOW_AUTHORABLE_CONTEXT_TYPES,
  WORKFLOW_FORM_RULES,
  WORKFLOW_MAX_FORM_STEPS,
  WORKFLOW_NAME_MAX,
  WORKFLOW_NAME_MIN,
  WORKFLOW_REASON_MAX,
  WORKFLOW_STEP_NAME_MAX,
  WORKFLOW_STEP_NAME_MIN,
  WORKFLOW_TITLE_MAX,
  WORKFLOW_TITLE_MIN,
  WORKFLOW_DETAILS_MAX,
  type WorkflowInstanceRow,
  type WorkflowNotice,
} from "@/lib/approvals/approvals-model";
import {
  getApprovalsOverview,
  getWorkflowTemplateAdministration,
  listVisibleWorkflowDefinitions,
  type ApprovalsOverviewResult,
} from "@/lib/approvals/approvals";
import { createUtcFormatter } from "@/lib/time/display";
import { WorkflowTemplatesPanel } from "./workflow-templates-panel";

/**
 * Approvals area of the network page (Workflow & Approval Engine v1).
 *
 * Constitution note: this is deliberately NOT a new dashboard route. The
 * product constitution blocks new pages without an owner ruling, and the
 * blessed pattern for new capability is expansion INSIDE an existing
 * declared surface (the reports `?journalWindow=` precedent). The network
 * page is the org-relationship surface, approvals are org-relationship
 * governance, so the area lives here under the #approvals anchor.
 *
 * Every control is a REAL action: all writes are NATIVE-NAV server-action
 * forms over the eight gated engine commands, redirecting back here with an
 * honest `?wf=` outcome banner. While the human-gated engine migration is
 * unapplied the whole area shows the calm "not enabled yet" state — no fake
 * rows, no fake controls.
 *
 * INTERNAL ONLY: deciding here contacts nobody outside the product — no
 * email, no SMS, no push, no outbound call. Durable in-app notices ride the
 * existing notification bell.
 */

const INSTANCE_TONE: Record<WorkflowInstanceRow["status"], string> = {
  pending: "border-brand-blue/50 text-brand-blue",
  approved: "border-state-success/50 text-state-success",
  rejected: "border-state-danger/50 text-state-danger",
  withdrawn: "border-ink-500 text-text-muted",
  cancelled: "border-ink-500 text-text-muted",
};

export async function ApprovalsSection({
  locale,
  notice,
  organizations,
}: {
  locale: string;
  notice: WorkflowNotice | null;
  organizations: readonly { id: string; name: string }[];
}) {
  const t = await getTranslations("approvals");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });

  const [overview, definitionsResult, templateAdmin] = await Promise.all([
    getApprovalsOverview(organizations.map((o) => o.id)),
    listVisibleWorkflowDefinitions(),
    getWorkflowTemplateAdministration(organizations.map((o) => o.id)),
  ]);

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
        [
          "created",
          "published",
          "started",
          "approved",
          "step_approved",
          "recorded",
          "delegated",
          "marked_overdue",
        ].includes(notice)
          ? "border-state-success/50 bg-state-success/10 text-state-success"
          : "border-state-warning/50 bg-state-warning/10 text-text-primary"
      }`}
      data-testid={`approvals-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  if (overview.status === "not-authed") {
    return null;
  }

  if (
    overview.status === "needs-migration" ||
    definitionsResult.status === "needs-migration"
  ) {
    // Calm honest pre-apply state (the tasks/bookings pattern): the
    // human-gated engine migration is not applied yet — no fake UI.
    return (
      <section
        id="approvals"
        className="flex flex-col gap-3"
        data-testid="network-approvals"
      >
        {header}
        {noticeBanner}
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="approvals-unavailable"
        >
          {t("unavailable")}
        </p>
      </section>
    );
  }

  const ok = overview as Extract<ApprovalsOverviewResult, { status: "ok" }>;
  const definitions =
    definitionsResult.status === "ok" ? definitionsResult.definitions : [];
  const startableDefinitions = definitions.filter(
    (d) => d.isActive && d.latestVersionPublished,
  );
  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));

  function hiddenLocale() {
    return <input type="hidden" name="locale" value={locale} />;
  }

  function timelineFor(instanceId: string) {
    return (
      <details className="rounded-md border border-ink-600 bg-ink-800/20 p-2">
        <summary className="cursor-pointer text-xs text-text-secondary">
          {t("timeline.open")}
        </summary>
        <div className="mt-2">
          <WorkflowTimeline
            locale={locale}
            steps={ok.steps.get(instanceId) ?? []}
            slots={ok.slots.get(instanceId) ?? []}
            transitions={ok.transitions.get(instanceId) ?? []}
          />
        </div>
      </details>
    );
  }

  return (
    <section
      id="approvals"
      className="flex flex-col gap-4"
      data-testid="network-approvals"
    >
      {header}
      {noticeBanner}

      {/* Internal-only honesty note — a decision here contacts nobody. */}
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="approvals-honest-note"
      >
        {t("honestNote")}
      </p>

      {ok.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("loadError")}
        </p>
      ) : null}

      {/* ── Waiting on me ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="approvals-inbox">
        <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {t("inbox.title")}
          <span className="ml-2 tabular-nums text-text-muted">
            {ok.inbox.length}
          </span>
        </h3>
        {ok.inbox.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted"
            data-testid="approvals-inbox-empty"
          >
            {t("inbox.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ok.inbox.map(({ instance, step }) => (
              <li
                key={instance.id}
                className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                data-testid={`approvals-inbox-${instance.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-text-primary">
                    {instance.title}
                  </p>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("inbox.stepLabel")}: {step.name}
                  </span>
                  {step.status === "escalated" ? (
                    <span className="inline-flex items-center rounded-full border border-state-warning/50 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">
                      {t("stepStatus.escalated")}
                    </span>
                  ) : null}
                  <span className="text-meta text-text-muted">
                    {dateFmt(instance.createdAt)}
                  </span>
                </div>

                {/* Decide — one form, two honest submit verbs, shared reason. */}
                <form
                  action={decideWorkflowStepAction}
                  className="flex flex-col gap-2"
                >
                  {hiddenLocale()}
                  <input type="hidden" name="instanceId" value={instance.id} />
                  <label className="flex flex-col gap-1">
                    <Label>{t("form.reasonLabel")}</Label>
                    <Input
                      name="reason"
                      maxLength={WORKFLOW_REASON_MAX}
                      placeholder={t("form.reasonOptional")}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="submit"
                      name="decision"
                      value="approved"
                      size="sm"
                      data-testid={`approvals-approve-${instance.id}`}
                    >
                      {t("actions.approve")}
                    </Button>
                    <Button
                      type="submit"
                      name="decision"
                      value="rejected"
                      variant="secondary"
                      size="sm"
                      data-testid={`approvals-reject-${instance.id}`}
                    >
                      {t("actions.reject")}
                    </Button>
                  </div>
                </form>

                {/* Delegate — hand the slot to a same-org colleague. */}
                <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
                  <summary className="cursor-pointer text-xs text-text-secondary">
                    {t("actions.delegate")}
                  </summary>
                  <form
                    action={delegateWorkflowStepAction}
                    className="mt-2 flex flex-col gap-2"
                  >
                    {hiddenLocale()}
                    <input
                      type="hidden"
                      name="instanceId"
                      value={instance.id}
                    />
                    <label className="flex flex-col gap-1">
                      <Label>{t("form.delegateEmailLabel")}</Label>
                      <Input name="toEmail" type="email" required />
                    </label>
                    <p className="text-xs text-text-muted">
                      {t("form.delegateHint")}
                    </p>
                    <label className="flex flex-col gap-1">
                      <Label>{t("form.reasonLabel")}</Label>
                      <Input name="reason" maxLength={WORKFLOW_REASON_MAX} />
                    </label>
                    <div>
                      <Button type="submit" variant="secondary" size="sm">
                        {t("actions.delegateSubmit")}
                      </Button>
                    </div>
                  </form>
                </details>

                {timelineFor(instance.id)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── New request ──────────────────────────────────────────────── */}
      {startableDefinitions.length > 0 ? (
        <details
          className="group rounded-md border border-ink-500 bg-ink-800/30"
          data-testid="approvals-start"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-display text-lg font-semibold tracking-tight text-text-primary [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="text-text-muted transition-transform group-open:rotate-90"
            >
              ›
            </span>
            {t("start.title")}
          </summary>
          <form
            action={startWorkflowRequestAction}
            className="flex flex-col gap-3 px-4 pb-4"
          >
            {hiddenLocale()}
            <label className="flex flex-col gap-1">
              <Label>{t("start.definitionLabel")}</Label>
              <Select name="definitionId" required>
                {startableDefinitions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {orgNameById.get(d.organizationId)
                      ? ` — ${orgNameById.get(d.organizationId)}`
                      : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("start.titleLabel")}</Label>
              <Input
                name="title"
                minLength={WORKFLOW_TITLE_MIN}
                maxLength={WORKFLOW_TITLE_MAX}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("start.detailsLabel")}</Label>
              <textarea
                name="details"
                maxLength={WORKFLOW_DETAILS_MAX}
                rows={3}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
              />
            </label>
            <div>
              <Button type="submit" size="sm" data-testid="approvals-start-submit">
                {t("start.submit")}
              </Button>
            </div>
          </form>
        </details>
      ) : null}

      {/* ── My requests ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="approvals-my-requests">
        <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {t("myRequests.title")}
        </h3>
        {ok.myRequests.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted">
            {t("myRequests.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ok.myRequests.map((instance) => (
              <li
                key={instance.id}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3"
                data-testid={`approvals-request-${instance.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-text-primary">
                    {instance.title}
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${INSTANCE_TONE[instance.status]}`}
                  >
                    {t(`status.${instance.status}`)}
                  </span>
                  <span className="text-meta text-text-muted">
                    {dateFmt(instance.createdAt)}
                  </span>
                  {instance.status === "pending" ? (
                    <form action={withdrawWorkflowInstanceAction}>
                      {hiddenLocale()}
                      <input
                        type="hidden"
                        name="instanceId"
                        value={instance.id}
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        data-testid={`approvals-withdraw-${instance.id}`}
                      >
                        {t("actions.withdraw")}
                      </Button>
                    </form>
                  ) : null}
                </div>
                {timelineFor(instance.id)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Org administration (governance owner/admin surfaces) ─────── */}
      {organizations.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="approvals-admin">
          <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            {t("admin.title")}
          </h3>

          {/* Pending requests across my organizations. */}
          {ok.orgPending.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="approvals-org-pending">
              {ok.orgPending.map((instance) => (
                <li
                  key={instance.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-medium text-text-primary">
                      {instance.title}
                    </p>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {orgNameById.get(instance.organizationId) ?? ""}
                    </span>
                    <span className="text-meta text-text-muted">
                      {dateFmt(instance.createdAt)}
                    </span>
                    <form action={cancelWorkflowInstanceAction}>
                      {hiddenLocale()}
                      <input
                        type="hidden"
                        name="instanceId"
                        value={instance.id}
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        data-testid={`approvals-cancel-${instance.id}`}
                      >
                        {t("actions.cancel")}
                      </Button>
                    </form>
                  </div>
                  {timelineFor(instance.id)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted">{t("admin.noPending")}</p>
          )}

          {/* Overdue check — marks + notifies, NEVER approves anything. */}
          <div className="flex flex-wrap items-center gap-2">
            {organizations.map((o) => (
              <form key={o.id} action={markOverdueWorkflowStepsAction}>
                {hiddenLocale()}
                <input type="hidden" name="organizationId" value={o.id} />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  data-testid={`approvals-overdue-${o.id}`}
                >
                  {t("actions.markOverdue")} — {o.name}
                </Button>
              </form>
            ))}
          </div>
          <p className="text-xs text-text-muted">{t("admin.overdueHint")}</p>

          {/* Templates: list + publish. */}
          <div className="flex flex-col gap-2" data-testid="approvals-templates">
            <h4 className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {t("templates.title")}
            </h4>
            {definitions.length === 0 ? (
              <p className="text-xs text-text-muted">{t("templates.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {definitions.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
                    data-testid={`approvals-template-${d.slug}`}
                  >
                    <span className="text-sm text-text-primary">{d.name}</span>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t(`contextType.${d.contextEntityType}`)}
                    </span>
                    <span className="text-meta text-text-muted">
                      {t("templates.stepCount", { count: d.stepCount })}
                    </span>
                    {d.latestVersionPublished ? (
                      <span className="inline-flex items-center rounded-full border border-state-success/50 bg-state-success/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-success">
                        {t("templates.published")}
                      </span>
                    ) : d.latestVersionId ? (
                      <form action={publishWorkflowVersionAction}>
                        {hiddenLocale()}
                        <input
                          type="hidden"
                          name="versionId"
                          value={d.latestVersionId}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          data-testid={`approvals-publish-${d.slug}`}
                        >
                          {t("actions.publish")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Template administration (template management v1): the default
              pack in one click, the live approver resolution per step, new
              versions and activate/retire — for the organizations this
              person governs. The list above stays the plain read-only
              overview of every template they can SEE. */}
          <WorkflowTemplatesPanel
            locale={locale}
            organizations={organizations}
            admin={templateAdmin}
          />

          {/* Create a template (1..3 ordered approval rounds). */}
          <details
            className="group rounded-md border border-ink-500 bg-ink-800/30"
            data-testid="approvals-create-template"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-display text-lg font-semibold tracking-tight text-text-primary [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="text-text-muted transition-transform group-open:rotate-90"
              >
                ›
              </span>
              {t("templates.createTitle")}
            </summary>
            <form
              action={createWorkflowDefinitionAction}
              className="flex flex-col gap-3 px-4 pb-4"
            >
              {hiddenLocale()}
              <label className="flex flex-col gap-1">
                <Label>{t("templates.orgLabel")}</Label>
                <Select name="organizationId" required>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("templates.nameLabel")}</Label>
                <Input
                  name="name"
                  minLength={WORKFLOW_NAME_MIN}
                  maxLength={WORKFLOW_NAME_MAX}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("templates.contextLabel")}</Label>
                {/* Derived from the canonical vocabulary, never re-listed:
                    a second hardcoded list is how `work_task` stayed
                    unreachable while the engine, the action and all 11 locales
                    already supported it. */}
                <Select name="contextEntityType" defaultValue="generic_request">
                  {WORKFLOW_AUTHORABLE_CONTEXT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {t(`contextType.${c}`)}
                    </option>
                  ))}
                </Select>
              </label>
              {Array.from({ length: WORKFLOW_MAX_FORM_STEPS }, (_, i) => i + 1).map(
                (n) => (
                  <fieldset
                    key={n}
                    className="flex flex-col gap-2 rounded-md border border-ink-600 p-3"
                  >
                    <legend className="px-1 font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("templates.stepLegend", { n })}
                      {n > 1 ? ` (${t("templates.optional")})` : ""}
                    </legend>
                    <label className="flex flex-col gap-1">
                      <Label>{t("templates.stepNameLabel")}</Label>
                      <Input
                        name={`step${n}Name`}
                        minLength={WORKFLOW_STEP_NAME_MIN}
                        maxLength={WORKFLOW_STEP_NAME_MAX}
                        required={n === 1}
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <Label>{t("templates.modeLabel")}</Label>
                        <Select name={`step${n}Mode`} defaultValue="single">
                          {WORKFLOW_APPROVAL_MODES.map((m) => (
                            <option key={m} value={m}>
                              {t(`mode.${m}`)}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <Label>{t("templates.ruleLabel")}</Label>
                        <Select name={`step${n}Rule`} defaultValue="owner_admin">
                          {WORKFLOW_FORM_RULES.map((r) => (
                            <option key={r} value={r}>
                              {t(`rule.${r}`)}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <Label>{t("templates.deadlineLabel")}</Label>
                        <Input
                          name={`step${n}DeadlineHours`}
                          type="number"
                          min={1}
                          max={2160}
                        />
                      </label>
                    </div>
                  </fieldset>
                ),
              )}
              <p className="text-xs text-text-muted">
                {t("templates.escalationHint")}
              </p>
              <div>
                <Button
                  type="submit"
                  size="sm"
                  data-testid="approvals-create-template-submit"
                >
                  {t("templates.createSubmit")}
                </Button>
              </div>
            </form>
          </details>
        </div>
      ) : null}
    </section>
  );
}
