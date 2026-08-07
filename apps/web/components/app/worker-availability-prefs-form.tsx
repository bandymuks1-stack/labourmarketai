"use client";

import { useActionState, useRef, useState } from "react";
import { Check } from "lucide-react";

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
  DRIVING_LICENCE_CATEGORIES,
  EMPTY_PREFS_V2,
  MAX_TRIP_DAYS_MAX,
  MAX_TRIP_DAYS_MIN,
  NOTE_MAX_LENGTH,
  PAY_BASIS_PREFERENCES,
  TRI_STATE_VALUES,
  type DrivingLicenceCategory,
  type TriState,
  type WorkerAvailabilityPrefs,
  type WorkerAvailabilityPrefsV2,
} from "@/lib/worker/availability-prefs-model";
import { cn } from "@/lib/utils";

/**
 * "Structured work preferences" card (PR 3) — the worker-facing form for the
 * 8 availability-pref columns applied by migration 20260613100000, extended
 * (P2-PR3) with the 7 DRAFT v2 columns from migration 20260711270000
 * (PR #721 — human-gated, NOT applied yet).
 *
 * Tri-state honesty: each boolean pref is a THREE-option segmented control
 * (not stated / yes / no). "Not stated" is a real selectable answer that
 * saves null — the control never collapses an unanswered pref into "no".
 *
 * v2 honest gating: when the read path did not see the v2 columns, the v2
 * fieldset renders as its calm not-enabled explanation (same convention as
 * the whole card's needs-migration state) — the fields are not editable, so
 * the form never pretends it could save them. When enabled, saves go through
 * the v2 RPC; if that RPC turns out absent the server action still saves the
 * 8 v1 fields via the v1 RPC and reports that the extra fields were NOT saved.
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
  v2: {
    title: string;
    hint: string;
    payBasis: string;
    payBasisOptions: Record<(typeof PAY_BASIS_PREFERENCES)[number], string>;
    nightShifts: string;
    weekendShifts: string;
    overtime: string;
    licenceCategories: string;
    ownVehicle: string;
    ownTools: string;
    /** Calm not-enabled copy for the v2 fieldset only. */
    notEnabled: string;
    /** Honest post-save notice: the v1 fields saved, the v2 fields did NOT. */
    notSaved: string;
  };
}

