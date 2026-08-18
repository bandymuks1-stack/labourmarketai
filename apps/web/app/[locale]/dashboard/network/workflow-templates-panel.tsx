import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import {
  createWorkflowVersionAction,
  installDefaultWorkflowPackAction,
  publishWorkflowVersionAction,
  setWorkflowDefinitionActiveAction,
} from "@/lib/approvals/approvals-actions";
import {
  WORKFLOW_APPROVAL_MODES,
  WORKFLOW_DEADLINE_HOURS_MAX,
  WORKFLOW_DEADLINE_HOURS_MIN,
  WORKFLOW_DEFAULT_PACK,
  WORKFLOW_MAX_VERSION_STEPS,
  WORKFLOW_RULE_KINDS,
  WORKFLOW_RULE_ROLES,
  WORKFLOW_STEP_NAME_MAX,
  WORKFLOW_STEP_NAME_MIN,
  type WorkflowApproverRule,
  type WorkflowTemplateAdminRow,
} from "@/lib/approvals/approvals-model";
import type { WorkflowTemplateAdminResult } from "@/lib/approvals/approvals";

/**
 * Workflow templates administration panel (template management v1).
 *
 * Constitution note: NOT a new dashboard route and NOT a new declared
 * surface — this renders INSIDE the already-declared approvals area of
 * `/dashboard/network#approvals`, the same expansion pattern the approvals
 * section itself follows. Every control is a REAL NATIVE-NAV server-action
 * form over a gated command; feedback is the `?wf=` navigation the approvals
 * section renders as its role="status" banner.
 *
 * What an org owner/admin can do here:
 *   - install the default set of eight approval templates in one click
 *     (idempotent — a repeat is all-skips);
 *   - read every template: context, name, slug, active flag, the version in
 *     force, and the full step list (order, name, mode, approver rule,
 *     deadline, escalation);
 *   - see, per step, HOW MANY approvers the rule resolves to in this
 *     organization TODAY, with a plain-language warning when that is zero —
 *     the fail-closed case in which the engine refuses a submission;
 *   - author a NEW VERSION (rounds, mode, approver rule, deadline,
 *     escalation) and publish it;
 *   - activate or retire a template.
 *
 * RUNNING REQUESTS ARE NEVER CHANGED HERE, and the panel says so: the engine
 * snapshots the steps and resolves the approvers when a request STARTS, and
 * picks the highest published version for NEW requests only.
 *
 * INTERNAL ONLY: nothing on this panel sends anything to anyone.
 */

function ruleLabelKey(rule: WorkflowApproverRule): string {
  switch (rule.kind) {
    case "org_role":
      return "tpl.ruleValue.org_role";
    case "profiles":
      return "tpl.ruleValue.profiles";
    case "requester_manager":
      return "tpl.ruleValue.requester_manager";
    default:
      return "tpl.ruleValue.unknown";
  }
}

