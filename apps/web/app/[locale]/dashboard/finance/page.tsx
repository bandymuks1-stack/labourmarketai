import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { callerCompanyId, listManagedProjects } from "@/lib/projects/projects";
import {
  createFinanceRecordAction,
  setFinanceRecordStatusAction,
  submitFinanceApprovalAction,
  syncFinanceApprovalAction,
  updateFinanceRecordAction,
} from "@/lib/finance/finance-actions";
import {
  FINANCE_COUNTERPARTY_MAX,
  FINANCE_COUNTERPARTY_MIN,
  FINANCE_CREATE_STATUSES,
  FINANCE_INVOICE_NUMBER_MAX,
  FINANCE_NOTE_MAX,
  FINANCE_RECORD_TYPES,
  FINANCE_TITLE_MAX,
  FINANCE_TITLE_MIN,
  deriveFinanceSummary,
  formatCentsAsEur,
  isOverdueRecord,
  type FinanceRecord,
  type FinanceRecordStatus,
  type FinanceRecordType,
} from "@/lib/finance/finance-model";
import { listMyFinanceRecords } from "@/lib/finance/finance";
import { createUtcFormatter } from "@/lib/time/display";
import { ProcurementSection } from "./procurement-section";
import { TripsSection } from "./trips-section";
import type { ProcurementNotice } from "@/lib/procurement/procurement-model";
import type { TripNotice } from "@/lib/trips/trips-model";

/**
 * Operational finance records (control room PR I, capability gap map §9) —
 * manual invoices issued/received + expenses with derived overdue flags and
 * REAL cent-exact sums over the caller's own RLS rows.
 *
 * Honest by construction:
 *  - reads come from the RLS-scoped finance read service; writes go ONLY
 *    through the three gated RPCs (guard: lib/guards/finance-records.test.ts);
 *  - while the owner-gated I2 migration is unapplied the page shows the calm
 *    "preparing — not available yet" state — no fake rows, no fake sums;
 *  - MANUAL RECORDS ONLY: the prominent scope note states this is not
 *    bookkeeping, tax, payroll, bank sync or payment processing — nothing
 *    here moves money;
 *  - every control is a REAL action: status transitions and edits are
 *    NATIVE-NAV server-action forms that redirect back with an honest
 *    `?notice=` outcome; filters are plain searchParams links (keyboard
 *    accessible, no client state);
 *  - "overdue" is DERIVED (unpaid + due day passed) — shown as a flag and a
 *    filter, never stored, so it clears itself when the record is paid;
 *  - the CSV export is a plain anchor to a route handler that reads the
 *    caller's OWN rows under the same RLS (journal-export pattern).
 */

export const dynamic = "force-dynamic";

const NOTICES = new Set([
  "created",
  "created_possible_duplicate",
  "updated",
  "invalid",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "approval_submitted",
  "approval_approved",
  "approval_rejected",
  "approval_pending",
  "approval_cleared",
  "approval_none",
  "no_template",
  "no_approvers",
  "error",
]);

const SUCCESS_NOTICES = new Set([
  "created",
  "updated",
  "approval_submitted",
  "approval_approved",
  "approval_cleared",
]);

const PROC_NOTICES = new Set([
  "created",
  "updated",
  "submitted",
  "offer_added",
  "decided",
  "linked",
  "unlinked",
  "cancelled",
  "invalid",
  "needs_migration",
  "not_authorized",
  "not_found",
  "not_editable",
  "limit_reached",
  "approval_submitted",
  "approval_approved",
  "approval_rejected",
  "approval_pending",
  "approval_cleared",
  "approval_none",
  "no_template",
  "no_approvers",
  "error",
]);

const TRIP_NOTICES = new Set([
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "reopened",
  "completed",
  "cancelled",
  "linked",
  "unlinked",
  "invalid",
  "invalid_dates",
  "needs_migration",
  "not_authorized",
  "not_found",
  "not_editable",
  "limit_reached",
  "still_pending",
  "no_instance",
  "no_template",
  "no_approvers",
  "template_created",
  "error",
]);

type StatusFilter = FinanceRecordStatus | "overdue";
const STATUS_FILTERS: readonly StatusFilter[] = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
];

/** Which transitions each status honestly offers (forms rendered per record).
 *  paid_at stamping/clearing happens server-side in the status RPC. */
const TRANSITIONS: Record<
  FinanceRecordStatus,
  readonly { action: string; to: FinanceRecordStatus }[]