/**
 * One tri-state pref as a 3-option segmented control. A hidden input carries
 * the value into FormData, so the server action sees exactly what is shown.
 *
 * ── W7-S2 ────────────────────────────────────────────────────────────────
 * This was already an ARIA `radiogroup` of `radio`s with an accessible name,
 * and the measurement confirmed every option was correctly named. What it did
 * NOT honour was the rest of the radiogroup contract:
 *
 *   • ROVING TABINDEX. All three options were plain `<button>`s, so each was
 *     its own tab stop — 10 groups × 3 = 30 tab stops where the pattern
 *     specifies 10. A keyboard user had to press Tab three times per
 *     preference to cross the form.
 *   • ARROW KEYS. Nothing was bound, so the one interaction a screen-reader
 *     user is told to expect ("radio group — use arrow keys") did nothing.
 *   • SELECTION BY COLOUR ALONE. The chosen option differed only in text and
 *     background colour.
 *   • TARGET SIZE. 32 px tall, and 88–100 px wide at 375.
 *
 * All four are fixed here. The three business states, their order, their
 * stored values and the hidden input are untouched.
 */
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
  const labelId = `prefs-tristate-${name}-label`;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Arrow / Home / End move the selection AND the focus, which is what the
   *  radiogroup pattern specifies — a radio group has one tab stop and the
   *  arrows choose within it. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = TRI_STATE_VALUES.indexOf(value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % TRI_STATE_VALUES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + TRI_STATE_VALUES.length) % TRI_STATE_VALUES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TRI_STATE_VALUES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(TRI_STATE_VALUES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid={`prefs-tristate-${name}`}>
      {/* The VISIBLE label is the programmatic name — `aria-labelledby` instead
          of a duplicated `aria-label`, so the two can never drift apart. */}
      <Label id={labelId}>{label}</Label>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 overflow-hidden rounded-md border border-ink-600"
      >
        {TRI_STATE_VALUES.map((opt, i) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tabindex: exactly ONE tab stop per group.
              tabIndex={selected ? 0 : -1}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-testid={`prefs-tristate-${name}-${opt}`}
              onClick={() => onChange(opt)}
              className={cn(
                "relative flex min-h-11 items-center justify-center px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue",
                i > 0 && "border-l border-ink-600",
                selected
                  ? "bg-brand-blue/15 text-brand-blue"
                  : "bg-ink-900 text-text-secondary hover:text-text-primary",
              )}
            >
              {/* Selection is not encoded by colour alone — but the mark is
                  ABSOLUTELY positioned rather than inline. Inline, it stole
                  ~14px from a segment that is only 88px wide inside the v2
                  fieldset at 375, and truncated the longest option to
                  "Nenuro…". The label always gets the full width now. */}
              {selected && (
                <Check
                  aria-hidden
                  data-selected-mark="true"
                  className="absolute left-1 top-1 h-2.5 w-2.5"
                  strokeWidth={3}
                />
              )}
              <span>{options[opt]}</span>
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/**
 * One licence-category chip row (B/BE/C/CE/D multi-select). Selected chips
 * emit hidden inputs so FormData carries exactly what is shown.
 *
 * ── W7-S2 ────────────────────────────────────────────────────────────────
 * These are independent toggles, not a single choice, so they stay TOGGLE
 * BUTTONS (`aria-pressed`) inside a named `group` — a native pattern that
 * already answers Space and Enter, and each is its own tab stop by design.
 * What was wrong: 34–42 × 30 px targets, and a pressed state carried by
 * colour alone. A bare "B" also reads as nothing useful on its own, so each
 * chip now states what it is in its accessible name.
 */
function LicenceChips({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DrivingLicenceCategory[];
  onChange: (v: DrivingLicenceCategory[]) => void;
}) {
  const labelId = "prefs-licence-categories-label";
  const toggle = (cat: DrivingLicenceCategory) => {
    onChange(
      value.includes(cat)
        ? value.filter((c) => c !== cat)
        : DRIVING_LICENCE_CATEGORIES.filter((c) => c === cat || value.includes(c)),
    );
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid="prefs-licence-categories">
      <Label id={labelId}>{label}</Label>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {DRIVING_LICENCE_CATEGORIES.map((cat) => {
          const selected = value.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={selected}
              // "B" alone is not a name a screen-reader user can act on; the
              // category is stated in full. The visible chip stays compact.
              aria-label={`${label}: ${cat}`}
              onClick={() => toggle(cat)}
              data-testid={`prefs-licence-${cat}`}
              className={cn(
                "relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                selected
                  ? "border-brand-blue bg-brand-blue/15 text-brand-blue"
                  : "border-ink-600 bg-ink-900 text-text-secondary hover:text-text-primary",
              )}
            >
              {/* Pressed state is not colour-only. Absolutely positioned for
                  the same reason as the tri-state mark: a chip is 44px wide. */}
              {selected && (
                <Check
                  aria-hidden
                  data-selected-mark="true"
                  className="absolute left-1 top-1 h-2.5 w-2.5"
                  strokeWidth={3}
                />
              )}
              {cat}
            </button>
          );
        })}
      </div>
      {value.map((cat) => (
        <input
          key={cat}
          type="hidden"
          name="driving_licence_categories"
          value={cat}
        />
      ))}
    </div>
  );
}

export function WorkerAvailabilityPrefsForm({
  initial,
  labels,
  needsMigration = false,
  v2Enabled = false,
  initialV2 = EMPTY_PREFS_V2,
}: {
  initial: WorkerAvailabilityPrefs;
  labels: WorkerAvailabilityPrefsLabels;
  /** True when the read path reported the columns are not applied — the card
   *  shows the honest awaiting-DB-update notice instead of a form that would
   *  fail on save. */
  needsMigration?: boolean;
  /** True only when the read path actually saw the 7 draft v2 columns
   *  (PR #721 applied). False → the v2 fieldset renders its honest
   *  not-enabled explanation and submits nothing for those fields. */
  v2Enabled?: boolean;
  initialV2?: WorkerAvailabilityPrefsV2;
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

  // v2 fields (draft PR #721) — state only matters when v2Enabled.
  const [payBasis, setPayBasis] = useState<string>(
    initialV2.payBasisPreference ?? "",
  );
  const [nightShiftsOk, setNightShiftsOk] = useState<TriState>(
    booleanToTriState(initialV2.nightShiftsOk),
  );
  const [weekendShiftsOk, setWeekendShiftsOk] = useState<TriState>(
    booleanToTriState(initialV2.weekendShiftsOk),
  );
  const [overtimeOk, setOvertimeOk] = useState<TriState>(
    booleanToTriState(initialV2.overtimeOk),
  );
  const [licenceCategories, setLicenceCategories] = useState<
    DrivingLicenceCategory[]
  >(initialV2.drivingLicenceCategories ?? []);
  const [ownVehicle, setOwnVehicle] = useState<TriState>(
    booleanToTriState(initialV2.ownVehicle),
  );
  const [ownTools, setOwnTools] = useState<TriState>(
    booleanToTriState(initialV2.ownTools),
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

  const payBasisOptions = [
    // "" = not stated — same convention as the contract-type listbox.
    { value: "", label: labels.triState.not_stated },
    ...PAY_BASIS_PREFERENCES.map((v) => ({
      value: v,
      label: labels.v2.payBasisOptions[v],
    })),
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

          {/* v2 fieldset (draft PR #721) — pay basis, shift willingness,
              licences, own vehicle/tools. Renders editable ONLY when the read
              path saw the v2 columns; otherwise the calm not-enabled line
              (fields withheld — never editable fields that silently drop). */}
          <fieldset
            className="flex flex-col gap-4 rounded-md border border-ink-600 p-4"
            data-testid="prefs-v2-fieldset"
          >
            <legend className="px-1 font-mono text-meta uppercase tracking-label text-text-secondary">
              {labels.v2.title}
            </legend>
            {v2Enabled ? (
              <>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {labels.v2.hint}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>{labels.v2.payBasis}</Label>
                    <DarkListbox
                      value={payBasis}
                      onChange={setPayBasis}
                      options={payBasisOptions}
                      name="pay_basis_preference"
                      ariaLabel={labels.v2.payBasis}
                      testId="prefs-pay-basis"
                    />
                  </div>
                  <TriStateField
                    name="night_shifts_ok"
                    label={labels.v2.nightShifts}
                    value={nightShiftsOk}
                    onChange={setNightShiftsOk}
                    options={labels.triState}
                  />
                  <TriStateField
                    name="weekend_shifts_ok"
                    label={labels.v2.weekendShifts}
                    value={weekendShiftsOk}
                    onChange={setWeekendShiftsOk}
                    options={labels.triState}
                  />
                  <TriStateField
                    name="overtime_ok"
                    label={labels.v2.overtime}
                    value={overtimeOk}
                    onChange={setOvertimeOk}
                    options={labels.triState}
                  />
                  <TriStateField
                    name="own_vehicle"
                    label={labels.v2.ownVehicle}
                    value={ownVehicle}
                    onChange={setOwnVehicle}
                    options={labels.triState}
                  />
                  <TriStateField
                    name="own_tools"
                    label={labels.v2.ownTools}
                    value={ownTools}
                    onChange={setOwnTools}
                    options={labels.triState}
                  />
                </div>
                <LicenceChips
                  label={labels.v2.licenceCategories}
                  value={licenceCategories}
                  onChange={setLicenceCategories}
                />
              </>
            ) : (
              <p
                className="text-sm text-text-secondary"
                role="status"
                data-testid="prefs-v2-not-enabled"
              >
                {labels.v2.notEnabled}
              </p>
            )}
            {/* Server-derived capability flag — the action tries the v2 RPC
                only when the read path actually saw the v2 columns. */}
            <input
              type="hidden"
              name="prefs_v2_enabled"
              value={v2Enabled ? "true" : "false"}
            />
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            {/* W7-S2: 44px target. Applied HERE, not to the shared `sm` size —
                changing that would resize every small button in the app, which
                is a visual-system decision this slice has no mandate for. */}
            <Button
              type="submit"
              size="sm"
              className="min-h-11"
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
            {saveState?.ok && saveState.v2Saved === false && (
              <span
                className="text-xs text-state-warning"
                role="status"
                data-testid="prefs-v2-not-saved"
              >
                {labels.v2.notSaved}
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
