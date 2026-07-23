"use client";

import { useActionState } from "react";
import { UserPlus, Trash2, ArrowUpRight } from "lucide-react";

import {
  groupOffersByRequest,
  type AgencyCandidateOffersState,
  type AgencyNeedOption,
  type AgencyRosterOption,
} from "@/lib/agency/candidate-offers-model";
import {
  submitAgencyOfferAction,
  withdrawAgencyOfferAction,
  type AgencyOfferActionState,
} from "@/lib/agency/candidate-offers-actions";

/**
 * "Pasiūlyti darbuotoją klientui" — the staffing-agency candidate OFFER form
 * (agency→client bridge v1). Renders ONLY inside the staffing_agency block of
 * the canonical company workspace.
 *
 * This is the surface that replaces the old, misleading "Pasiūlyti darbuotojus"
 * action which opened the demand-intake wizard (a "we are LOOKING FOR workers"
 * flow). Here the agency does the opposite: it OFFERS one of its OWN active
 * roster workers as a candidate FOR one of its OWN client-linked needs. The
 * two intents are labelled distinctly so they can never be confused again.
 *
 * An offer is a private candidate-proposal record — nothing is sent to anyone.
 * Review / booking stay on the existing scouting surface per need (link only).
 * Until the owner applies the gated migration this panel degrades to an honest
 * "prepared" state; nothing is faked.
 */
export interface AgencyOfferLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly distinctionNote: string;
  readonly gatedHeading: string;
  readonly gatedBody: string;
  readonly needLabel: string;
  readonly needPlaceholder: string;
  readonly workerLabel: string;
  readonly workerPlaceholder: string;
  readonly noteLabel: string;
  readonly submitButton: string;
  readonly offersHeading: string;
  readonly offersEmpty: string;
  readonly withdrawButton: string;
  readonly openScouting: string;
  readonly noRoster: string;
  readonly noNeeds: string;
  readonly errorLabel: string;
  readonly notRosterLabel: string;
  readonly notFoundLabel: string;
}

const IDLE: AgencyOfferActionState = { status: "idle" };

/** Short non-PII fallback token for a worker no longer resolvable on the
 *  roster (e.g. later removed) — mirrors the anonymized-candidate style. */
function fallbackWorkerLabel(workerId: string): string {
  const token = workerId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  return `#${token}`;
}

export function AgencyOfferWorkerForm({
  id,
  offers,
  rosterOptions,
  needOptions,
  locale,
  labels,
}: {
  id?: string;
  offers: AgencyCandidateOffersState;
  rosterOptions: readonly AgencyRosterOption[];
  needOptions: readonly AgencyNeedOption[];
  locale: string;
  labels: AgencyOfferLabels;
}) {
  const [submitState, submitAction, submitPending] = useActionState(
    submitAgencyOfferAction,
    IDLE,
  );
  const [withdrawState, withdrawAction] = useActionState(
    withdrawAgencyOfferAction,
    IDLE,
  );

  const gated =
    offers.kind === "needs-migration" ||
    submitState.status === "needs-migration" ||
    withdrawState.status === "needs-migration";

  const offerRows = offers.kind === "ok" ? offers.rows : [];
  const byRequest = groupOffersByRequest(offerRows);

  const workerLabelById = new Map(
    rosterOptions.map((r) => [r.workerId, r.label] as const),
  );
  const needTitleById = new Map(
    needOptions.map((n) => [n.requestId, n.title] as const),
  );

  const canOffer = rosterOptions.length > 0 && needOptions.length > 0;

  const actionError =
    submitState.status === "error" ||
    submitState.status === "invalid" ||
    withdrawState.status === "error" ||
    withdrawState.status === "invalid";

  return (
    <section
      id={id}
      className="card-border flex flex-col gap-4 p-5"
      data-testid="agency-offer-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <UserPlus className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
        <p
          className="mt-1 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-muted"
          data-testid="agency-offer-distinction"
        >
          {labels.distinctionNote}
        </p>
      </header>

      {gated ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="agency-offer-gated"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {labels.gatedHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{labels.gatedBody}</p>
        </div>
      ) : offers.kind === "error" ? (
        <p className="text-xs text-state-danger" role="alert">
          {labels.errorLabel}
        </p>
      ) : (
        <>
          {/* Active offers, grouped by the need they target. */}
          {byRequest.size === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="agency-offer-empty"
            >
              {labels.offersEmpty}
            </p>
          ) : (
            <div className="flex flex-col gap-3" data-testid="agency-offer-list">
              <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {labels.offersHeading}
              </h3>
              {[...byRequest.entries()].map(([requestId, reqOffers]) => (
                <div
                  key={requestId}
                  className="card-border flex flex-col gap-2 p-3"
                  data-testid="agency-offer-need-group"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                      {needTitleById.get(requestId) ?? "—"}
                    </span>
                    <a
                      href={`/${locale}/dashboard/company/scouting?request=${requestId}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
                      data-testid="agency-offer-scouting-link"
                    >
                      {labels.openScouting} <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </a>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {reqOffers.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
                        data-testid="agency-offer-row"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                          {workerLabelById.get(o.workerId) ??
                            fallbackWorkerLabel(o.workerId)}
                        </span>
                        {o.note && (
                          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
                            {o.note}
                          </span>
                        )}
                        <form action={withdrawAction} className="shrink-0">
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            aria-label={labels.withdrawButton}
                            title={labels.withdrawButton}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-ink-500 px-2 text-xs text-text-muted transition-colors hover:border-state-danger hover:text-state-danger"
                            data-testid={`agency-offer-withdraw-${o.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* The offer form — ONE clear next action. */}
          {!canOffer ? (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="agency-offer-blocked"
            >
              {rosterOptions.length === 0 ? labels.noRoster : labels.noNeeds}
            </p>
          ) : (
            <form
              action={submitAction}
              className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid="agency-offer-form"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-44 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">
                    {labels.needLabel}
                  </span>
                  <select
                    name="requestId"
                    required
                    defaultValue=""
                    className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                  >
                    <option value="" disabled>
                      {labels.needPlaceholder}
                    </option>
                    {needOptions.map((n) => (
                      <option key={n.requestId} value={n.requestId}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-44 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">
                    {labels.workerLabel}
                  </span>
                  <select
                    name="workerId"
                    required
                    defaultValue=""
                    className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                  >
                    <option value="" disabled>
                      {labels.workerPlaceholder}
                    </option>
                    {rosterOptions.map((r) => (
                      <option key={r.workerId} value={r.workerId}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-40 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">
                    {labels.noteLabel}
                  </span>
                  <input
                    type="text"
                    name="note"
                    maxLength={500}
                    className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitPending}
                  data-testid="agency-offer-submit"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
                >
                  {labels.submitButton}
                </button>
              </div>
            </form>
          )}

          {submitState.status === "not-roster" && (
            <p className="text-xs text-state-danger" role="alert">
              {labels.notRosterLabel}
            </p>
          )}
          {submitState.status === "not-found" && (
            <p className="text-xs text-state-danger" role="alert">
              {labels.notFoundLabel}
            </p>
          )}
          {actionError && (
            <p className="text-xs text-state-danger" role="alert">
              {labels.errorLabel}
            </p>
          )}
        </>
      )}
    </section>
  );
}