> = {
  draft: [
    { action: "issue", to: "issued" },
    { action: "markPaid", to: "paid" },
    { action: "cancel", to: "cancelled" },
  ],
  issued: [
    { action: "markPartial", to: "partially_paid" },
    { action: "markPaid", to: "paid" },
    { action: "cancel", to: "cancelled" },
  ],
  partially_paid: [
    { action: "markPaid", to: "paid" },
    { action: "cancel", to: "cancelled" },
  ],
  paid: [{ action: "markUnpaid", to: "issued" }],
  cancelled: [{ action: "reopen", to: "draft" }],
};

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue text-brand-blue";
const CHIP_IDLE = "border-ink-500 text-text-secondary hover:border-brand-blue";

function financeHref(opts: {
  type?: FinanceRecordType | null;
  status?: StatusFilter | null;
}): string {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return qs ? `/dashboard/finance?${qs}` : "/dashboard/finance";
}

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    type?: string;
    status?: string;
    notice?: string;
    proc?: string;
    trip?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const typeFilter: FinanceRecordType | null =
    sp.type && (FINANCE_RECORD_TYPES as readonly string[]).includes(sp.type)
      ? (sp.type as FinanceRecordType)
      : null;
  const statusFilter: StatusFilter | null =
    sp.status && (STATUS_FILTERS as readonly string[]).includes(sp.status)
      ? (sp.status as StatusFilter)
      : null;
  const notice = sp.notice && NOTICES.has(sp.notice) ? sp.notice : null;
  const procNotice: ProcurementNotice | null =
    sp.proc && PROC_NOTICES.has(sp.proc)
      ? (sp.proc as ProcurementNotice)
      : null;
  const tripNotice: TripNotice | null =
    sp.trip && TRIP_NOTICES.has(sp.trip) ? (sp.trip as TripNotice) : null;

  const t = await getTranslations("finance");

  const result = await listMyFinanceRecords();

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

  // Prominent honest scope note — rendered in EVERY page state so the
  // surface can never be mistaken for bookkeeping or payment software.
  const scopeNote = (
    <p
      className="rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-xs text-text-secondary"
      data-testid="finance-scope-note"
    >
      {t("scopeNote")}
    </p>
  );

  if (result.status === "not-authed") {
    return (
      <div className="flex flex-col gap-6" data-testid="finance-page">
        {header}
        {scopeNote}
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("notAuthed")}
        </p>
      </div>
    );
  }

  if (result.status === "needs-migration") {
    // Calm honest pre-apply state (the tasks/bookings pattern): the
    // owner-gated I2 migration is not applied yet — no fake UI, no controls.
    // The procurement/trips areas carry their own honest degradation.
    return (
      <div className="flex flex-col gap-6" data-testid="finance-page">
        {header}
        {scopeNote}
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="finance-unavailable"
        >
          {t("unavailable")}
        </p>
        <ProcurementSection
          locale={locale}
          notice={procNotice}
          financeRecords={[]}
        />
        <TripsSection locale={locale} notice={tripNotice} financeRecords={[]} />
      </div>
    );
  }

  const [managedProjects, companyId] = await Promise.all([
    listManagedProjects(),
    callerCompanyId(),
  ]);

  const now = new Date();
  const records = result.records;
  const summary = deriveFinanceSummary(records, now);

  const filtered = records.filter((r) => {
    if (typeFilter && r.recordType !== typeFilter) return false;
    if (statusFilter === "overdue") return isOverdueRecord(r, now);
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });

  function hiddenContext() {
    return (
      <>
        <input type="hidden" name="locale" value={locale} />
        {typeFilter ? (
          <input type="hidden" name="typeFilter" value={typeFilter} />
        ) : null}
        {statusFilter ? (
          <input type="hidden" name="statusFilter" value={statusFilter} />
        ) : null}
      </>
    );
  }

  function SummaryStat({
    label,
    cents,
    testid,
    tone,
  }: {
    label: string;
    cents: number;
    testid: string;
    tone?: "danger";
  }) {
    return (
      <div
        className="flex flex-col gap-0.5 rounded-md border border-ink-500 bg-ink-800/30 p-3"
        data-testid={testid}
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {label}
        </span>
        <span
          className={`text-lg font-semibold tabular-nums ${
            tone === "danger" && cents > 0
              ? "text-state-danger"
              : "text-text-primary"
          }`}
        >
          {formatCentsAsEur(cents)} €
        </span>
      </div>
    );
  }

  function RecordCard({ record }: { record: FinanceRecord }) {
    const overdue = isOverdueRecord(record, now);
    return (
      <li
        className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
        data-testid={`finance-record-${record.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-text-primary">
              {record.title}
            </p>
            <p className="break-words text-xs text-text-secondary">
              {record.counterpartyName}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
            {formatCentsAsEur(record.amountCents)} €
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <span className="inline-flex items-center rounded-full border border-ink-500 px-2 py-0.5">
            {t(`type.${record.recordType}`)}
          </span>
          <span>{t(`status.${record.status}`)}</span>
          {record.dueDate ? (
            <span className={overdue ? "text-state-danger" : undefined}>
              {t("dueLabel")}: {dateFmt(record.dueDate)}
            </span>
          ) : null}
          {overdue ? (
            <span
              className="inline-flex items-center rounded-full border border-state-danger/50 bg-state-danger/10 px-2 py-0.5 text-state-danger"
              data-testid="finance-flag-overdue"
            >
              {t("flags.overdue")}
            </span>
          ) : null}
          {record.paidAt ? (
            <span className="text-state-success">
              {t("paidLabel")}: {dateFmt(record.paidAt)}
            </span>
          ) : null}
          {record.projectId ? <span>{t("projectLinked")}</span> : null}
          {record.companyId ? <span>{t("companyLinked")}</span> : null}
          {record.invoiceNumber ? (
            <span data-testid="finance-invoice-number">
              {t("invoiceNoLabel")}: {record.invoiceNumber}
            </span>
          ) : null}
          {record.vatAmountCents !== null ? (
            <span data-testid="finance-vat">
              {t("vatLabel")}: {formatCentsAsEur(record.vatAmountCents)} €
            </span>
          ) : null}
          {record.approvalStatus ? (
            <span
              className={
                record.approvalStatus === "approved"
                  ? "text-state-success"
                  : record.approvalStatus === "rejected"
                    ? "text-state-danger"
                    : "text-brand-blue"
              }
              data-testid={`finance-approval-${record.approvalStatus}`}
            >
              {t(`approval.${record.approvalStatus}`)}
            </span>
          ) : null}
          {record.orgDocumentId ? (
            <span data-testid="finance-doc-linked">{t("documentLinked")}</span>
          ) : null}
          {record.tripId ? (
            <span data-testid="finance-trip-linked">{t("tripLinked")}</span>
          ) : null}
        </div>

        {record.note ? (
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">
            {record.note}
          </p>
        ) : null}

        {/* Status transitions — every control a real RPC-backed action. */}
        <div className="flex flex-wrap items-center gap-2">
          {TRANSITIONS[record.status].map(({ action, to }) => (
            <form key={action} action={setFinanceRecordStatusAction}>
              {hiddenContext()}
              <input type="hidden" name="recordId" value={record.id} />
              <input type="hidden" name="status" value={to} />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                data-testid={`finance-action-${action}-${record.id}`}
              >
                {t(`actions.${action}`)}
              </Button>
            </form>
          ))}
          {/* Approval seam (invoice upgrades v1): submit routes through the
              Workflow & Approval Engine; sync only copies the outcome. Only
              company-linked records can route — the action says so honestly
              when no template exists. */}
          {record.companyId &&
          record.status !== "cancelled" &&
          (record.approvalStatus === null ||
            record.approvalStatus === "rejected") ? (
            <form action={submitFinanceApprovalAction}>
              {hiddenContext()}
              <input type="hidden" name="recordId" value={record.id} />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                data-testid={`finance-action-requestApproval-${record.id}`}
              >
                {t("actions.requestApproval")}
              </Button>
            </form>
          ) : null}
          {record.approvalStatus === "pending" ? (
            <form action={syncFinanceApprovalAction}>
              {hiddenContext()}
              <input type="hidden" name="recordId" value={record.id} />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                data-testid={`finance-action-checkApproval-${record.id}`}
              >
                {t("actions.checkApproval")}
              </Button>
            </form>
          ) : null}
        </div>

        {/* Bounded field edit — native <details>, keyboard accessible. */}
        <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
          <summary className="cursor-pointer text-xs text-text-secondary">
            {t("actions.details")}
          </summary>
          <form
            action={updateFinanceRecordAction}
            className="mt-2 flex flex-col gap-2"
          >
            {hiddenContext()}
            <input type="hidden" name="recordId" value={record.id} />
            <label className="flex flex-col gap-1">
              <Label>{t("form.titleLabel")}</Label>
              <Input
                name="title"
                defaultValue={record.title}
                minLength={FINANCE_TITLE_MIN}
                maxLength={FINANCE_TITLE_MAX}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.counterpartyLabel")}</Label>
              <Input
                name="counterparty"
                defaultValue={record.counterpartyName}
                minLength={FINANCE_COUNTERPARTY_MIN}
                maxLength={FINANCE_COUNTERPARTY_MAX}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.amountLabel")}</Label>
              <Input
                name="amount"
                inputMode="decimal"
                defaultValue={formatCentsAsEur(record.amountCents)}
                placeholder="0.00"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.dueLabel")}</Label>
              <Input
                name="dueDate"
                type="date"
                defaultValue={record.dueDate ?? ""}
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <Label>{t("form.invoiceNoLabel")}</Label>
                <Input
                  name="invoiceNumber"
                  defaultValue={record.invoiceNumber ?? ""}
                  maxLength={FINANCE_INVOICE_NUMBER_MAX}
                />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("form.vatLabel")}</Label>
                <Input
                  name="vatAmount"
                  inputMode="decimal"
                  defaultValue={
                    record.vatAmountCents === null
                      ? ""
                      : formatCentsAsEur(record.vatAmountCents)
                  }
                  placeholder="0.00"
                />
              </label>
            </div>
            {record.orgDocumentId ? (
              <input
                type="hidden"
                name="orgDocumentId"
                value={record.orgDocumentId}
              />
            ) : null}
            <label className="flex flex-col gap-1">
              <Label>{t("form.noteLabel")}</Label>
              <textarea
                name="note"
                defaultValue={record.note ?? ""}
                maxLength={FINANCE_NOTE_MAX}
                rows={2}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
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

  return (
    <div className="flex flex-col gap-6" data-testid="finance-page">
      {header}

      {notice ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            SUCCESS_NOTICES.has(notice)
              ? "border-state-success/50 bg-state-success/10 text-state-success"
              : "border-state-warning/50 bg-state-warning/10 text-text-primary"
          }`}
          data-testid={`finance-notice-${notice}`}
        >
          {t(`notice.${notice}`)}
        </p>
      ) : null}

      {scopeNote}

      {result.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("loadError")}
        </p>
      ) : null}

      {/* Real-sum summary strip — cent-exact totals over the caller's own
          bounded RLS rows (cancelled records excluded from type totals). */}
      <section
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        data-testid="finance-summary"
      >
        <SummaryStat
          label={t("summary.issued")}
          cents={summary.issuedInvoiceCents}
          testid="finance-sum-issued"
        />
        <SummaryStat
          label={t("summary.received")}
          cents={summary.receivedInvoiceCents}
          testid="finance-sum-received"
        />
        <SummaryStat
          label={t("summary.expenses")}
          cents={summary.expenseCents}
          testid="finance-sum-expenses"
        />
        <SummaryStat
          label={t("summary.paid")}
          cents={summary.paidCents}
          testid="finance-sum-paid"
        />
        <SummaryStat
          label={`${t("summary.overdue")} (${summary.overdueCount})`}
          cents={summary.overdueCents}
          testid="finance-sum-overdue"
          tone="danger"
        />
      </section>

      {/* Filters — plain searchParams links (the tasks-view-switch pattern). */}
      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label={t("filters.label")}
        data-testid="finance-filters"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("filters.label")}
        </span>
        <Link
          href={financeHref({ status: statusFilter }) as "/dashboard"}
          aria-current={typeFilter === null ? "true" : undefined}
          data-testid="finance-filter-type-all"
          className={`${CHIP_BASE} ${typeFilter === null ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("filters.allTypes")}
        </Link>
        {FINANCE_RECORD_TYPES.map((type) => (
          <Link
            key={type}
            href={financeHref({ type, status: statusFilter }) as "/dashboard"}
            aria-current={typeFilter === type ? "true" : undefined}
            data-testid={`finance-filter-type-${type}`}
            className={`${CHIP_BASE} ${typeFilter === type ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {t(`type.${type}`)}
          </Link>
        ))}
      </nav>
      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label={t("filters.statusLabel")}
        data-testid="finance-status-filters"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("filters.statusLabel")}
        </span>
        <Link
          href={financeHref({ type: typeFilter }) as "/dashboard"}
          aria-current={statusFilter === null ? "true" : undefined}
          data-testid="finance-filter-status-all"
          className={`${CHIP_BASE} ${statusFilter === null ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("filters.allStatuses")}
        </Link>
        {STATUS_FILTERS.map((status) => (
          <Link
            key={status}
            href={financeHref({ type: typeFilter, status }) as "/dashboard"}
            aria-current={statusFilter === status ? "true" : undefined}
            data-testid={`finance-filter-status-${status}`}
            className={`${CHIP_BASE} ${statusFilter === status ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {status === "overdue"
              ? t("filters.overdue")
              : t(`status.${status}`)}
          </Link>
        ))}
      </nav>

      {/* CSV export — a plain anchor to the RLS-scoped route handler (a file
          download, not a page; the journal-export pattern). */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/${locale}/dashboard/finance/export`}
          className="inline-flex min-h-9 items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          data-testid="finance-export-csv"
        >
          {t("exportCsv")}
        </a>
        <span className="text-xs text-text-muted">{t("exportNote")}</span>
      </div>

      {/* Create — a real RPC-backed form. A project link is offered only
          over the caller's own manageable projects (RLS read); the company
          link is an opt-in checkbox over the caller's OWN company. */}
      <section
        className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4"
        data-testid="finance-create"
      >
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {t("form.title")}
        </h2>
        <form action={createFinanceRecordAction} className="flex flex-col gap-3">
          {hiddenContext()}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Label>{t("form.typeLabel")}</Label>
              <Select name="recordType" defaultValue="expense">
                {FINANCE_RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`type.${type}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.statusLabel")}</Label>
              <Select name="initialStatus" defaultValue="draft">
                {FINANCE_CREATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <Label>{t("form.titleLabel")}</Label>
            <Input
              name="title"
              placeholder={t("form.titlePlaceholder")}
              minLength={FINANCE_TITLE_MIN}
              maxLength={FINANCE_TITLE_MAX}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>{t("form.counterpartyLabel")}</Label>
            <Input
              name="counterparty"
              placeholder={t("form.counterpartyPlaceholder")}
              minLength={FINANCE_COUNTERPARTY_MIN}
              maxLength={FINANCE_COUNTERPARTY_MAX}
              required
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Label>{t("form.amountLabel")}</Label>
              <Input
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.dueLabel")}</Label>
              <Input name="dueDate" type="date" />
            </label>
          </div>
          <p className="text-xs text-text-muted">{t("form.amountHint")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Label>{t("form.invoiceNoLabel")}</Label>
              <Input
                name="invoiceNumber"
                maxLength={FINANCE_INVOICE_NUMBER_MAX}
                placeholder={t("form.invoiceNoPlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.vatLabel")}</Label>
              <Input name="vatAmount" inputMode="decimal" placeholder="0.00" />
            </label>
          </div>
          <p className="text-xs text-text-muted">{t("form.invoiceHint")}</p>
          {managedProjects.length > 0 ? (
            <label className="flex flex-col gap-1">
              <Label>{t("form.projectLabel")}</Label>
              <Select name="projectId" defaultValue="">
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
          {companyId ? (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="hidden" name="companyId" value={companyId} />
              <input
                type="checkbox"
                name="linkCompany"
                defaultChecked
                className="h-4 w-4 rounded border-ink-500 bg-ink-700 accent-brand-blue"
              />
              {t("form.companyLinkLabel")}
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <Label>{t("form.noteLabel")}</Label>
            <textarea
              name="note"
              maxLength={FINANCE_NOTE_MAX}
              rows={2}
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>
          <div>
            <Button type="submit" size="sm" data-testid="finance-create-submit">
              {t("form.submit")}
            </Button>
          </div>
        </form>
      </section>

      {/* Records — the filtered, bounded, RLS-scoped list. */}
      <section className="flex flex-col gap-2" data-testid="finance-records">
        {filtered.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary"
            data-testid="finance-empty"
          >
            {records.length === 0 ? t("empty") : t("emptyFiltered")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="finance-record-list">
            {filtered.map((record) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </ul>
        )}
      </section>

      {/* Procurement + business trips — the audit's MISSING rows, hosted on
          this declared surface (no new route; the #timesheets precedent).
          Each area reads and degrades independently. */}
      <ProcurementSection
        locale={locale}
        notice={procNotice}
        financeRecords={records}
      />
      <TripsSection
        locale={locale}
        notice={tripNotice}
        financeRecords={records}
      />
    </div>
  );
}
