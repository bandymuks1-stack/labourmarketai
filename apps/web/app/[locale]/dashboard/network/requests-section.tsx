import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { WorkflowTimeline } from "@/components/app/workflow-timeline";
import {
  createEmployeeRequestAction,
  seedRequestTemplateAction,
  setLeaveBalancePolicyAction,
  withdrawEmployeeRequestAction,
} from "@/lib/requests/requests-actions";
import {
  EMPLOYEE_REQUEST_DETAILS_MAX,
  EMPLOYEE_REQUEST_STATUSES,
  EMPLOYEE_REQUEST_TITLE_MAX,
  EMPLOYEE_REQUEST_TITLE_MIN,
  EMPLOYEE_REQUEST_TYPES,
  type EmployeeRequestNotice,
  type EmployeeRequestRow,
  type OrgRequestsFilterInput,
} from "@/lib/requests/requests-model";
import {
  getMyEmployeeRequests,
  listMyMemberOrganizations,
  listOrgEmployeeRequests,
  type MyEmployeeRequestsResult,
} from "@/lib/requests/requests";
import { listOrgLeavePolicies } from "@/lib/leave/balances";
import { ABSENCE_TYPES } from "@/lib/leave/absences-model";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Requests area of the network page (typed employee requests v1).
 *
 * Constitution note: like the approvals area beside it, this is deliberately
 * NOT a new dashboard route — new capability expands INSIDE the existing
 * declared /dashboard/network surface (the approvals-section precedent),
 * under the #requests anchor.
 *
 * Division of labour, stated once: a request's approval LIFECYCLE runs on
 * the Workflow & Approval Engine — deciding happens in the EXISTING
 * approvals inbox (#approvals above), never here. This area owns the typed
 * register: filing a request, my requests + timeline + withdraw, the org
 * register with filters, the conventional template seed helper, and the
 * org's leave-number configuration.
 *
 * Every control is a REAL action (native-nav server-action forms with an
 * honest `?req=` outcome). While the human-gated migrations are unapplied
 * the area shows the calm "not enabled yet" state — no fake rows.
 *
 * INTERNAL ONLY: nothing here contacts anyone outside the product.
 */

const STATUS_TONE: Record<EmployeeRequestRow["status"], string> = {
  pending: "border-brand-blue/50 text-brand-blue",
  approved: "border-state-success/50 text-state-success",
  rejected: "border-state-danger/50 text-state-danger",
  withdrawn: "border-ink-500 text-text-muted",
  cancelled: "border-ink-500 text-text-muted",
};

const SUCCESS_NOTICES: readonly EmployeeRequestNotice[] = [
  "created",
  "withdrawn",
  "template_ready",
  "policy_saved",
];

export async function RequestsSection({
  locale,
  notice,
  organizations,
  filter,
}: {
  locale: string;
  notice: EmployeeRequestNotice | null;
  /** The caller's OWNED organizations (the network page already loads them)
   *  — the org-administration half renders only for these. */
  organizations: readonly { id: string; name: string }[];
  filter: OrgRequestsFilterInput;
}) {
  const t = await getTranslations("requests");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });

  const orgIds = organizations.map((o) => o.id);
  const [mine, memberOrgs, register, orgPolicies] = await Promise.all([
    getMyEmployeeRequests(),
    listMyMemberOrganizations(),
    listOrgEmployeeRequests(orgIds, filter),
    Promise.all(
      organizations.map(async (o) => ({
        organization: o,
        result: await listOrgLeavePolicies(o.id),
      })),
    ),
  ]);

  if (mine.status === "not-authed") return null;

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
      data-testid={`requests-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  if (mine.status === "needs-migration" || register.status === "needs-migration") {
    // Calm honest pre-apply state — the human-gated migration is not
    // applied yet; nothing is faked.
    return (
      <section
        id="requests"
        className="flex flex-col gap-3"
        data-testid="network-requests"
      >
        {header}
        {noticeBanner}
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="requests-unavailable"
        >
          {t("unavailable")}
        </p>
      </section>
    );
  }

  const ok = mine as Extract<MyEmployeeRequestsResult, { status: "ok" }>;
  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));
  for (const m of memberOrgs) {
    if (!orgNameById.has(m.id) && m.name) orgNameById.set(m.id, m.name);
  }

  function hiddenLocale() {
    return <input type="hidden" name="locale" value={locale} />;
  }

  return (
    <section
      id="requests"
      className="flex flex-col gap-4"
      data-testid="network-requests"
    >
      {header}
      {noticeBanner}

      {/* Honesty note: a request goes to the approval flow the company set
          up; nothing is auto-approved, nothing leaves the product. */}
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="requests-honest-note"
      >
        {t("honestNote")}
      </p>

      {/* ── File a request ───────────────────────────────────────────── */}
      {memberOrgs.length > 0 ? (
        <details
          className="group rounded-md border border-ink-500 bg-ink-800/30"
          data-testid="requests-file"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-display text-lg font-semibold tracking-tight text-text-primary [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="text-text-muted transition-transform group-open:rotate-90"
            >
              ›
            </span>
            {t("file.title")}
          </summary>
          <form
            action={createEmployeeRequestAction}
            className="flex flex-col gap-3 px-4 pb-4"
          >
            {hiddenLocale()}
            <label className="flex flex-col gap-1">
              <Label>{t("file.orgLabel")}</Label>
              <Select name="organizationId" required>
                {memberOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name ?? t("file.unnamedOrg")}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("file.typeLabel")}</Label>
              <Select name="requestType" required defaultValue="other">
                {EMPLOYEE_REQUEST_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {t(`type.${tp}`)}
                  </option>
                ))}
              </Select>
            </label>
            {/* Plain-language descriptions of every type, always visible —
                the picker never leaves a person guessing. */}
            <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
              {EMPLOYEE_REQUEST_TYPES.map((tp) => (
                <li key={tp}>
                  <span className="text-text-secondary">{t(`type.${tp}`)}</span>{" "}
                  — {t(`typeHint.${tp}`)}
                </li>
              ))}
            </ul>
            <label className="flex flex-col gap-1">
              <Label>{t("file.titleLabel")}</Label>
              <Input
                name="title"
                minLength={EMPLOYEE_REQUEST_TITLE_MIN}
                maxLength={EMPLOYEE_REQUEST_TITLE_MAX}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("file.detailsLabel")}</Label>
              <textarea
                name="details"
                maxLength={EMPLOYEE_REQUEST_DETAILS_MAX}
                rows={3}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <Label>{t("file.dateFromLabel")}</Label>
                <Input name="dateFrom" type="date" />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("file.dateToLabel")}</Label>
                <Input name="dateTo" type="date" />
              </label>
            </div>
            <p className="text-xs text-text-muted">{t("file.datesHint")}</p>
            <div>
              <Button type="submit" size="sm" data-testid="requests-file-submit">
                {t("file.submit")}
              </Button>
            </div>
          </form>
        </details>
      ) : (
        <p className="text-xs text-text-muted" data-testid="requests-no-org">
          {t("file.noOrganizations")}
        </p>
      )}

      {/* ── My requests ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="requests-mine">
        <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {t("mine.title")}
        </h3>
        {ok.requests.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-muted">
            {t("mine.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ok.requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3"
                data-testid={`requests-mine-${r.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-text-primary">
                    {r.title}
                  </p>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`type.${r.requestType}`)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[r.status]}`}
                  >
                    {t(`status.${r.status}`)}
                  </span>
                  {orgNameById.get(r.organizationId) ? (
                    <span className="text-meta text-text-muted">
                      {orgNameById.get(r.organizationId)}
                    </span>
                  ) : null}
                  {r.dateFrom ? (
                    <span className="font-mono text-meta text-text-muted">
                      {r.dateFrom}
                      {r.dateTo ? ` → ${r.dateTo}` : ""}
                    </span>
                  ) : null}
                  <span className="text-meta text-text-muted">
                    {dateFmt(r.createdAt)}
                  </span>
                  {r.status === "pending" ? (
                    <form action={withdrawEmployeeRequestAction}>
                      {hiddenLocale()}
                      <input type="hidden" name="requestId" value={r.id} />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        data-testid={`requests-withdraw-${r.id}`}
                      >
                        {t("actions.withdraw")}
                      </Button>
                    </form>
                  ) : null}
                </div>
                {r.details ? (
                  <p className="break-words text-xs text-text-secondary">
                    {r.details}
                  </p>
                ) : null}
                {r.workflowInstanceId ? (
                  <details className="rounded-md border border-ink-600 bg-ink-800/20 p-2">
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {t("mine.timelineOpen")}
                    </summary>
                    <div className="mt-2">
                      <WorkflowTimeline
                        locale={locale}
                        steps={ok.steps.get(r.workflowInstanceId) ?? []}
                        slots={ok.slots.get(r.workflowInstanceId) ?? []}
                        transitions={
                          ok.transitions.get(r.workflowInstanceId) ?? []
                        }
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Org administration: register + template seed + leave numbers ── */}
      {organizations.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="requests-admin">
          <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            {t("register.title")}
          </h3>
          {/* Deciding happens in the approvals inbox above — said plainly,
              never duplicated here. */}
          <p className="text-xs text-text-muted">{t("register.decideHint")}</p>

          {/* Filters (plain GET navigation). */}
          <form
            action={`/${locale}/dashboard/network`}
            method="get"
            className="flex flex-wrap items-end gap-2"
            data-testid="requests-register-filters"
          >
            <label className="flex flex-col gap-1">
              <Label>{t("register.filterStatus")}</Label>
              <Select name="reqStatus" defaultValue={filter.status ?? ""}>
                <option value="">{t("register.filterAll")}</option>
                {EMPLOYEE_REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("register.filterType")}</Label>
              <Select name="reqType" defaultValue={filter.requestType ?? ""}>
                <option value="">{t("register.filterAll")}</option>
                {EMPLOYEE_REQUEST_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {t(`type.${tp}`)}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary" size="sm">
              {t("register.filterApply")}
            </Button>
          </form>

          {register.status === "ok" && register.requests.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="requests-register">
              {register.requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
                  data-testid={`requests-register-${r.id}`}
                >
                  <span className="min-w-0 break-words text-sm font-medium text-text-primary">
                    {r.title}
                  </span>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(`type.${r.requestType}`)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[r.status]}`}
                  >
                    {t(`status.${r.status}`)}
                  </span>
                  {orgNameById.get(r.organizationId) ? (
                    <span className="text-meta text-text-muted">
                      {orgNameById.get(r.organizationId)}
                    </span>
                  ) : null}
                  {r.dateFrom ? (
                    <span className="font-mono text-meta text-text-muted">
                      {r.dateFrom}
                      {r.dateTo ? ` → ${r.dateTo}` : ""}
                    </span>
                  ) : null}
                  <span className="text-meta text-text-muted">
                    {dateFmt(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted" data-testid="requests-register-empty">
              {t("register.empty")}
            </p>
          )}

          {/* Seed the conventional approval template through the ENGINE's
              own commands. Honest: without a published template, filing
              answers "no approval flow is set up yet". */}
          <details
            className="group rounded-md border border-ink-500 bg-ink-800/30"
            data-testid="requests-seed-template"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-display text-base font-semibold tracking-tight text-text-primary [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="text-text-muted transition-transform group-open:rotate-90"
              >
                ›
              </span>
              {t("seed.title")}
            </summary>
            <form
              action={seedRequestTemplateAction}
              className="flex flex-col gap-3 px-4 pb-4"
            >
              {hiddenLocale()}
              <p className="text-xs text-text-muted">{t("seed.hint")}</p>
              <label className="flex flex-col gap-1">
                <Label>{t("seed.orgLabel")}</Label>
                <Select name="organizationId" required>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("seed.typeLabel")}</Label>
                <Select name="targetType" defaultValue="">
                  <option value="">{t("seed.allTypes")}</option>
                  {EMPLOYEE_REQUEST_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {t(`type.${tp}`)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("seed.nameLabel")}</Label>
                <Input
                  name="name"
                  minLength={3}
                  maxLength={120}
                  defaultValue={t("seed.defaultName")}
                  required
                />
              </label>
              <div>
                <Button
                  type="submit"
                  size="sm"
                  data-testid="requests-seed-submit"
                >
                  {t("seed.submit")}
                </Button>
              </div>
            </form>
          </details>

          {/* Leave numbers (advisory balances). Org-configured, never law. */}
          <div className="flex flex-col gap-2" data-testid="requests-leave-policies">
            <h4 className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {t("policies.title")}
            </h4>
            <p className="text-xs text-text-muted">{t("policies.honesty")}</p>
            {orgPolicies.map(({ organization, result }) =>
              result.status === "ok" && result.policies.length > 0 ? (
                <ul key={organization.id} className="flex flex-col gap-1">
                  {result.policies.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-1.5 text-xs text-text-secondary"
                      data-testid={`requests-policy-${p.organizationId}-${p.absenceType}`}
                    >
                      <span className="text-text-primary">{organization.name}</span>
                      <span>{t(`absenceType.${p.absenceType}`)}</span>
                      <span className="font-mono">
                        {t("policies.entitlementShort", {
                          days: p.annualEntitlementDays,
                        })}
                      </span>
                      {p.carryoverDays > 0 ? (
                        <span className="font-mono">
                          {t("policies.carryoverShort", {
                            days: p.carryoverDays,
                          })}
                        </span>
                      ) : null}
                      {!p.isActive ? (
                        <span className="text-text-muted">
                          {t("policies.inactive")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null,
            )}
            <details
              className="group rounded-md border border-ink-500 bg-ink-800/30"
              data-testid="requests-policy-form"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-display text-base font-semibold tracking-tight text-text-primary [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="text-text-muted transition-transform group-open:rotate-90"
                >
                  ›
                </span>
                {t("policies.setTitle")}
              </summary>
              <form
                action={setLeaveBalancePolicyAction}
                className="flex flex-col gap-3 px-4 pb-4"
              >
                {hiddenLocale()}
                <label className="flex flex-col gap-1">
                  <Label>{t("policies.orgLabel")}</Label>
                  <Select name="organizationId" required>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <Label>{t("policies.typeLabel")}</Label>
                  <Select name="absenceType" required defaultValue="annual_leave">
                    {ABSENCE_TYPES.map((tp) => (
                      <option key={tp} value={tp}>
                        {t(`absenceType.${tp}`)}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <Label>{t("policies.entitlementLabel")}</Label>
                    <Input
                      name="entitlementDays"
                      inputMode="decimal"
                      pattern="\d{1,3}([.,]\d)?"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <Label>{t("policies.carryoverLabel")}</Label>
                    <Input
                      name="carryoverDays"
                      inputMode="decimal"
                      pattern="\d{1,3}([.,]\d)?"
                      defaultValue="0"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input type="checkbox" name="isActive" value="true" defaultChecked />
                  {t("policies.activeLabel")}
                </label>
                <div>
                  <Button
                    type="submit"
                    size="sm"
                    data-testid="requests-policy-submit"
                  >
                    {t("policies.submit")}
                  </Button>
                </div>
              </form>
            </details>
          </div>
        </div>
      ) : null}
    </section>
  );
}
