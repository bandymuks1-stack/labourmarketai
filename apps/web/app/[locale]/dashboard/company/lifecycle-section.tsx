import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import {
  cancelOffboardingRunAction,
  cancelOnboardingRunAction,
  completeOffboardingRunAction,
  completeOnboardingRunAction,
  createOnboardingTemplateAction,
  endEngagementLifecycleAction,
  setLifecycleStageAction,
  setOffboardingItemStatusAction,
  setOnboardingItemStatusAction,
  startOffboardingRunAction,
  startOnboardingRunAction,
} from "@/lib/lifecycle/lifecycle-actions";
import {
  DIRECT_LIFECYCLE_STAGES,
  ENDED_REASONS,
  LIFECYCLE_ITEM_TITLE_MAX,
  LIFECYCLE_NOTE_MAX,
  LIFECYCLE_TEMPLATE_FORM_MAX_ITEMS,
  LIFECYCLE_TEMPLATE_NAME_MAX,
  LIFECYCLE_TEMPLATE_NAME_MIN,
  ONBOARDING_ITEM_KINDS,
  deriveRunProgress,
  type LifecycleMemberRow,
  type LifecycleNotice,
  type LifecycleRunRow,
  type LifecycleStage,
} from "@/lib/lifecycle/lifecycle-model";
import { getLifecycleOverview } from "@/lib/lifecycle/lifecycle";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Employment lifecycle area of the company page (EC-canonical lifecycle v1).
 *
 * Constitution note: this is deliberately NOT a new dashboard route. The
 * blessed pattern for new capability is expansion INSIDE an existing
 * declared surface (the approvals-on-network precedent). The company page
 * already renders the org's members (OrgMembersPanel on the SAME
 * engagement_contexts rows); the lifecycle of those engagements lives here
 * under the #lifecycle anchor.
 *
 * Every control is a REAL action: all writes are NATIVE-NAV server-action
 * forms over the twelve gated engine commands, redirecting back here with
 * an honest `?lc=` outcome banner. While the human-gated migration is
 * unapplied the whole area shows the calm "not enabled yet" state — no
 * fake stages, no fake checklists.
 *
 * INTERNAL ONLY: nothing here contacts anyone outside the product.
 */

const STAGE_TONE: Record<LifecycleStage, string> = {
  onboarding: "border-brand-blue/50 text-brand-blue",
  active: "border-state-success/50 text-state-success",
  probation: "border-state-warning/50 text-text-primary",
  change_pending: "border-brand-cyan/50 text-brand-cyan",
  offboarding: "border-state-warning/50 text-text-primary",
  ended: "border-ink-500 text-text-muted",
};

