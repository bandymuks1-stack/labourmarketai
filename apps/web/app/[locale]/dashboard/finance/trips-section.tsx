import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import {
  cancelTripAction,
  completeTripAction,
  createStandardTripTemplateAction,
  createTripAction,
  setFinanceRecordTripAction,
  submitTripAction,
  syncTripDecisionAction,
  updateTripAction,
} from "@/lib/trips/trips-actions";
import {
  TRIP_DESTINATION_MAX,
  TRIP_DESTINATION_MIN,
  TRIP_PURPOSE_MAX,
  TRIP_PURPOSE_MIN,
  isTripCancellable,
  isTripEditable,
  type TripNotice,
  type TripRow,
} from "@/lib/trips/trips-model";
import { getTripsOverview, type TripTemplateState } from "@/lib/trips/trips";
import {
  formatCentsAsEur,
  type FinanceRecord,
} from "@/lib/finance/finance-model";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Business trips area of the finance page — the audit's MISSING "business
 * trips" row made real.
 *
 * Constitution note: deliberately NOT a new dashboard route. The blessed
 * pattern for new capability is expansion INSIDE an existing declared
 * surface (the planning #timesheets precedent); trip advances and trip
 * expenses are finance records on this very page, so the area lives here
 * under the #trips anchor.
 *
 * Approval decisions happen in the approvals area (the canonical Workflow &
 * Approval Engine) — this section starts instances through the engine's own
 * RPC and only mirrors outcomes. The linked-expense total is DERIVED at
 * read time from the caller's own finance rows. Nothing here books travel
 * or pays anyone.
 *
 * Honest degradation: while the human-gated trips migration is unapplied
 * the whole area shows a calm "not enabled yet" state; an org without a
 * published trip template gets a clear message (and org admins a one-click
 * standard template) instead of a dead submit button.
 */

const STATUS_TONE: Record<TripRow["status"], string> = {
  draft: "border-ink-500 text-text-muted",
  submitted: "border-brand-blue/50 text-brand-blue",
  approved: "border-state-success/50 text-state-success",
  rejected: "border-state-danger/50 text-state-danger",
  completed: "border-ink-500 text-text-secondary",
  cancelled: "border-ink-500 text-text-muted",
};

const SUCCESS_NOTICES: readonly TripNotice[] = [
  "created",
  "updated",
  "submitted",
  "approved",
  "reopened",
  "completed",
  "linked",
  "unlinked",
  "template_created",
];

export async function TripsSection({
  locale,
  notice,
  financeRecords,
}: {
  locale: string;
  notice: TripNotice | null;
  /** The caller's own finance records (for the expense-link select) —
   *  passed in so the page reads them exactly once. */
  financeRecords: readonly FinanceRecord[];
}) {
  const t = await getTranslations("trips");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });
  const overview = await getTripsOverview();

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
      data-testid={`trips-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  if (overview.status === "needs-migration") {
    return (
      <section id="trips" className="flex flex-col gap-3" data-testid="trips-section">
        {header}
        {noticeBanner}
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="trips-needs-migration"
        >
          {t("needsMigration")}
        </p>
      </section>
    );
  }

  const { mine, org, finance, templates, orgOptions } = overview;
  const unlinkedRecords = financeRecords.filter((r) => r.tripId === null);

  function hidden(tripId?: string) {
    return (
      <>
        <input type="hidden" name="locale" value={locale} />
        {tripId ? <input type="hidden" name="tripId" value={tripId} /> : null}
      </>
    );
  }

  function TemplateNote({
    template,
    organizationId,
  }: {
    template: TripTemplateState | undefined;
    organizationId: string;
  }) {
    if (template?.published) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 px-2 py-1.5 text-xs text-text-secondary">
        <span>{t("noTemplate")}</span>
        {/* The engine re-checks governance authority server-side — a member
            without it simply hears not_authorized, honestly. */}
        <form action={createStandardTripTemplateAction}>
          {hidden()}
          <input type="hidden" name="organizationId" value={organizationId} />
          <Button type="submit" variant="secondary" size="sm">
            {t("actions.createTemplate")}
          </Button>
        </form>
      </div>
    );
  }

  function TripItem({ trip, own }: { trip: TripRow; own: boolean }) {
    const linked = finance.get(trip.id);
    const template = templates.get(trip.organizationId);
    return (
      <li
        className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
        data-testid={`trip-${trip.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold text-text-primary">
            {trip.destination}
          </p>
          <span className="shrink-0 text-xs text-text-secondary">
            {dateFmt(trip.dateFrom)} – {dateFmt(trip.dateTo)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 ${STATUS_TONE[trip.status]}`}
          >
            {t(`status.${trip.status}`)}
          </span>
          {trip.advanceAmountCents !== null ? (
            <span>
              {t("advanceLabel")}: {formatCentsAsEur(trip.advanceAmountCents)} €
            </span>
          ) : null}
          {linked && linked.records.length > 0 ? (
            <span data-testid={`trip-expense-total-${trip.id}`}>
              {t("expensesLabel")}: {formatCentsAsEur(linked.totalCents)} € (
              {linked.records.length})
            </span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">
          {trip.purpose}
        </p>

        {/* Linked expenses — the derived reconciliation list. */}
        {linked && linked.records.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {linked.records.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 break-words text-text-primary">
                  {r.title}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-text-primary">
                    {formatCentsAsEur(r.amountCents)} €
                  </span>
                  <form action={setFinanceRecordTripAction}>
                    {hidden()}
                    <input type="hidden" name="recordId" value={r.id} />
                    <input type="hidden" name="tripId" value="" />
                    <Button type="submit" variant="secondary" size="sm">
                      {t("actions.unlink")}
                    </Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Link one of the caller's own records to this trip. */}
        {own && unlinkedRecords.length > 0 && trip.status !== "cancelled" ? (
          <form
            action={setFinanceRecordTripAction}
            className="flex flex-wrap items-center gap-2"
          >
            {hidden(trip.id)}
            <Select name="recordId" defaultValue="" className="max-w-72" required>
              <option value="" disabled>
                {t("form.recordPick")}
              </option>
              {unlinkedRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} — {formatCentsAsEur(r.amountCents)} €
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" size="sm">
              {t("actions.linkExpense")}
            </Button>
          </form>
        ) : null}

        {/* Edit the traveler's own draft. */}
        {own && isTripEditable(trip.status) ? (
          <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
            <summary className="cursor-pointer text-xs text-text-secondary">
              {t("actions.edit")}
            </summary>
            <form action={updateTripAction} className="mt-2 flex flex-col gap-2">
              {hidden(trip.id)}
              <label className="flex flex-col gap-1">
                <Label>{t("form.destinationLabel")}</Label>
                <Input
                  name="destination"
                  defaultValue={trip.destination}
                  minLength={TRIP_DESTINATION_MIN}
                  maxLength={TRIP_DESTINATION_MAX}
                  required
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <Label>{t("form.fromLabel")}</Label>
                  <Input name="dateFrom" type="date" defaultValue={trip.dateFrom} required />
                </label>
                <label className="flex flex-col gap-1">
                  <Label>{t("form.toLabel")}</Label>
                  <Input name="dateTo" type="date" defaultValue={trip.dateTo} required />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <Label>{t("form.purposeLabel")}</Label>
                <textarea
                  name="purpose"
                  defaultValue={trip.purpose}
                  minLength={TRIP_PURPOSE_MIN}
                  maxLength={TRIP_PURPOSE_MAX}
                  rows={2}
                  required
                  className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-brand-blue"
                />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("form.advanceLabel")}</Label>
                <Input
                  name="advanceAmount"
                  inputMode="decimal"
                  defaultValue={
                    trip.advanceAmountCents === null
                      ? ""
                      : formatCentsAsEur(trip.advanceAmountCents)
                  }
                  placeholder="0.00"
                />
              </label>
              <div>
                <Button type="submit" variant="secondary" size="sm">
                  {t("actions.save")}
                </Button>
              </div>
            </form>
          </details>
        ) : null}

        {/* Real transitions per status. */}
        <div className="flex flex-wrap items-center gap-2">
          {own && trip.status === "draft" && template?.published ? (
            <form action={submitTripAction}>
              {hidden(trip.id)}
              <Button type="submit" size="sm" data-testid={`trip-submit-${trip.id}`}>
                {t("actions.submit")}
              </Button>
            </form>
          ) : null}
          {trip.status === "submitted" ? (
            <form action={syncTripDecisionAction}>
              {hidden(trip.id)}
              <Button type="submit" variant="secondary" size="sm">
                {t("actions.checkDecision")}
              </Button>
            </form>
          ) : null}
          {trip.status === "approved" ? (
            <form action={completeTripAction}>
              {hidden(trip.id)}
              <Button type="submit" variant="secondary" size="sm">
                {t("actions.complete")}
              </Button>
            </form>
          ) : null}
          {isTripCancellable(trip.status) ? (
            <form action={cancelTripAction}>
              {hidden(trip.id)}
              <Button type="submit" variant="secondary" size="sm">
                {t("actions.cancel")}
              </Button>
            </form>
          ) : null}
        </div>
        {own && trip.status === "draft" ? (
          <TemplateNote
            template={template}
            organizationId={trip.organizationId}
          />
        ) : null}
      </li>
    );
  }

  return (
    <section id="trips" className="flex flex-col gap-3" data-testid="trips-section">
      {header}
      {noticeBanner}
      {overview.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("readError")}
        </p>
      ) : null}

      {/* Create — offered only where the caller belongs to an org. */}
      {orgOptions.length > 0 ? (
        <details
          className="rounded-md border border-ink-500 bg-ink-800/30 p-3"
          data-testid="trips-create"
        >
          <summary className="cursor-pointer text-sm font-semibold text-text-primary">
            {t("form.open")}
          </summary>
          <form action={createTripAction} className="mt-3 flex flex-col gap-3">
            {hidden()}
            <label className="flex flex-col gap-1">
              <Label>{t("form.orgLabel")}</Label>
              <Select
                name="organizationId"
                defaultValue={orgOptions[0]!.organizationId}
              >
                {orgOptions.map((o) => (
                  <option key={o.organizationId} value={o.organizationId}>
                    {o.name ?? o.organizationId.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.destinationLabel")}</Label>
              <Input
                name="destination"
                minLength={TRIP_DESTINATION_MIN}
                maxLength={TRIP_DESTINATION_MAX}
                placeholder={t("form.destinationPlaceholder")}
                required
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <Label>{t("form.fromLabel")}</Label>
                <Input name="dateFrom" type="date" required />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("form.toLabel")}</Label>
                <Input name="dateTo" type="date" required />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <Label>{t("form.purposeLabel")}</Label>
              <textarea
                name="purpose"
                minLength={TRIP_PURPOSE_MIN}
                maxLength={TRIP_PURPOSE_MAX}
                rows={2}
                required
                placeholder={t("form.purposePlaceholder")}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.advanceLabel")}</Label>
              <Input name="advanceAmount" inputMode="decimal" placeholder="0.00" />
            </label>
            <p className="text-xs text-text-muted">{t("form.advanceHint")}</p>
            <div>
              <Button type="submit" size="sm" data-testid="trips-create-submit">
                {t("form.submit")}
              </Button>
            </div>
          </form>
        </details>
      ) : null}

      {mine.length === 0 && org.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
          data-testid="trips-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <>
          {mine.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="trips-mine">
              {mine.map((trip) => (
                <TripItem key={trip.id} trip={trip} own={true} />
              ))}
            </ul>
          ) : null}
          {org.length > 0 ? (
            <div className="flex flex-col gap-2" data-testid="trips-org">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("orgHeading")}
              </h3>
              <ul className="flex flex-col gap-2">
                {org.map((trip) => (
                  <TripItem key={trip.id} trip={trip} own={false} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
