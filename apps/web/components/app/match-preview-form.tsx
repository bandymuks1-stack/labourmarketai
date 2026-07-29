"use client";

import { useActionState } from "react";
import {
  previewMatchAction,
  type MatchPreviewState,
} from "@/lib/staffing/match-preview-actions";
import type { WorkCategoryOptionGroup } from "@/lib/taxonomy/work-categories";

/**
 * Match preview form (Staffing Operating Model v1, PR8). NON-PERSISTED: enter a
 * worker's facts + a company need, see the deterministic fit + an AI fit
 * explanation. Clearly marked "preview only — not booked / not saved as a
 * booking request". No booking, no persistence, no contact.
 */
export interface MatchPreviewLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly previewOnly: string;
  readonly workerSection: string;
  readonly needSection: string;
  readonly trade: string;
  readonly wAvailable: string;
  readonly wAccommodation: string;
  readonly wAccNeeds: string;
  readonly wAccOwn: string;
  readonly wTransport: string;
  readonly wTrHas: string;
  readonly wTrPickup: string;
  readonly wLanguages: string;
  readonly nCountry: string;
  readonly nStart: string;
  readonly nAccommodation: string;
  readonly nAccProvided: string;
  readonly nAccNone: string;
  readonly nTransport: string;
  readonly nLanguages: string;
  readonly nAcceptsNonEnglish: string;
  readonly yes: string;
  readonly no: string;
  readonly submit: string;
  readonly scoreTitle: string;
  readonly fit: string;
  readonly mismatch: string;
  readonly unknown: string;
  readonly of: string;
  readonly dimProfession: string;
  readonly dimAccommodation: string;
  readonly dimTransport: string;
  readonly dimLanguage: string;
  readonly dimStartDate: string;
  readonly verdictFit: string;
  readonly verdictMismatch: string;
  readonly verdictUnknown: string;
  readonly blockersTitle: string;
  readonly aiBadge: string;
  readonly aiExplanationTitle: string;
  readonly aiDisabled: string;
  readonly aiNone: string;
  readonly statusInvalid: string;
}

const FIELD =
  "rounded-md border border-border-default bg-surface-1 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-brand-blue";
const LBL = "flex flex-col gap-1 text-xs";