export async function LifecycleSection({
  locale,
  orgId,
  notice,
}: {
  locale: string;
  orgId: string;
  notice: LifecycleNotice | null;
}) {
  const t = await getTranslations("lifecycle");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });

  const overview = await getLifecycleOverview(orgId);
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
        ["created", "started", "updated", "completed", "cancelled", "ended"].includes(
          notice,
        )
          ? "border-state-success/50 bg-state-success/10 text-state-success"
          : "border-state-warning/50 bg-state-warning/10 text-text-primary"
      }`}
      data-testid={`lifecycle-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  if (overview.status === "needs-migration") {
    return (
      <section
        id="lifecycle"
        className="card-border flex flex-col gap-3 p-5 scroll-mt-20"
        data-testid="company-lifecycle"
      >
        {header}
        {noticeBanner}
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="lifecycle-unavailable"
        >
          {t("unavailable")}
        </p>
      </section>
    );
  }

  const { members, templates, onboardingRuns, offboardingRuns, events } =
    overview;
  const activeTemplates = templates.filter((tpl) => tpl.isActive);
  const nameByEngagement = new Map(
    members.map((m) => [m.engagementId, m.name]),
  );

  function hiddenCtx() {
    return (
      <>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="back" value="company" />
      </>
    );
  }

  function stageBadge(stage: LifecycleStage) {
    return (
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs ${STAGE_TONE[stage]}`}
        data-testid={`lifecycle-stage-${stage}`}
      >
        {t(`stage.${stage}`)}
      </span>
    );
  }

  function checklist(
    run: LifecycleRunRow,
    scope: "onboarding" | "offboarding",
  ) {
    const progress = deriveRunProgress(run.items);
    const setAction =
      scope === "onboarding"
        ? setOnboardingItemStatusAction
        : setOffboardingItemStatusAction;
    const completeAction =
      scope === "onboarding"
        ? completeOnboardingRunAction
        : completeOffboardingRunAction;
    const cancelAction =
      scope === "onboarding"
        ? cancelOnboardingRunAction
        : cancelOffboardingRunAction;
    return (
      <div
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/20 p-3"
        data-testid={`lifecycle-${scope}-run`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">
            {scope === "onboarding"
              ? t("runs.onboardingTitle")
              : t("runs.offboardingTitle")}
            {run.templateName ? (
              <span className="ml-2 text-xs text-text-muted">
                {run.templateName}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-text-secondary">
            {t("runs.progress", { done: progress.done, total: progress.total })}
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {run.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-ink-700 px-2 py-1.5"
            >
              <div className="flex min-w-0 flex-col">
                <span
                  className={`truncate text-sm ${
                    item.status === "done"
                      ? "text-text-muted line-through"
                      : "text-text-primary"
                  }`}
                >
                  {["access_removal", "final_evidence"].includes(item.kind) &&
                  item.title === item.kind
                    ? t(`kinds.${item.kind}`)
                    : item.title}
                </span>
                <span className="text-[11px] text-text-muted">
                  {t(`kinds.${item.kind}`)}
                  {item.required ? ` · ${t("items.requiredBadge")}` : ""}
                  {item.linkedEntityType ? ` · ${t("items.linkedBadge")}` : ""}
                </span>
              </div>
              {item.status !== "done" ? (
                <div className="flex items-center gap-1">
                  <form action={setAction}>
                    {hiddenCtx()}
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="status" value="done" />
                    <Button type="submit" size="sm" variant="outline">
                      {t("items.markDone")}
                    </Button>
                  </form>
                  {!item.required ? (
                    <form action={setAction}>
                      {hiddenCtx()}
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="status" value="skipped" />
                      <Button type="submit" size="sm" variant="ghost">
                        {t("items.skip")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <form action={setAction}>
                  {hiddenCtx()}
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="status" value="pending" />
                  <Button type="submit" size="sm" variant="ghost">
                    {t("items.reset")}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <form action={completeAction}>
            {hiddenCtx()}
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" size="sm" disabled={!progress.completable}>
              {t("runs.complete")}
            </Button>
          </form>
          {!progress.completable ? (
            <span className="text-[11px] text-text-muted">
              {t("runs.requiredOpen", { count: progress.requiredOpen })}
            </span>
          ) : null}
          <form action={cancelAction}>
            {hiddenCtx()}
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" size="sm" variant="ghost">
              {t("runs.cancel")}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  function memberControls(m: LifecycleMemberRow) {
    if (m.engagementStatus !== "active" || m.stage === "ended") return null;
    const openOnboarding = m.openOnboardingRunId
      ? onboardingRuns.get(m.openOnboardingRunId)
      : null;
    const openOffboarding = m.openOffboardingRunId
      ? offboardingRuns.get(m.openOffboardingRunId)
      : null;
    return (
      <div className="flex flex-col gap-2">
        {openOnboarding ? checklist(openOnboarding, "onboarding") : null}
        {openOffboarding ? checklist(openOffboarding, "offboarding") : null}

        {!openOnboarding && !openOffboarding ? (
          <details className="rounded-md border border-ink-600 p-2">
            <summary className="cursor-pointer text-xs text-text-secondary">
              {t("members.actionsSummary")}
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {/* Start onboarding from a template */}
              {["active", "probation", "change_pending"].includes(m.stage) &&
              activeTemplates.length > 0 &&
              m.stage === "active" ? (
                <form
                  action={startOnboardingRunAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  {hiddenCtx()}
                  <input
                    type="hidden"
                    name="engagementId"
                    value={m.engagementId}
                  />
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={`onb-tpl-${m.engagementId}`}
                      className="text-xs"
                    >
                      {t("runs.templateLabel")}
                    </Label>
                    <Select
                      id={`onb-tpl-${m.engagementId}`}
                      name="templateId"
                      required
                    >
                      {activeTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({t("templates.itemCount", { count: tpl.itemCount })})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    {t("runs.start")}
                  </Button>
                </form>
              ) : null}

              {/* Probation / change note / back to active */}
              <form
                action={setLifecycleStageAction}
                className="flex flex-wrap items-end gap-2"
              >
                {hiddenCtx()}
                <input
                  type="hidden"
                  name="engagementId"
                  value={m.engagementId}
                />
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor={`stage-${m.engagementId}`}
                    className="text-xs"
                  >
                    {t("stageForm.stageLabel")}
                  </Label>
                  <Select
                    id={`stage-${m.engagementId}`}
                    name="stage"
                    defaultValue={
                      (DIRECT_LIFECYCLE_STAGES as readonly string[]).includes(
                        m.stage,
                      )
                        ? m.stage
                        : "active"
                    }
                  >
                    {DIRECT_LIFECYCLE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {t(`stage.${s}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor={`prob-${m.engagementId}`}
                    className="text-xs"
                  >
                    {t("stageForm.probationDateLabel")}
                  </Label>
                  <Input
                    id={`prob-${m.engagementId}`}
                    name="probationUntil"
                    type="date"
                    defaultValue={m.probationUntil ?? ""}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor={`stage-note-${m.engagementId}`}
                    className="text-xs"
                  >
                    {t("stageForm.noteLabel")}
                  </Label>
                  <Input
                    id={`stage-note-${m.engagementId}`}
                    name="note"
                    maxLength={LIFECYCLE_NOTE_MAX}
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  {t("stageForm.submit")}
                </Button>
              </form>

              {/* Start offboarding */}
              <form
                action={startOffboardingRunAction}
                className="flex flex-wrap items-end gap-2"
              >
                {hiddenCtx()}
                <input
                  type="hidden"
                  name="engagementId"
                  value={m.engagementId}
                />
                <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                  <Label
                    htmlFor={`off-extra-${m.engagementId}`}
                    className="text-xs"
                  >
                    {t("runs.extraItemsLabel")}
                  </Label>
                  <textarea
                    id={`off-extra-${m.engagementId}`}
                    name="extraItems"
                    rows={2}
                    className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-text-primary"
                    placeholder={t("runs.extraItemsHint")}
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  {t("runs.startOffboarding")}
                </Button>
              </form>

              {/* End engagement — canonical path with reason capture. The
                  registered owner's own engagement is protected server-side
                  (last_owner); the control reflects that truth. */}
              {!m.isRegisteredOwner ? (
                <form
                  action={endEngagementLifecycleAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  {hiddenCtx()}
                  <input
                    type="hidden"
                    name="engagementId"
                    value={m.engagementId}
                  />
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={`end-reason-${m.engagementId}`}
                      className="text-xs"
                    >
                      {t("end.reasonLabel")}
                    </Label>
                    <Select
                      id={`end-reason-${m.engagementId}`}
                      name="reason"
                      required
                    >
                      {ENDED_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {t(`reasons.${r}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={`end-note-${m.engagementId}`}
                      className="text-xs"
                    >
                      {t("end.noteLabel")}
                    </Label>
                    <Input
                      id={`end-note-${m.engagementId}`}
                      name="note"
                      maxLength={LIFECYCLE_NOTE_MAX}
                    />
                  </div>
                  <Button type="submit" size="sm" variant="destructive">
                    {t("end.submit")}
                  </Button>
                  <span className="text-[11px] text-text-muted">
                    {t("end.confirmHint")}
                  </span>
                </form>
              ) : (
                <p className="text-[11px] text-text-muted">
                  {t("members.ownerProtected")}
                </p>
              )}
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <section
      id="lifecycle"
      className="card-border flex flex-col gap-4 p-5 scroll-mt-20"
      data-testid="company-lifecycle"
    >
      {header}
      {noticeBanner}

      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="lifecycle-honest-note"
      >
        {t("honestNote")}
      </p>

      {overview.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("loadError")}
        </p>
      ) : null}

      {/* ── Members with stage badges + lifecycle controls ────────────── */}
      <div className="flex flex-col gap-3" data-testid="lifecycle-members">
        <h3 className="text-sm font-medium text-text-primary">
          {t("members.title")}
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-text-muted">{t("members.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((m) => (
              <li
                key={m.engagementId}
                className="flex flex-col gap-2 rounded-md border border-ink-600 p-3"
                data-testid="lifecycle-member"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {m.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      {m.relationshipSlug}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stageBadge(m.stage)}
                    {m.stage === "probation" && m.probationUntil ? (
                      <span className="text-[11px] text-text-muted">
                        {t("members.probationUntil", {
                          date: dateFmt.format(new Date(m.probationUntil)),
                        })}
                      </span>
                    ) : null}
                    {m.stage === "ended" && m.endedReason ? (
                      <span className="text-[11px] text-text-muted">
                        {t(`reasons.${m.endedReason}`)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {memberControls(m)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Onboarding templates ──────────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="lifecycle-templates">
        <h3 className="text-sm font-medium text-text-primary">
          {t("templates.title")}
        </h3>
        {templates.length === 0 ? (
          <p className="text-sm text-text-muted">{t("templates.empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <li
                key={tpl.id}
                className="rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary"
              >
                {tpl.name} · {t("templates.itemCount", { count: tpl.itemCount })}
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-md border border-ink-600 p-2">
          <summary className="cursor-pointer text-xs text-text-secondary">
            {t("templates.createTitle")}
          </summary>
          <form
            action={createOnboardingTemplateAction}
            className="mt-2 flex flex-col gap-2"
          >
            {hiddenCtx()}
            <input type="hidden" name="organizationId" value={orgId} />
            <div className="flex flex-col gap-1">
              <Label htmlFor="lifecycle-tpl-name" className="text-xs">
                {t("templates.nameLabel")}
              </Label>
              <Input
                id="lifecycle-tpl-name"
                name="name"
                required
                minLength={LIFECYCLE_TEMPLATE_NAME_MIN}
                maxLength={LIFECYCLE_TEMPLATE_NAME_MAX}
              />
            </div>
            {Array.from(
              { length: LIFECYCLE_TEMPLATE_FORM_MAX_ITEMS },
              (_, idx) => idx + 1,
            ).map((i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <Label htmlFor={`tpl-item-${i}-title`} className="text-xs">
                    {t("templates.itemTitleLabel", { n: i })}
                  </Label>
                  <Input
                    id={`tpl-item-${i}-title`}
                    name={`item-${i}-title`}
                    maxLength={LIFECYCLE_ITEM_TITLE_MAX}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`tpl-item-${i}-kind`} className="text-xs">
                    {t("templates.kindLabel")}
                  </Label>
                  <Select id={`tpl-item-${i}-kind`} name={`item-${i}-kind`}>
                    {ONBOARDING_ITEM_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`kinds.${k}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="flex items-center gap-1 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    name={`item-${i}-required`}
                    defaultChecked
                  />
                  {t("templates.requiredLabel")}
                </label>
              </div>
            ))}
            <Button type="submit" size="sm" className="self-start">
              {t("templates.createSubmit")}
            </Button>
          </form>
        </details>
      </div>

      {/* ── History timeline ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="lifecycle-history">
        <h3 className="text-sm font-medium text-text-primary">
          {t("history.title")}
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">{t("history.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
              >
                <span className="text-text-muted">
                  {dateFmt.format(new Date(ev.createdAt))}
                </span>
                <span>{t(`events.${ev.action}`)}</span>
                <span className="text-text-muted">
                  {nameByEngagement.get(ev.engagementContextId) ?? ""}
                </span>
                {ev.note ? (
                  <span className="text-text-muted">— {ev.note}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