export async function WorkflowTemplatesPanel({
  locale,
  organizations,
  admin,
}: {
  locale: string;
  organizations: readonly { id: string; name: string }[];
  admin: WorkflowTemplateAdminResult;
}) {
  const t = await getTranslations("approvals");

  if (admin.status === "not-authed") return null;

  const hiddenLocale = () => (
    <input type="hidden" name="locale" value={locale} />
  );

  if (admin.status === "needs-migration") {
    // Honest pre-apply state: the capability is prepared in code, the gated
    // migration is not applied yet. Nothing pretends to have saved.
    return (
      <div className="flex flex-col gap-2" data-testid="approvals-templates-admin">
        <h4 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("tpl.title")}
        </h4>
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="approvals-templates-unavailable"
        >
          {t("tpl.unavailable")}
        </p>
      </div>
    );
  }

  const templatesByOrg = new Map<string, WorkflowTemplateAdminRow[]>();
  for (const tpl of admin.templates) {
    const list = templatesByOrg.get(tpl.definition.organizationId) ?? [];
    list.push(tpl);
    templatesByOrg.set(tpl.definition.organizationId, list);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="approvals-templates-admin">
      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("tpl.title")}
        </h4>
        <p className="text-xs text-text-muted">{t("tpl.intro")}</p>
      </div>

      {/* The rule that makes this panel safe to use, said once, up front. */}
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="approvals-templates-running-immune"
      >
        {t("tpl.runningImmuneNote")}
      </p>

      {admin.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("loadError")}
        </p>
      ) : null}

      {organizations.map((org) => {
        const templates = templatesByOrg.get(org.id) ?? [];
        const members = admin.members.get(org.id) ?? [];
        const singlePersonOrg = members.length <= 1;

        return (
          <section
            key={org.id}
            className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/20 p-3"
            data-testid={`approvals-templates-org-${org.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h5 className="text-sm font-semibold text-text-primary">
                {org.name}
              </h5>
              <span className="text-meta text-text-muted">
                {t("tpl.templateCount", { count: templates.length })}
              </span>
            </div>

            {/* ── One-click install of the default set ──────────────────── */}
            {templates.length === 0 ? (
              <div
                className="flex flex-col gap-2 rounded-md border border-brand-blue/40 bg-brand-blue/5 p-3"
                data-testid={`approvals-templates-install-${org.id}`}
              >
                <p className="text-sm font-medium text-text-primary">
                  {t("tpl.installTitle")}
                </p>
                <p className="text-xs text-text-secondary">
                  {t("tpl.installIntro", { count: WORKFLOW_DEFAULT_PACK.length })}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {WORKFLOW_DEFAULT_PACK.map((p) => (
                    <li
                      key={p.slug}
                      className="inline-flex items-center rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
                    >
                      {t(`contextType.${p.contextEntityType}`)}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-muted">{t("tpl.installRule")}</p>
                <p className="text-xs text-text-muted">
                  {t("tpl.installIdempotent")}
                </p>
                <form action={installDefaultWorkflowPackAction}>
                  {hiddenLocale()}
                  <input type="hidden" name="organizationId" value={org.id} />
                  <Button
                    type="submit"
                    size="sm"
                    data-testid={`approvals-templates-install-submit-${org.id}`}
                  >
                    {t("tpl.installSubmit")}
                  </Button>
                </form>
              </div>
            ) : (
              <details className="rounded-md border border-ink-600 bg-ink-800/30 p-2">
                <summary className="cursor-pointer text-xs text-text-secondary">
                  {t("tpl.installTitle")}
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-xs text-text-muted">
                    {t("tpl.installIdempotent")}
                  </p>
                  <form action={installDefaultWorkflowPackAction}>
                    {hiddenLocale()}
                    <input type="hidden" name="organizationId" value={org.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      data-testid={`approvals-templates-install-submit-${org.id}`}
                    >
                      {t("tpl.installSubmit")}
                    </Button>
                  </form>
                </div>
              </details>
            )}

            {/* In a one-person organization the owner is the only approver.
                Said plainly, where the person configuring it will read it. */}
            {singlePersonOrg ? (
              <p
                className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs text-text-secondary"
                data-testid={`approvals-templates-self-approval-${org.id}`}
              >
                {t("tpl.selfApprovalNote")}
              </p>
            ) : null}

            {/* ── The templates ─────────────────────────────────────────── */}
            {templates.map((tpl) => {
              const d = tpl.definition;
              return (
                <article
                  key={d.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                  data-testid={`approvals-template-admin-${d.slug}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {d.name}
                    </span>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t(`contextType.${d.contextEntityType}`)}
                    </span>
                    <code className="font-mono text-meta text-text-muted">
                      {d.slug}
                    </code>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${
                        d.isActive
                          ? "border-state-success/50 text-state-success"
                          : "border-ink-500 text-text-muted"
                      }`}
                    >
                      {d.isActive ? t("tpl.active") : t("tpl.inactive")}
                    </span>
                    {tpl.publishedVersion !== null ? (
                      <span className="text-meta text-text-muted">
                        {t("tpl.inUseVersion", { n: tpl.publishedVersion })}
                      </span>
                    ) : (
                      <span
                        className="text-meta text-state-warning"
                        data-testid={`approvals-template-unpublished-${d.slug}`}
                      >
                        {t("tpl.noPublishedVersion")}
                      </span>
                    )}
                  </div>

                  {tpl.effectiveVersionIsDraft ? (
                    <p className="text-xs text-text-muted">
                      {t("tpl.showingDraft")}
                    </p>
                  ) : null}

                  {/* Steps of the version in force, with live approver
                      resolution per step. */}
                  <ol className="flex flex-col gap-2">
                    {tpl.steps.map((s) => {
                      const zero = s.resolved.min === 0;
                      return (
                        <li
                          key={s.id}
                          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/30 p-2"
                          data-testid={`approvals-template-step-${d.slug}-${s.stepOrder}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                              {t("tpl.roundLabel", { n: s.stepOrder })}
                            </span>
                            <span className="text-sm text-text-primary">
                              {s.name}
                            </span>
                            <span className="text-meta text-text-muted">
                              {t(`mode.${s.approvalMode}`)}
                            </span>
                            <span className="text-meta text-text-muted">
                              {t(ruleLabelKey(s.rule))}
                              {s.rule.kind === "org_role"
                                ? `: ${s.rule.roles
                                    .map((r) => t(`tpl.role.${r}`))
                                    .join(", ")}`
                                : ""}
                              {s.rule.kind === "profiles"
                                ? `: ${t("tpl.namedPeople", {
                                    count: s.rule.profileIds.length,
                                  })}`
                                : ""}
                            </span>
                            <span className="text-meta text-text-muted">
                              {s.deadlineHours === null
                                ? t("tpl.noDeadline")
                                : t("tpl.deadlineHours", {
                                    hours: s.deadlineHours,
                                  })}
                            </span>
                            <span className="text-meta text-text-muted">
                              {s.escalationEnabled
                                ? t("tpl.escalationOn")
                                : t("tpl.escalationOff")}
                            </span>
                          </div>
                          <p
                            className={`text-meta ${
                              zero ? "text-state-danger" : "text-text-secondary"
                            }`}
                            data-testid={`approvals-template-resolved-${d.slug}-${s.stepOrder}`}
                          >
                            {s.resolved.exact
                              ? t("tpl.resolvedExact", { count: s.resolved.max })
                              : t("tpl.resolvedRange", {
                                  min: s.resolved.min,
                                  max: s.resolved.max,
                                })}
                          </p>
                          {zero ? (
                            <p
                              className="rounded-md border border-state-danger/40 bg-state-danger/5 px-2 py-1 text-xs text-text-primary"
                              data-testid={`approvals-template-zero-${d.slug}-${s.stepOrder}`}
                            >
                              {s.rule.kind === "requester_manager"
                                ? t("tpl.zeroWarningManager")
                                : t("tpl.zeroWarning")}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                    {tpl.steps.length === 0 ? (
                      <li className="text-xs text-text-muted">
                        {t("tpl.noSteps")}
                      </li>
                    ) : null}
                  </ol>

                  {/* Version history + publish. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("tpl.versionsTitle")}
                    </span>
                    {tpl.versions.map((v) => (
                      <span
                        key={v.id}
                        className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-muted"
                        data-testid={`approvals-template-version-${d.slug}-${v.version}`}
                      >
                        {t("tpl.versionLabel", { n: v.version })}
                        {v.publishedAt === null ? (
                          <span className="text-state-warning">
                            {t("tpl.versionDraft")}
                          </span>
                        ) : (
                          <span className="text-state-success">
                            {t("tpl.versionPublished")}
                          </span>
                        )}
                      </span>
                    ))}
                    {tpl.versions
                      .filter((v) => v.publishedAt === null)
                      .slice(0, 1)
                      .map((v) => (
                        <form key={v.id} action={publishWorkflowVersionAction}>
                          {hiddenLocale()}
                          <input type="hidden" name="versionId" value={v.id} />
                          <Button
                            type="submit"
                            size="sm"
                            data-testid={`approvals-template-publish-${d.slug}`}
                          >
                            {t("tpl.publishVersion", { n: v.version })}
                          </Button>
                        </form>
                      ))}
                    <form action={setWorkflowDefinitionActiveAction}>
                      {hiddenLocale()}
                      <input type="hidden" name="definitionId" value={d.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={d.isActive ? "false" : "true"}
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        data-testid={`approvals-template-toggle-${d.slug}`}
                      >
                        {d.isActive ? t("tpl.deactivate") : t("tpl.activate")}
                      </Button>
                    </form>
                  </div>

                  {/* ── Author a NEW VERSION ─────────────────────────────── */}
                  <details
                    className="rounded-md border border-ink-600 bg-ink-800/20 p-2"
                    data-testid={`approvals-template-new-version-${d.slug}`}
                  >
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {t("tpl.newVersionTitle")}
                    </summary>
                    <form
                      action={createWorkflowVersionAction}
                      className="mt-2 flex flex-col gap-3"
                    >
                      {hiddenLocale()}
                      <input type="hidden" name="definitionId" value={d.id} />
                      <p className="text-xs text-text-muted">
                        {t("tpl.newVersionHint")}
                      </p>
                      {Array.from(
                        { length: WORKFLOW_MAX_VERSION_STEPS },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <fieldset
                          key={n}
                          className="flex flex-col gap-2 rounded-md border border-ink-600 p-2"
                        >
                          <legend className="px-1 font-mono text-meta uppercase tracking-label text-text-muted">
                            {t("tpl.roundLabel", { n })}
                            {n > 1 ? ` (${t("templates.optional")})` : ""}
                          </legend>
                          <label className="flex flex-col gap-1">
                            <Label>{t("templates.stepNameLabel")}</Label>
                            <Input
                              name={`step${n}Name`}
                              minLength={WORKFLOW_STEP_NAME_MIN}
                              maxLength={WORKFLOW_STEP_NAME_MAX}
                              required={n === 1}
                              defaultValue={
                                tpl.steps.find((s) => s.stepOrder === n)?.name ??
                                ""
                              }
                            />
                          </label>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <label className="flex flex-col gap-1">
                              <Label>{t("templates.modeLabel")}</Label>
                              <Select
                                name={`step${n}Mode`}
                                defaultValue={
                                  tpl.steps.find((s) => s.stepOrder === n)
                                    ?.approvalMode ?? "single"
                                }
                              >
                                {WORKFLOW_APPROVAL_MODES.map((m) => (
                                  <option key={m} value={m}>
                                    {t(`mode.${m}`)}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <Label>{t("tpl.ruleKindLabel")}</Label>
                              <Select
                                name={`step${n}RuleKind`}
                                defaultValue="org_role"
                              >
                                {WORKFLOW_RULE_KINDS.map((k) => (
                                  <option key={k} value={k}>
                                    {t(`tpl.ruleValue.${k}`)}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <Label>{t("templates.deadlineLabel")}</Label>
                              <Input
                                name={`step${n}DeadlineHours`}
                                type="number"
                                min={WORKFLOW_DEADLINE_HOURS_MIN}
                                max={WORKFLOW_DEADLINE_HOURS_MAX}
                                defaultValue={
                                  tpl.steps.find((s) => s.stepOrder === n)
                                    ?.deadlineHours ?? ""
                                }
                              />
                            </label>
                          </div>
                          <fieldset className="flex flex-wrap gap-3">
                            <legend className="font-mono text-meta uppercase tracking-label text-text-muted">
                              {t("tpl.rolesLabel")}
                            </legend>
                            {WORKFLOW_RULE_ROLES.map((r) => (
                              <label
                                key={r}
                                className="inline-flex items-center gap-1.5 text-xs text-text-secondary"
                              >
                                <input
                                  type="checkbox"
                                  name={`step${n}Roles`}
                                  value={r}
                                  defaultChecked={r === "owner" || r === "admin"}
                                  className="h-4 w-4 rounded border-ink-500 bg-ink-700"
                                />
                                {t(`tpl.role.${r}`)}
                              </label>
                            ))}
                          </fieldset>
                          {members.length > 0 ? (
                            <label className="flex flex-col gap-1">
                              <Label>{t("tpl.peopleLabel")}</Label>
                              <select
                                name={`step${n}ProfileIds`}
                                multiple
                                size={Math.min(members.length, 4)}
                                className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary"
                              >
                                {members.map((m) => (
                                  <option key={m.profileId} value={m.profileId}>
                                    {m.label.length > 0
                                      ? m.label
                                      : t(`tpl.role.${m.role}`)}
                                  </option>
                                ))}
                              </select>
                              <span className="text-meta text-text-muted">
                                {t("tpl.peopleHint")}
                              </span>
                            </label>
                          ) : null}
                          <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              name={`step${n}Escalation`}
                              defaultChecked
                              className="h-4 w-4 rounded border-ink-500 bg-ink-700"
                            />
                            {t("tpl.escalationLabel")}
                          </label>
                        </fieldset>
                      ))}
                      <p className="text-xs text-text-muted">
                        {t("templates.escalationHint")}
                      </p>
                      <div>
                        <Button
                          type="submit"
                          size="sm"
                          data-testid={`approvals-template-create-version-${d.slug}`}
                        >
                          {t("tpl.createVersionSubmit")}
                        </Button>
                      </div>
                    </form>
                  </details>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
