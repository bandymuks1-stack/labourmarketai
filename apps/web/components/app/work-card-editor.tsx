"use client";

import { useActionState, useState, useTransition } from "react";

import { Link } from "@/lib/i18n/navigation";
import {
  saveWorkerCardAction,
  confirmWorkerCardAction,
  type WorkCardActionResult,
} from "@/lib/worker/work-card-actions";
import type { WorkCardValues } from "@/lib/worker/work-card";
import type { WorkCardState } from "@/lib/worker/work-card-state";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Interactive part of "Mano darbo kortelė" (slice work-card-state-aware-v1):
 *   - the ONE primary next action (a real Link, or an inline-edit trigger),
 *   - the small "Ar tai vis dar galioja?" confirmation when the card is stale,
 *   - a secondary/collapsed editor for the card fields (prefilled, partial-save
 *     safe). No fake state: every control calls a real owner-scoped action.
 *
 * All copy is passed in as resolved labels (server resolves i18n).
 */

export interface WorkCardLabels {
  nextEyebrow: string;
  nextLabel: string;
  why: string;
  staleTitle: string;
  staleBody: string;
  yes: string;
  change: string;
  staleSaved: string;
  editorOpen: string;
  editorTitle: string;
  availabilityLabel: string;
  availabilityOptionAvailable: string;
  availabilityOptionBusy: string;
  availabilityOptionUnavailable: string;
  availabilityOptionNone: string;
  availableFromLabel: string;
  locationLabel: string;
  locationHint: string;
  preferredLabel: string;
  preferredHint: string;
  salaryMinLabel: string;
  salaryMaxLabel: string;
  save: string;
  saving: string;
  saved: string;
  errorMsg: string;
  needsMigration: string;
}

const primaryCta =
  "inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5";
const secondaryBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue";

export function WorkCardEditor({
  state,
  nextHref,
  values,
  labels,
}: {
  state: WorkCardState;
  /** Real route for the next action, or null when it is an inline card edit. */
  nextHref: string | null;
  values: WorkCardValues;
  labels: WorkCardLabels;
}) {
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState<
    WorkCardActionResult | null,
    FormData
  >(saveWorkerCardAction, null);
  const [confirmPending, startConfirm] = useTransition();
  const [confirmDone, setConfirmDone] = useState(false);

  const why = (
    <p className="max-w-prose text-xs leading-relaxed text-text-muted">
      {labels.why}
    </p>
  );

  // ── The single primary next action ─────────────────────────────────────
  // Stale card → the primary move is the small confirmation, not a new task.
  const primary =
    state === "stale" ? null : nextHref ? (
      <div className="flex flex-col gap-2">
        <Link
          href={nextHref as "/dashboard/profile"}
          className={primaryCta}
          data-testid="work-card-next"
          onClick={() =>
            trackFunnel(FUNNEL_EVENTS.firstActionCardClicked, {
              surface: "work_card",
            })
          }
        >
          {labels.nextLabel} →
        </Link>
        {why}
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={primaryCta}
          data-testid="work-card-next"
          onClick={() => setOpen(true)}
        >
          {labels.nextLabel}
        </button>
        {why}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {primary}

      {/* ── Stale: "Ar tai vis dar galioja?" — one small confirmation ── */}
      {state === "stale" && (
        <div
          className="flex flex-col gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/5 p-4"
          data-testid="work-card-stale"
        >
          <p className="text-sm font-semibold text-text-primary">
            {labels.staleTitle}
          </p>
          <p className="text-xs leading-relaxed text-text-secondary">
            {labels.staleBody}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryCta}
              disabled={confirmPending || confirmDone}
              data-testid="work-card-confirm-yes"
              onClick={() =>
                startConfirm(async () => {
                  const r = await confirmWorkerCardAction();
                  if (r.ok) setConfirmDone(true);
                })
              }
            >
              {confirmDone ? labels.staleSaved : labels.yes}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setOpen(true)}
              data-testid="work-card-confirm-change"
            >
              {labels.change}
            </button>
          </div>
        </div>
      )}

      {/* ── Secondary/collapsed editor (always available, never primary) ── */}
      <div>
        <button
          type="button"
          className={secondaryBtn}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-testid="work-card-editor-toggle"
        >
          {labels.editorOpen}
        </button>

        {open && (
          <form
            action={saveAction}
            className="mt-3 flex flex-col gap-4 rounded-md border border-ink-600 bg-ink-800/40 p-4"
            data-testid="work-card-editor"
          >
            <p className="font-display text-sm font-semibold text-text-primary">
              {labels.editorTitle}
            </p>

            {/* kada — availability */}
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono uppercase tracking-label text-text-muted">
                {labels.availabilityLabel}
              </span>
              <select
                name="availability_status"
                defaultValue={values.availabilityStatus ?? ""}
                className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
              >
                <option value="">{labels.availabilityOptionNone}</option>
                <option value="available">
                  {labels.availabilityOptionAvailable}
                </option>
                <option value="busy">{labels.availabilityOptionBusy}</option>
                <option value="unavailable">
                  {labels.availabilityOptionUnavailable}
                </option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono uppercase tracking-label text-text-muted">
                {labels.availableFromLabel}
              </span>
              <input
                type="date"
                name="available_from"
                defaultValue={values.availableFrom ?? ""}
                className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
              />
            </label>

            {/* kur — location */}
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono uppercase tracking-label text-text-muted">
                {labels.locationLabel}
              </span>
              <input
                type="text"
                name="location_country"
                maxLength={2}
                placeholder={labels.locationHint}
                defaultValue={values.locationCountry ?? ""}
                className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm uppercase text-text-primary"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono uppercase tracking-label text-text-muted">
                {labels.preferredLabel}
              </span>
              <input
                type="text"
                name="preferred_countries"
                placeholder={labels.preferredHint}
                defaultValue={values.preferredCountries.join(", ")}
                className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm uppercase text-text-primary"
              />
            </label>

            {/* kiek — pay */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-mono uppercase tracking-label text-text-muted">
                  {labels.salaryMinLabel}
                </span>
                <input
                  type="number"
                  name="salary_min"
                  min={0}
                  inputMode="numeric"
                  defaultValue={values.salaryMin ?? ""}
                  className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-mono uppercase tracking-label text-text-muted">
                  {labels.salaryMaxLabel}
                </span>
                <input
                  type="number"
                  name="salary_max"
                  min={0}
                  inputMode="numeric"
                  defaultValue={values.salaryMax ?? ""}
                  className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className={primaryCta} disabled={savePending}>
                {savePending ? labels.saving : labels.save}
              </button>
              {saveState?.ok && (
                <span className="text-xs text-state-success" role="status">
                  {labels.saved}
                </span>
              )}
              {saveState && !saveState.ok && (
                <span className="text-xs text-state-danger" role="status">
                  {saveState.code === "needs_migration"
                    ? labels.needsMigration
                    : labels.errorMsg}
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
