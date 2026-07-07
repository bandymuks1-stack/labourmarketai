"use client";

import { useActionState } from "react";
import {
  submitCompanyNeedAction,
  type CompanyNeedFormState,
} from "@/lib/staffing/company-need-form-actions";
import type { WorkCategoryOptionGroup } from "@/lib/taxonomy/work-categories";

/**
 * Company need / vacancy form (Staffing Operating Model v1, PR4 UI / PR10).
 * Posts the need FormData to the server action, which runs the company_need AI
 * agent and returns a labelled vacancy SUGGESTION ("AI suggestion — review
 * before publishing — not verified"). Nothing is published by this form.
 */
export interface CompanyNeedFormLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly companyName: string;
  readonly contactPerson: string;
  readonly contactPersonHelp: string;
  readonly contactEmail: string;
  readonly contactEmailHelp: string;
  readonly profession: string;
  readonly country: string;
  readonly countryHelp: string;
  readonly cityRegion: string;
  readonly cityRegionHelp: string;
  readonly numberOfWorkers: string;
  readonly startDate: string;
  readonly expectedDuration: string;
  readonly expectedDurationHelp: string;
  readonly urgency: string;
  readonly urgencyAsap: string;
  readonly urgencyWeeks: string;
  readonly urgencyFlexible: string;
  readonly preparedTitle: string;
  readonly preparedBody: string;
  readonly receivedTitle: string;
  readonly receivedBody: string;
  readonly partnerRouteTitle: string;
  readonly partnerRouteBody: string;
  readonly accommodation: string;
  readonly accFree: string;
  readonly accPaid: string;
  readonly accDeducted: string;
  readonly accNone: string;
  readonly transport: string;
  readonly transportYes: string;
  readonly transportNo: string;
  readonly languages: string;
  readonly languagesHelp: string;
  readonly engagement: string;
  readonly engEmployment: string;
  readonly engSubcontracting: string;
  readonly engAgency: string;
  readonly description: string;
  readonly descriptionHelp: string;
  readonly submit: string;
  readonly aiBadge: string;
  readonly aiNotVerified: string;
  readonly aiDisabled: string;
  readonly aiRole: string;
  readonly aiSkills: string;
  readonly aiDocs: string;
  readonly aiMissing: string;
  readonly aiBlockers: string;
  readonly aiNone: string;
  readonly statusInvalid: string;
  readonly statusError: string;
}

const FIELD =
  "rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";
const LABEL = "flex flex-col gap-1 text-xs";
const HELP = "text-[11px] text-text-muted";