export function MatchPreviewForm({
  labels,
  categories,
}: {
  readonly labels: MatchPreviewLabels;
  readonly categories: readonly WorkCategoryOptionGroup[];
}) {
  const [state, formAction, isPending] = useActionState<
    MatchPreviewState | null,
    FormData
  >(previewMatchAction, null);

  const dimLabel: Record<string, string> = {
    profession: labels.dimProfession,
    accommodation: labels.dimAccommodation,
    transport: labels.dimTransport,
    language: labels.dimLanguage,
    start_date: labels.dimStartDate,
  };
  const verdictLabel: Record<string, string> = {
    fit: labels.verdictFit,
    mismatch: labels.verdictMismatch,
    unknown: labels.verdictUnknown,
  };
  const verdictTone: Record<string, string> = {
    fit: "text-state-success",
    mismatch: "text-state-warning",
    unknown: "text-text-muted",
  };

  const ProfessionSelect = ({ name }: { name: string }) => (
    <select name={name} required defaultValue="" className={FIELD}>
      <option value="" disabled>—</option>
      {categories.map((c) => (
        <optgroup key={c.key} label={c.sector}>
          {c.options.map((o) => (
            <option key={o.slug} value={o.slug}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text-primary">{labels.title}</h1>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>
      <p className="rounded-md border border-brand-blue/30 bg-brand-blue/10 px-3 py-2 text-xs font-semibold text-brand-blue">
        {labels.previewOnly}
      </p>

      <form action={formAction} className="grid gap-6 md:grid-cols-2" data-testid="match-preview-form">
        <fieldset className="flex flex-col gap-3 rounded-xl border border-border-default p-4">
          <legend className="px-1 text-xs font-semibold text-text-secondary">{labels.workerSection}</legend>
          <label className={LBL}><span className="text-text-secondary">{labels.trade}</span><ProfessionSelect name="w_profession" /></label>
          <label className={LBL}><span className="text-text-secondary">{labels.wAvailable}</span><input type="date" name="w_available_from" className={FIELD} /></label>
          <label className={LBL}><span className="text-text-secondary">{labels.wAccommodation}</span>
            <select name="w_accommodation" defaultValue="needs_accommodation" className={FIELD}>
              <option value="needs_accommodation">{labels.wAccNeeds}</option>
              <option value="has_own_accommodation">{labels.wAccOwn}</option>
            </select>
          </label>
          <label className={LBL}><span className="text-text-secondary">{labels.wTransport}</span>
            <select name="w_transport" defaultValue="has_transport" className={FIELD}>
              <option value="has_transport">{labels.wTrHas}</option>
              <option value="needs_pickup">{labels.wTrPickup}</option>
            </select>
          </label>
          <label className={LBL}><span className="text-text-secondary">{labels.wLanguages}</span><input type="text" name="w_languages" placeholder="en, lt" className={FIELD} /></label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl border border-border-default p-4">
          <legend className="px-1 text-xs font-semibold text-text-secondary">{labels.needSection}</legend>
          <label className={LBL}><span className="text-text-secondary">{labels.trade}</span><ProfessionSelect name="n_profession" /></label>
          <label className={LBL}><span className="text-text-secondary">{labels.nCountry}</span><input type="text" name="n_country" required maxLength={2} placeholder="NL" className={FIELD} /></label>
          <label className={LBL}><span className="text-text-secondary">{labels.nStart}</span><input type="date" name="n_start_date" className={FIELD} /></label>
          <label className={LBL}><span className="text-text-secondary">{labels.nAccommodation}</span>
            <select name="n_accommodation" defaultValue="not_provided" className={FIELD}>
              <option value="provided_free">{labels.nAccProvided}</option>
              <option value="not_provided">{labels.nAccNone}</option>
            </select>
          </label>
          <label className={LBL}><span className="text-text-secondary">{labels.nTransport}</span>
            <select name="n_transport_provided" defaultValue="no" className={FIELD}>
              <option value="yes">{labels.yes}</option>
              <option value="no">{labels.no}</option>
            </select>
          </label>
          <label className={LBL}><span className="text-text-secondary">{labels.nLanguages}</span><input type="text" name="n_languages" placeholder="en, nl" className={FIELD} /></label>
          <label className={LBL}><span className="text-text-secondary">{labels.nAcceptsNonEnglish}</span>
            <select name="n_accepts_non_english" defaultValue="yes" className={FIELD}>
              <option value="yes">{labels.yes}</option>
              <option value="no">{labels.no}</option>
            </select>
          </label>
        </fieldset>

        <div className="md:col-span-2">
          <button type="submit" disabled={isPending} className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50" data-testid="match-preview-submit">
            {labels.submit}
          </button>
        </div>
      </form>

      {state ? (
        <section className="rounded-xl border border-border-default bg-surface-1 p-4" role="status" data-testid="match-preview-result">
          {!state.ok ? (
            <p className="text-xs text-state-warning">{labels.statusInvalid}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-primary">
                <span className="font-semibold">{labels.scoreTitle}: </span>
                {state.score!.fit} {labels.of} {state.score!.total} {labels.fit}
                {state.score!.mismatch > 0 ? ` · ${state.score!.mismatch} ${labels.mismatch}` : ""}
                {state.score!.unknown > 0 ? ` · ${state.score!.unknown} ${labels.unknown}` : ""}
              </p>
              <ul className="flex flex-col gap-1 text-xs">
                {state.dimensions!.map((d) => (
                  <li key={d.dimension} className="flex gap-2">
                    <span className="w-28 text-text-muted">{dimLabel[d.dimension] ?? d.dimension}</span>
                    <span className={`w-20 font-semibold ${verdictTone[d.verdict] ?? ""}`}>{verdictLabel[d.verdict] ?? d.verdict}</span>
                    <span className="text-text-secondary">{d.detail}</span>
                  </li>
                ))}
              </ul>
              {state.blockers && state.blockers.length ? (
                <p className="text-xs text-state-warning">
                  <span className="font-semibold">{labels.blockersTitle}: </span>
                  {state.blockers.join("; ")}
                </p>
              ) : null}
              <div className="rounded-md border border-border-subtle bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-meta font-semibold uppercase tracking-label text-brand-blue">{labels.aiBadge}</span>
                  <span className="text-meta text-text-muted">{labels.aiExplanationTitle}</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {state.explanationStatus === "suggestion" && state.explanation
                    ? state.explanation
                    : state.explanationStatus === "disabled"
                      ? labels.aiDisabled
                      : labels.aiNone}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
