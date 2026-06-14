"use client";

import { useActionState } from "react";
import {
  submitWorkerIntakeAction,
  type WorkerIntakeFormState,
} from "@/lib/staffing/worker-intake-form-actions";

/**
 * Worker intake form (Staffing Operating Model v1, PR10 UI). Posts the intake
 * FormData to the server action, which runs the worker_profile AI agent and
 * returns a labelled SUGGESTION. The draft is clearly marked "AI suggestion —
 * review before saving — not verified"; nothing is persisted by this form.
 */
export interface WorkerIntakeFormLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly fullName: string;
  readonly profession: string;
  readonly targetCountries: string;
  readonly targetCountriesHelp: string;
  readonly availableFrom: string;
  readonly accommodation: string;
  readonly accNeeds: string;
  readonly accHasOwn: string;
  readonly accHelp: string;
  readonly accShare: string;
  readonly transport: string;
  readonly trHas: string;
  readonly trLicence: string;
  readonly trPickup: string;
  readonly trNone: string;
  readonly engagement: string;
  readonly engEmployee: string;
  readonly engZzp: string;
  readonly engSubcontractor: string;
  readonly engBrigade: string;
  readonly engAgency: string;
  readonly languages: string;
  readonly languagesHelp: string;
  readonly comment: string;
  readonly commentHelp: string;
  readonly submit: string;
  readonly aiBadge: string;
  readonly aiNotVerified: string;
  readonly aiDisabled: string;
  readonly aiHeadline: string;
  readonly aiSkills: string;
  readonly aiMissing: string;
  readonly aiNone: string;
  readonly statusInvalid: string;
  readonly statusError: string;
  // ZZP / brigade (PR5)
  readonly zzpHeading: string;
  readonly zzpNote: string;
  readonly businessName: string;
  readonly vatNumber: string;
  readonly teamSize: string;
  readonly teamProfessions: string;
  readonly teamProfessionsHelp: string;
  readonly tools: string;
  readonly toolsHelp: string;
  readonly insurance: string;
  readonly invoiceReady: string;
  readonly invoiceYes: string;
  readonly invoiceNo: string;
}

const FIELD =
  "rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";
const LABEL = "flex flex-col gap-1 text-xs";
const HELP = "text-[11px] text-text-muted";

export function WorkerIntakeForm({
  labels,
  professions,
}: {
  readonly labels: WorkerIntakeFormLabels;
  readonly professions: readonly { slug: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState<
    WorkerIntakeFormState | null,
    FormData
  >(submitWorkerIntakeAction, null);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4" data-testid="worker-intake-form">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">{labels.title}</h2>
          <p className="text-sm text-text-secondary">{labels.subtitle}</p>
        </header>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.fullName}</span>
          <input type="text" name="full_name" required minLength={1} maxLength={160} className={FIELD} />
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.profession}</span>
          <select name="profession" required defaultValue="" className={FIELD}>
            <option value="" disabled>—</option>
            {professions.map((p) => (
              <option key={p.slug} value={p.slug}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.targetCountries}</span>
          <input type="text" name="target_countries" maxLength={120} placeholder="NL, DE" className={FIELD} />
          <span className={HELP}>{labels.targetCountriesHelp}</span>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.availableFrom}</span>
          <input type="date" name="available_from" className={FIELD} />
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.accommodation}</span>
          <select name="accommodation" defaultValue="needs_accommodation" className={FIELD}>
            <option value="needs_accommodation">{labels.accNeeds}</option>
            <option value="has_own_accommodation">{labels.accHasOwn}</option>
            <option value="needs_help_finding">{labels.accHelp}</option>
            <option value="can_share_room">{labels.accShare}</option>
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.transport}</span>
          <select name="transport" defaultValue="none" className={FIELD}>
            <option value="has_transport">{labels.trHas}</option>
            <option value="has_driving_licence">{labels.trLicence}</option>
            <option value="needs_pickup">{labels.trPickup}</option>
            <option value="none">{labels.trNone}</option>
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.engagement}</span>
          <select name="engagement_type" defaultValue="employee" className={FIELD}>
            <option value="employee">{labels.engEmployee}</option>
            <option value="zzp_self_employed">{labels.engZzp}</option>
            <option value="subcontractor">{labels.engSubcontractor}</option>
            <option value="brigade">{labels.engBrigade}</option>
            <option value="agency_supplied">{labels.engAgency}</option>
          </select>
        </label>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.languages}</span>
          <input type="text" name="languages" maxLength={120} placeholder="en, lt" className={FIELD} />
          <span className={HELP}>{labels.languagesHelp}</span>
        </label>

        <fieldset className="flex flex-col gap-4 rounded-xl border border-border-default p-4">
          <legend className="px-1 text-xs font-semibold text-text-secondary">
            {labels.zzpHeading}
          </legend>
          <p className={HELP}>{labels.zzpNote}</p>
          <div className="grid grid-cols-2 gap-4">
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.businessName}</span>
              <input type="text" name="business_name" maxLength={200} className={FIELD} />
            </label>
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.vatNumber}</span>
              <input type="text" name="vat_number" maxLength={40} className={FIELD} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.teamSize}</span>
              <input type="number" name="team_size" min={1} max={200} className={FIELD} />
            </label>
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.insurance}</span>
              <input type="text" name="insurance" maxLength={200} className={FIELD} />
            </label>
          </div>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.teamProfessions}</span>
            <input type="text" name="team_professions" maxLength={300} className={FIELD} />
            <span className={HELP}>{labels.teamProfessionsHelp}</span>
          </label>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.tools}</span>
            <input type="text" name="tools" maxLength={300} className={FIELD} />
            <span className={HELP}>{labels.toolsHelp}</span>
          </label>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.invoiceReady}</span>
            <select name="invoice_ready" defaultValue="no" className={FIELD}>
              <option value="yes">{labels.invoiceYes}</option>
              <option value="no">{labels.invoiceNo}</option>
            </select>
          </label>
        </fieldset>

        <label className={LABEL}>
          <span className="text-text-secondary">{labels.comment}</span>
          <textarea name="comment" rows={4} maxLength={8000} className={FIELD} />
          <span className={HELP}>{labels.commentHelp}</span>
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="worker-intake-submit"
        >
          {labels.submit}
        </button>
      </form>

      {state ? (
        <section
          className="rounded-xl border border-border-default bg-surface-1 p-4"
          role="status"
          data-testid="worker-intake-result"
        >
          {!state.ok ? (
            <p className="text-xs text-state-warning">
              {state.code === "invalid" ? labels.statusInvalid : labels.statusError}
            </p>
          ) : state.draftStatus === "disabled" ? (
            <p className="text-xs text-text-secondary">{labels.aiDisabled}</p>
          ) : state.draftStatus === "needs_review" ? (
            <p className="text-xs text-text-secondary">{labels.aiNone}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-label text-brand-blue">
                  {labels.aiBadge}
                </span>
                <span className="text-[11px] text-text-muted">{labels.aiNotVerified}</span>
              </div>
              {state.headline ? (
                <p className="text-sm text-text-primary">
                  <span className="text-text-muted">{labels.aiHeadline}: </span>
                  {state.headline}
                </p>
              ) : null}
              {state.skills && state.skills.length ? (
                <p className="text-sm text-text-secondary">
                  <span className="text-text-muted">{labels.aiSkills}: </span>
                  {state.skills.join(", ")}
                </p>
              ) : null}
              {state.missing && state.missing.length ? (
                <p className="text-sm text-text-secondary">
                  <span className="text-text-muted">{labels.aiMissing}: </span>
                  {state.missing.join(", ")}
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