export function CompanyNeedForm({
  labels,
  categories,
  countryOptions,
}: {
  readonly labels: CompanyNeedFormLabels;
  readonly categories: readonly WorkCategoryOptionGroup[];
  /** Constrained target-market list (code + localized name) — no free-text codes. */
  readonly countryOptions: ReadonlyArray<{ code: string; label: string }>;
}) {
  const [state, formAction, isPending] = useActionState<
    CompanyNeedFormState | null,
    FormData
  >(submitCompanyNeedAction, null);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4" data-testid="company-need-form">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">{labels.title}</h2>
          <p className="text-sm text-text-secondary">{labels.subtitle}</p>
        </header>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.companyName}</span>
          <input type="text" name="company_name" required minLength={1} maxLength={200} className={FIELD} />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.contactPerson}</span>
            <input type="text" name="contact_person" maxLength={160} className={FIELD} />
            <span className={HELP}>{labels.contactPersonHelp}</span>
          </label>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.contactEmail}</span>
            <input type="email" name="contact_email" maxLength={254} className={FIELD} />
            <span className={HELP}>{labels.contactEmailHelp}</span>
          </label>
        </div>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.profession}</span>
          <select name="profession" required defaultValue="" className={FIELD}>
            <option value="" disabled>—</option>
            {categories.map((c) => (
              <optgroup key={c.key} label={c.sector}>
                {c.options.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.country}</span>
            <select name="country" required defaultValue="" className={FIELD} data-testid="company-need-country">
              <option value="" disabled>—</option>
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <span className={HELP}>{labels.countryHelp}</span>
          </label>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.numberOfWorkers}</span>
            <input type="number" name="number_of_workers" min={1} max={1000} defaultValue={1} className={FIELD} />
          </label>
        </div>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.cityRegion}</span>
          <input type="text" name="city_region" maxLength={160} className={FIELD} />
          <span className={HELP}>{labels.cityRegionHelp}</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.startDate}</span>
            <input type="date" name="start_date" className={FIELD} />
          </label>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.urgency}</span>
            <select name="urgency" defaultValue="flexible" className={FIELD}>
              <option value="asap">{labels.urgencyAsap}</option>
              <option value="weeks">{labels.urgencyWeeks}</option>
              <option value="flexible">{labels.urgencyFlexible}</option>
            </select>
          </label>
        </div>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.expectedDuration}</span>
          <input type="text" name="expected_duration" maxLength={120} className={FIELD} />
          <span className={HELP}>{labels.expectedDurationHelp}</span>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.accommodation}</span>
          <select name="accommodation" defaultValue="not_provided" className={FIELD}>
            <option value="provided_free">{labels.accFree}</option>
            <option value="provided_paid">{labels.accPaid}</option>
            <option value="provided_deducted">{labels.accDeducted}</option>
            <option value="not_provided">{labels.accNone}</option>
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.transport}</span>
          <select name="transport_provided" defaultValue="no" className={FIELD}>
            <option value="yes">{labels.transportYes}</option>
            <option value="no">{labels.transportNo}</option>
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.languages}</span>
          <input type="text" name="languages" maxLength={120} placeholder="en, nl" className={FIELD} />
          <span className={HELP}>{labels.languagesHelp}</span>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.engagement}</span>
          <select name="engagement_model" defaultValue="employment" className={FIELD}>
            <option value="employment">{labels.engEmployment}</option>
            <option value="subcontracting">{labels.engSubcontracting}</option>
            <option value="agency_supply">{labels.engAgency}</option>
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.description}</span>
          <textarea name="description" required rows={4} maxLength={8000} className={FIELD} />
          <span className={HELP}>{labels.descriptionHelp}</span>
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="company-need-submit"
        >
          {labels.submit}
        </button>
      </form>

      {state ? (
        <section
          className="rounded-xl border border-border-default bg-surface-1 p-4"
          role="status"
          data-testid="company-need-result"
        >
          {!state.ok ? (
            <p className="text-xs text-state-warning">
              {state.code === "invalid" ? labels.statusInvalid : labels.statusError}
            </p>
          ) : (
            // Two honest success shapes, never a dead-end:
            //  · persisted  → the structured need was really stored for
            //    follow-up ("request received" + account is useful to manage it);
            //  · !persisted → the anon backend is not applied yet / a transient
            //    error occurred, so we degrade to the operational "prepared —
            //    create an account to submit" state (form data is kept).
            // The AI vacancy suggestion is shown as enrichment only when a
            // provider is configured.
            <div
              className="flex flex-col gap-3"
              data-testid={state.persisted ? "company-need-received" : "company-need-prepared"}
            >
              <p className="font-display text-sm font-semibold text-text-primary">
                {state.persisted ? labels.receivedTitle : labels.preparedTitle}
              </p>
              <p className="text-sm leading-relaxed text-text-secondary">
                {state.persisted ? labels.receivedBody : labels.preparedBody}
              </p>
              {state.draftStatus === "suggestion" ? (
                <div className="mt-1 flex flex-col gap-3 border-t border-border-default pt-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-label text-brand-blue">
                      {labels.aiBadge}
                    </span>
                    <span className="text-[11px] text-text-muted">{labels.aiNotVerified}</span>
                  </div>
                  {state.role ? (
                    <p className="text-sm text-text-primary">
                      <span className="text-text-muted">{labels.aiRole}: </span>
                      {state.role}
                    </p>
                  ) : null}
                  {state.skills && state.skills.length ? (
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted">{labels.aiSkills}: </span>
                      {state.skills.join(", ")}
                    </p>
                  ) : null}
                  {state.documents && state.documents.length ? (
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted">{labels.aiDocs}: </span>
                      {state.documents.join(", ")}
                    </p>
                  ) : null}
                  {state.missing && state.missing.length ? (
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted">{labels.aiMissing}: </span>
                      {state.missing.join(", ")}
                    </p>
                  ) : null}
                  {state.blockers && state.blockers.length ? (
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted">{labels.aiBlockers}: </span>
                      {state.blockers.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Construction-only honest fallback: if there is no suitable
                  direct platform match yet, we may first recommend the LT/PL
                  partner-company route. Human-coordinated, one option among
                  several — no guarantees, no automatic matching. */}
              {state.isConstruction ? (
                <div
                  className="mt-1 flex flex-col gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-3"
                  data-testid="company-need-partner-route"
                >
                  <p className="font-display text-sm font-semibold text-text-primary">
                    {labels.partnerRouteTitle}
                  </p>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {labels.partnerRouteBody}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
