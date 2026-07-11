"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  saveWorkerAvailabilityPrefsAction,
  type AvailabilityPrefsActionResult,
} from "@/lib/worker/availability-prefs-actions";
import {
  booleanToTriState,
  CONTRACT_TYPES,
  MAX_TRIP_DAYS_MAX,
  MAX_TRIP_DAYS_MIN,
  NOTE_MAX_LENGTH,
  TRI_STATE_VALUES,
  type TriState,
  type WorkerAvailabilityPrefs,
} from "@/lib/worker/availability-prefs-model";
import { cn } from "@/lib/utils";

/**
 * "Structured work preferences" card (PR 3) — the worker-facing form for the
 * 8 availability-pref columns applied by migration 20260613100000.
 *
 * Tri-state honesty: each boolean pref is a THREE-option segmented control
 * (not stated / yes / no). "Not stated" is a real selectable answer that
 * saves null — the control never collapses an unanswered pref into "no".
 *
 * All copy arrives as resolved labels (server resolves i18n), matching the
 * work-card-editor / skill-clarify-form convention.
 */

export interface WorkerAvailabilityPrefsLabels {
  title: string;
  hint: string;
  willingToRelocate: string;
  needsAccommodation: string;
  hasTransport: string;
  teamAvailable: string;
  soloAvailable: string;
  maxTripDays: string;
  contractType: string;
  note: string;
  triState: Record<TriState, string>;
  contract: Record<(typeof CONTRACT_TYPES)[number], string>;
  notePlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
  needsMigration: string;
}

/** One tri-state pref as a 3-option segmented control. A hidden input carries
 *  the value into FormData, so the server action sees exactly what is shown. */
function TriStateField({
  name,
  label,
  value,
  onChange,
  options,
}: {
  name: string;
  label: string;
  value: TriState;
  onChange: (v: TriState) => void;
  options: Record<TriState, string>;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={`prefs-tristate-${name}`}>
      <Label>{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-3 overflow-hidden rounded-md border border-ink-600"
      >
        {TRI_STATE_VALUES.map((opt, i) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={value === opt}
            data-testid={`prefs-tristate-${name}-${opt}`}
            onClick={() => onChange(opt)}
            className={cn(
              "px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue",
              i > 0 && "border-l border-ink-600",
              value === opt
                ? "bg-brand-blue/15 text-brand-blue"
                : "bg-ink-900 text-text-secondary hover:text-text-primary",
            )}
          >
            {options[opt]}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function WorkerAvailabilityPrefsForm({
  initial,
  labels,
  needsMigration = false,
}: {
  initial: WorkerAvailabilityPrefs;
  labels: WorkerAvailabilityPrefsLabels;
  /** True when the read path reported the columns are not applied — the card
   *  shows the honest awaiting-DB-update notice instead of a form that would
   *  fail on save. */
  needsMigration?: boolean;
}) {
  const [willingToRelocate, setWillingToRelocate] = useState<TriState>(
    booleanToTriState(initial.willingToRelocate),
  );
  const [needsAccommodation, setNeedsAccommodation] = useState<TriState>(
    booleanToTriState(initial.needsAccommodation),
  );
  const [hasTransport, setHasTransport] = useState<TriState>(
    booleanToTriState(initial.hasTransport),
  );
  const [teamAvailable, setTeamAvailable] = useState<TriState>(
    booleanToTriState(initial.teamAvailable),
  );
  const [soloAvailable, setSoloAvailable] = useState<TriState>(
    booleanToTriState(initial.soloAvailable),
  );
  const [contractType, setContractType] = useState<string>(
    initial.preferredContractType ?? "",
  );

  const [saveState, saveAction, savePending] = useActionState<
    AvailabilityPrefsActionResult | null,
    FormData
  >(saveWorkerAvailabilityPrefsAction, null);

  const contractOptions = [
    // "" = not stated — a real option, so an unset contract pref stays unset.
    { value: "", label: labels.triState.not_stated },
    ...CONTRACT_TYPES.map((v) => ({ value: v, label: labels.contract[v] })),
  ];

  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="worker-availability-prefs"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{labels.hint}</p>
      </header>

      {needsMigration ? (
        <p
          className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-sm text-text-secondary"
          role="status"
          data-testid="prefs-needs-migration"
        >
          {labels.needsMigration}
        </p>
      ) : (
        <form
          action={saveAction}
          className="flex flex-col gap-4"
          data-testid="worker-availability-prefs-form"
        >
          {/* 5 tri-state prefs — single column on phones, 2-up from sm. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TriStateField
              name="willing_to_relocate"
              label={labels.willingToRelocate}
              value={willingToRelocate}
              onChange={setWillingToRelocate}
              options={labels.triState}
            />
            <TriStateField
              name="needs_accommodation"
              label={labels.needsAccommodation}
              value={needsAccommodation}
              onChange={setNeedsAccommodation}
              options={labels.triState}
            />
            <TriStateField
              name="has_transport"
              label={labels.hasTransport}
              value={hasTransport}
              onChange={setHasTransport}
              options={labels.triState}
            />
            <TriStateField
              name="team_available"
              label={labels.teamAvailable}
              value={teamAvailable}
              onChange={setTeamAvailable}
              options={labels.triState}
            />
            <TriStateField
              name="solo_available"
              label={labels.soloAvailable}
              value={soloAvailable}
              onChange={setSoloAvailable}
              options={labels.triState}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <Label>{labels.maxTripDays}</Label>
              <Input
                type="number"
                name="max_trip_days"
                min={MAX_TRIP_DAYS_MIN}
                max={MAX_TRIP_DAYS_MAX}
                inputMode="numeric"
                defaultValue={initial.maxTripDays ?? ""}
                data-testid="prefs-max-trip-days"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <Label>{labels.contractType}</Label>
              <DarkListbox
                value={contractType}
                onChange={setContractType}
                options={contractOptions}
                name="preferred_contract_type"
                ariaLabel={labels.contractType}
                testId="prefs-contract-type"
              />
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <Label>{labels.note}</Label>
            <textarea
              name="availability_note"
              rows={3}
              maxLength={NOTE_MAX_LENGTH}
              placeholder={labels.notePlaceholder}
              defaultValue={initial.availabilityNote ?? ""}
              data-testid="prefs-note"
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="sm"
              loading={savePending}
              disabled={savePending}
              data-testid="prefs-save"
            >
              {savePending ? labels.saving : labels.save}
            </Button>
            {saveState?.ok && (
              <span
                className="text-xs text-state-success"
                role="status"
                data-testid="prefs-saved"
              >
                {labels.saved}
              </span>
            )}
            {saveState && !saveState.ok && (
              <span
                className="text-xs text-state-danger"
                role="alert"
                data-testid="prefs-error"
              >
                {saveState.code === "needs_migration"
                  ? labels.needsMigration
                  : labels.error}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
