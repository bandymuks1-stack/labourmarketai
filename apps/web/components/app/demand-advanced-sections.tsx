"use client";

/**
 * Advanced structured-demand sections (marketplace precision PR 2,
 * Capability A) — the OPTIONAL "advanced details" half of the canonical
 * demand wizard. Six collapsible clusters (engagement, time, compensation,
 * accommodation, transport, requirements, process) writing the
 * `structured_v2` payload contract through the EXISTING submit path — no new
 * form system, no second demand model.
 *
 * Honesty rules baked into the controls:
 *  - every field is optional; empty = "not stated" (never a fabricated
 *    default; checkboxes persist only when checked);
 *  - closed sets only — selects/chips over the contract vocabularies;
 *  - amounts are explicit-currency integer cents; gross/net is its own field;
 *  - the talent-pool listing kind immediately shows its disclosure text.
 *
 * All controls are real (no fake-clickable cards); section headers are real
 * buttons with aria-expanded; chips use aria-pressed.
 */
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  ACCOMMODATION_AMENITIES,
  ACCOMMODATION_PAYERS,
  ACCOMMODATION_STATES,
  APPLICATION_METHODS,
  DEDUCTION_KINDS,
  ENGAGEMENT_FORMS,
  LANGUAGE_LEVELS,
  LICENCE_CATEGORIES,
  LISTING_KINDS,
  OPPORTUNITY_TYPES,
  PAY_BASES,
  PAY_UNITS,
  PAYMENT_FREQUENCIES,
  REQUIREMENT_LANGUAGES,
  ROOM_TYPES,
  SHIFT_KINDS,
  TARGET_SUPPLIES,
  TRANSPORT_LEVELS,
} from "@/lib/demand/structured-demand-v2";
import type { RequirementPriorityKey, RequirementTier } from "@/lib/demand/structured-demand-v2";
import type {
  AdvancedDemandFormState,
  DeductionRow,
  LanguageRow,
} from "@/lib/demand/structured-demand-form";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

/** Language display names in their own language — locale-independent by
 *  design (the standard picker convention), so no 11-locale key set. */
const LANGUAGE_NATIVE_NAMES: Record<string, string> = {
  en: "English",
  lt: "Lietuvių",
  lv: "Latviešu",
  et: "Eesti",
  nl: "Nederlands",
  de: "Deutsch",
  da: "Dansk",
  no: "Norsk",
  sv: "Svenska",
  pl: "Polski",
  ru: "Русский",
};

const CURRENCY_OPTIONS = ["EUR", "PLN", "SEK", "NOK", "DKK"] as const;

type Patch = (patch: Partial<AdvancedDemandFormState>) => void;

export function DemandAdvancedSections({
  state,
  onChange,
}: {
  state: AdvancedDemandFormState;
  onChange: Patch;
}) {
  const t = useTranslations("structuredDemand");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  // ── Small shared controls ──────────────────────────────────────────────────

  const enumOptions = (prefix: string, values: readonly string[]) =>
    values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));

  function Select({
    label,
    value,
    onValue,
    options,
    testId,
  }: {
    label: string;
    value: string;
    onValue: (v: string) => void;
    options: { value: string; label: string }[];
    testId?: string;
  }) {
    return (
      <label className="flex min-w-0 flex-col gap-1.5">
        <Label>{label}</Label>
        <DarkListbox
          value={value}
          onChange={onValue}
          options={options}
          ariaLabel={label}
          placeholder={t("notStated")}
          testId={testId}
        />
      </label>
    );
  }

  function NumberField({
    label,
    value,
    onValue,
    max,
    step,
    testId,
  }: {
    label: string;
    value: string;
    onValue: (v: string) => void;
    max?: number;
    step?: string;
    testId?: string;
  }) {
    return (
      <label className="flex min-w-0 flex-col gap-1.5">
        <Label>{label}</Label>
        <Input
          type="number"
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          data-testid={testId}
        />
      </label>
    );
  }

  function DateField({
    label,
    value,
    onValue,
    testId,
  }: {
    label: string;
    value: string;
    onValue: (v: string) => void;
    testId?: string;
  }) {
    return (
      <label className="flex min-w-0 flex-col gap-1.5">
        <Label>{label}</Label>
        <Input
          type="date"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          data-testid={testId}
        />
      </label>
    );
  }

  function CheckRow({
    label,
    checked,
    onChecked,
    testId,
  }: {
    label: string;
    checked: boolean;
    onChecked: (v: boolean) => void;
    testId?: string;
  }) {
    return (
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
          className="h-4 w-4 accent-brand-orange"
          data-testid={testId}
        />
        {label}
      </label>
    );
  }

  function Chips({
    label,
    values,
    selected,
    onToggle,
    render,
    testId,
  }: {
    label: string;
    values: readonly string[];
    selected: string[];
    onToggle: (v: string) => void;
    render: (v: string) => string;
    testId?: string;
  }) {
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="contents">
          <Label>{label}</Label>
        </legend>
        <ul className="flex flex-wrap gap-2" data-testid={testId}>
          {values.map((v) => {
            const isSelected = selected.includes(v);
            return (
              <li key={v}>
                <button
                  type="button"
                  onClick={() => onToggle(v)}
                  aria-pressed={isSelected}
                  data-value={v}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-brand-orange bg-brand-orange text-ink-900"
                      : "border-ink-500 text-text-secondary hover:border-text-muted",
                  )}
                >
                  {render(v)}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
    );
  }

  function Section({
    id,
    title,
    children,
  }: {
    id: string;
    title: string;
    children: ReactNode;
  }) {
    const isOpen = open[id] === true;
    return (
      <section className="rounded-md border border-ink-600">
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
          data-testid={`sdv2-section-${id}`}
        >
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          <span aria-hidden className="text-text-muted">
            {isOpen ? "−" : "+"}
          </span>
        </button>
        {isOpen && <div className="flex flex-col gap-4 border-t border-ink-600 p-4">{children}</div>}
      </section>
    );
  }

  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  // ── Requirement tier picker (Wagon 4) — a compact two-state chip pair for
  //    a STATED requirement: "Būtina" (mandatory, engine blocks on a miss) /
  //    "Pageidautina" (preferred, a miss stays a discussion point). Clicking
  //    the active chip clears it back to the engine default — nothing is
  //    ever silently pre-picked. ───────────────────────────────────────────
  function setPriority(key: RequirementPriorityKey, value: "" | RequirementTier) {
    onChange({
      requirementPriorities: { ...state.requirementPriorities, [key]: value },
    });
  }

  function TierPicker({
    label,
    priorityKey,
  }: {
    label: string;
    priorityKey: RequirementPriorityKey;
  }) {
    const value = state.requirementPriorities[priorityKey];
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-2.5 py-1.5"
        data-testid={`sdv2-tier-${priorityKey}`}
        title={t("requirementTier.hint")}
      >
        <span className="text-xs text-text-secondary">{label}</span>
        {(["mandatory", "preferred"] as const).map((tier) => {
          const active = value === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setPriority(priorityKey, active ? "" : tier)}
              aria-pressed={active}
              data-tier={tier}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
                active
                  ? tier === "mandatory"
                    ? "border-brand-orange bg-brand-orange text-ink-900"
                    : "border-brand-blue bg-brand-blue/15 text-brand-blue"
                  : "border-ink-500 text-text-secondary hover:border-text-muted",
              )}
            >
              {t(`requirementTier.${tier}`)}
            </button>
          );
        })}
      </div>
    );
  }

  const langLabel = (code: string) => LANGUAGE_NATIVE_NAMES[code] ?? code.toUpperCase();

  // ── Deduction rows ─────────────────────────────────────────────────────────

  function setDeduction(i: number, patch: Partial<DeductionRow>) {
    const next = state.deductions.map((d, idx) => (idx === i ? { ...d, ...patch } : d));
    onChange({ deductions: next });
  }

  function setLanguage(i: number, patch: Partial<LanguageRow>) {
    const next = state.languages.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    onChange({ languages: next });
  }

  const periodOptions = [
    { value: "day", label: t("period.day") },
    { value: "week", label: t("period.week") },
    { value: "month", label: t("period.month") },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="demand-advanced-sections">
      <div>
        <p className="text-sm font-semibold text-text-primary">{t("advancedTitle")}</p>
        <p className="text-xs text-text-muted">{t("advancedHint")}</p>
      </div>

      {/* ── Engagement & scope ─────────────────────────────────────────────── */}
      <Section id="engagement" title={t("sections.engagement")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("opportunityTypeLabel")}
            value={state.opportunityType}
            onValue={(v) => onChange({ opportunityType: v })}
            options={enumOptions("opportunityType", OPPORTUNITY_TYPES)}
            testId="sdv2-opportunity-type"
          />
          <Select
            label={t("targetSupplyLabel")}
            value={state.targetSupply}
            onValue={(v) => onChange({ targetSupply: v })}
            options={enumOptions("targetSupply", TARGET_SUPPLIES)}
            testId="sdv2-target-supply"
          />
          <Select
            label={t("engagementFormLabel")}
            value={state.engagementForm}
            onValue={(v) => onChange({ engagementForm: v })}
            options={enumOptions("engagementForm", ENGAGEMENT_FORMS)}
            testId="sdv2-engagement-form"
          />
          <Select
            label={t("contractCountryLabel")}
            value={state.contractCountry}
            onValue={(v) => onChange({ contractCountry: v })}
            options={MARKET_COUNTRIES.map((c) => ({ value: c, label: c }))}
            testId="sdv2-contract-country"
          />
        </div>
      </Section>

      {/* ── Time & schedule ────────────────────────────────────────────────── */}
      <Section id="time" title={t("sections.time")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            label={t("startEarliestLabel")}
            value={state.startEarliest}
            onValue={(v) => onChange({ startEarliest: v })}
            testId="sdv2-start-earliest"
          />
          <DateField
            label={t("startLatestLabel")}
            value={state.startLatest}
            onValue={(v) => onChange({ startLatest: v })}
          />
          <DateField
            label={t("endDateLabel")}
            value={state.endDate}
            onValue={(v) => onChange({ endDate: v })}
          />
          <DateField
            label={t("applicationDeadlineLabel")}
            value={state.applicationDeadline}
            onValue={(v) => onChange({ applicationDeadline: v })}
          />
          <NumberField
            label={t("hoursPerWeekLabel")}
            value={state.hoursPerWeek}
            onValue={(v) => onChange({ hoursPerWeek: v })}
            max={80}
            testId="sdv2-hours-per-week"
          />
          <NumberField
            label={t("minGuaranteedHoursLabel")}
            value={state.minGuaranteedHours}
            onValue={(v) => onChange({ minGuaranteedHours: v })}
            max={80}
            testId="sdv2-min-guaranteed-hours"
          />
        </div>
        <Chips
          label={t("shiftsLabel")}
          values={SHIFT_KINDS}
          selected={state.shifts}
          onToggle={(v) => onChange({ shifts: toggleIn(state.shifts, v) })}
          render={(v) => t(`shift.${v}`)}
          testId="sdv2-shifts"
        />
        {state.shifts.includes("night") && (
          <TierPicker label={t("shift.night")} priorityKey="night_shifts" />
        )}
        {state.shifts.includes("weekend") && (
          <TierPicker label={t("shift.weekend")} priorityKey="weekend_shifts" />
        )}
        <CheckRow
          label={t("overtimeExpectedLabel")}
          checked={state.overtimeExpected}
          onChecked={(v) => onChange({ overtimeExpected: v })}
        />
      </Section>

      {/* ── Compensation ───────────────────────────────────────────────────── */}
      <Section id="compensation" title={t("sections.compensation")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label={t("compMinLabel")}
            value={state.compMin}
            onValue={(v) => onChange({ compMin: v })}
            step="0.01"
            testId="sdv2-comp-min"
          />
          <NumberField
            label={t("compMaxLabel")}
            value={state.compMax}
            onValue={(v) => onChange({ compMax: v })}
            step="0.01"
            testId="sdv2-comp-max"
          />
          <Select
            label={t("currencyLabel")}
            value={state.currency}
            onValue={(v) => onChange({ currency: v })}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
          />
          <Select
            label={t("payUnitLabel")}
            value={state.unit}
            onValue={(v) => onChange({ unit: v })}
            options={enumOptions("payUnit", PAY_UNITS)}
            testId="sdv2-pay-unit"
          />
          <Select
            label={t("payBasisLabel")}
            value={state.basis}
            onValue={(v) => onChange({ basis: v })}
            options={enumOptions("payBasis", PAY_BASES)}
            testId="sdv2-pay-basis"
          />
          <Select
            label={t("paymentFrequencyLabel")}
            value={state.paymentFrequency}
            onValue={(v) => onChange({ paymentFrequency: v })}
            options={enumOptions("paymentFrequency", PAYMENT_FREQUENCIES)}
          />
          <NumberField
            label={t("guaranteedBaseLabel")}
            value={state.guaranteedBase}
            onValue={(v) => onChange({ guaranteedBase: v })}
            step="0.01"
          />
          <NumberField
            label={t("perDiemLabel")}
            value={state.perDiem}
            onValue={(v) => onChange({ perDiem: v })}
            step="0.01"
          />
        </div>

        {/* Deductions — each row is an explicit, itemized fact. */}
        <div className="flex flex-col gap-2">
          <Label>{t("deductionsLabel")}</Label>
          <p className="text-xs text-text-muted">{t("deductionsHelp")}</p>
          {state.deductions.map((d, i) => (
            <div
              key={i}
              className="grid grid-cols-1 items-end gap-2 rounded-md border border-ink-600 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
              data-testid={`sdv2-deduction-${i}`}
            >
              <Select
                label={t("deductionKindLabel")}
                value={d.kind}
                onValue={(v) => setDeduction(i, { kind: v as DeductionRow["kind"] })}
                options={enumOptions("deductionKind", DEDUCTION_KINDS)}
              />
              <NumberField
                label={t("deductionAmountLabel")}
                value={d.amount}
                onValue={(v) => setDeduction(i, { amount: v })}
                step="0.01"
              />
              <Select
                label={t("deductionPeriodLabel")}
                value={d.period}
                onValue={(v) => setDeduction(i, { period: v as DeductionRow["period"] })}
                options={[...periodOptions, { value: "once", label: t("period.once") }]}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onChange({ deductions: state.deductions.filter((_, idx) => idx !== i) })
                }
              >
                {t("removeLabel")}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={state.deductions.length >= 10 || state.noDeductions}
              onClick={() =>
                onChange({
                  deductions: [
                    ...state.deductions,
                    { kind: "accommodation", amount: "", period: "" },
                  ],
                })
              }
              data-testid="sdv2-add-deduction"
            >
              + {t("addDeductionLabel")}
            </Button>
            <CheckRow
              label={t("noDeductionsLabel")}
              checked={state.noDeductions}
              onChecked={(v) =>
                onChange({ noDeductions: v, ...(v ? { deductions: [] } : {}) })
              }
              testId="sdv2-no-deductions"
            />
          </div>
        </div>
      </Section>

      {/* ── Accommodation ──────────────────────────────────────────────────── */}
      <Section id="accommodation" title={t("sections.accommodation")}>
        <Select
          label={t("accommodationStateLabel")}
          value={state.accommodationState}
          onValue={(v) => onChange({ accommodationState: v })}
          options={enumOptions("accommodationState", ACCOMMODATION_STATES)}
          testId="sdv2-accommodation-state"
        />
        {state.accommodationState === "not_offered" && (
          <TierPicker
            label={t("requirementTier.accommodationSelf")}
            priorityKey="accommodation"
          />
        )}
        {state.accommodationState === "offered" && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label={t("accommodationPayerLabel")}
                value={state.accommodationPayer}
                onValue={(v) => onChange({ accommodationPayer: v })}
                options={enumOptions("accommodationPayer", ACCOMMODATION_PAYERS)}
              />
              <Select
                label={t("roomLabel")}
                value={state.room}
                onValue={(v) => onChange({ room: v })}
                options={enumOptions("room", ROOM_TYPES)}
              />
              <NumberField
                label={t("accommodationPriceLabel")}
                value={state.accommodationPrice}
                onValue={(v) => onChange({ accommodationPrice: v })}
                step="0.01"
                testId="sdv2-accommodation-price"
              />
              <Select
                label={t("accommodationPricePeriodLabel")}
                value={state.accommodationPricePeriod}
                onValue={(v) => onChange({ accommodationPricePeriod: v })}
                options={periodOptions}
              />
              <NumberField
                label={t("occupancyLabel")}
                value={state.occupancy}
                onValue={(v) => onChange({ occupancy: v })}
                max={12}
              />
              <NumberField
                label={t("distanceKmLabel")}
                value={state.distanceKm}
                onValue={(v) => onChange({ distanceKm: v })}
                max={500}
              />
              <NumberField
                label={t("depositLabel")}
                value={state.deposit}
                onValue={(v) => onChange({ deposit: v })}
                step="0.01"
              />
            </div>
            <Chips
              label={t("amenitiesLabel")}
              values={ACCOMMODATION_AMENITIES}
              selected={state.amenities}
              onToggle={(v) => onChange({ amenities: toggleIn(state.amenities, v) })}
              render={(v) => t(`amenity.${v}`)}
            />
            <CheckRow
              label={t("familyPossibleLabel")}
              checked={state.familyPossible}
              onChecked={(v) => onChange({ familyPossible: v })}
            />
          </>
        )}
      </Section>

      {/* ── Transport ──────────────────────────────────────────────────────── */}
      <Section id="transport" title={t("sections.transport")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("internationalTravelLabel")}
            value={state.internationalTravel}
            onValue={(v) => onChange({ internationalTravel: v })}
            options={enumOptions("transportLevel", TRANSPORT_LEVELS)}
            testId="sdv2-international-travel"
          />
          <Select
            label={t("dailyTransportLabel")}
            value={state.dailyTransport}
            onValue={(v) => onChange({ dailyTransport: v })}
            options={enumOptions("transportLevel", TRANSPORT_LEVELS)}
          />
          <Select
            label={t("betweenSitesLabel")}
            value={state.betweenSites}
            onValue={(v) => onChange({ betweenSites: v })}
            options={enumOptions("transportLevel", TRANSPORT_LEVELS)}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CheckRow
            label={t("arrivalPickupLabel")}
            checked={state.arrivalPickup}
            onChecked={(v) => onChange({ arrivalPickup: v })}
          />
          <CheckRow
            label={t("companyVehicleLabel")}
            checked={state.companyVehicle}
            onChecked={(v) => onChange({ companyVehicle: v })}
          />
          <CheckRow
            label={t("fuelCardLabel")}
            checked={state.fuelCard}
            onChecked={(v) => onChange({ fuelCard: v })}
          />
          <CheckRow
            label={t("ownVehicleRequiredLabel")}
            checked={state.ownVehicleRequired}
            onChecked={(v) => onChange({ ownVehicleRequired: v })}
            testId="sdv2-own-vehicle-required"
          />
          <CheckRow
            label={t("returnTravelLabel")}
            checked={state.returnTravel}
            onChecked={(v) => onChange({ returnTravel: v })}
          />
        </div>
        {state.ownVehicleRequired && (
          <TierPicker label={t("ownVehicleLabel")} priorityKey="own_vehicle" />
        )}
        <Chips
          label={t("licenceCategoriesLabel")}
          values={LICENCE_CATEGORIES}
          selected={state.licenceCategories}
          onToggle={(v) =>
            onChange({ licenceCategories: toggleIn(state.licenceCategories, v) })
          }
          render={(v) => v}
          testId="sdv2-licence-categories"
        />
        {state.licenceCategories.length > 0 && (
          <TierPicker
            label={t("licenceCategoriesLabel")}
            priorityKey="licence_categories"
          />
        )}
      </Section>

      {/* ── Candidate requirements ─────────────────────────────────────────── */}
      <Section id="requirements" title={t("sections.requirements")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label={t("minExperienceYearsLabel")}
            value={state.minExperienceYears}
            onValue={(v) => onChange({ minExperienceYears: v })}
            max={50}
            testId="sdv2-min-experience"
          />
        </div>
        {state.minExperienceYears.trim().length > 0 && (
          <TierPicker
            label={t("minExperienceYearsLabel")}
            priorityKey="min_experience"
          />
        )}

        {/* Languages — closed lang + CEFR level rows. */}
        <div className="flex flex-col gap-2">
          <Label>{t("languagesLabel")}</Label>
          {state.languages.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-1 items-end gap-2 rounded-md border border-ink-600 p-3 sm:grid-cols-[1fr_1fr_auto]"
              data-testid={`sdv2-language-${i}`}
            >
              <Select
                label={t("languageLabel")}
                value={l.lang}
                onValue={(v) => setLanguage(i, { lang: v })}
                options={REQUIREMENT_LANGUAGES.map((code) => ({
                  value: code,
                  label: langLabel(code),
                }))}
              />
              <Select
                label={t("languageLevelLabel")}
                value={l.level}
                onValue={(v) => setLanguage(i, { level: v })}
                options={LANGUAGE_LEVELS.map((lv) => ({ value: lv, label: lv }))}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onChange({ languages: state.languages.filter((_, idx) => idx !== i) })
                }
              >
                {t("removeLabel")}
              </Button>
              <div className="sm:col-span-3">
                <CheckRow
                  label={t("onePerTeamLabel")}
                  checked={l.onePerTeam}
                  onChecked={(v) => setLanguage(i, { onePerTeam: v })}
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={state.languages.length >= 5}
            onClick={() =>
              onChange({
                languages: [...state.languages, { lang: "en", level: "B1", onePerTeam: false }],
              })
            }
            data-testid="sdv2-add-language"
          >
            + {t("addLanguageLabel")}
          </Button>
          {state.languages.length >= 2 && (
            <TierPicker
              label={t("requirementTier.secondaryLanguages")}
              priorityKey="secondary_languages"
            />
          )}
        </div>

        {/* Certificates — bounded owner-side text; never worker-exposed as
            free text (worker exposure waits for a certificate taxonomy). */}
        <div className="flex flex-col gap-2">
          <Label>{t("certificatesLabel")}</Label>
          <p className="text-xs text-text-muted">{t("certificatesHelp")}</p>
          {state.certificates.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="text"
                value={c}
                maxLength={300}
                onChange={(e) =>
                  onChange({
                    certificates: state.certificates.map((x, idx) =>
                      idx === i ? e.target.value : x,
                    ),
                  })
                }
                data-testid={`sdv2-certificate-${i}`}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onChange({
                    certificates: state.certificates.filter((_, idx) => idx !== i),
                  })
                }
              >
                {t("removeLabel")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={state.certificates.length >= 10}
            onClick={() => onChange({ certificates: [...state.certificates, ""] })}
            data-testid="sdv2-add-certificate"
          >
            + {t("addCertificateLabel")}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CheckRow
            label={t("ownToolsLabel")}
            checked={state.ownTools}
            onChecked={(v) => onChange({ ownTools: v })}
          />
          <CheckRow
            label={t("ownVehicleLabel")}
            checked={state.ownVehicle}
            onChecked={(v) => onChange({ ownVehicle: v })}
          />
          <CheckRow
            label={t("ownWorkwearLabel")}
            checked={state.ownWorkwear}
            onChecked={(v) => onChange({ ownWorkwear: v })}
          />
          <CheckRow
            label={t("drawingsReadingLabel")}
            checked={state.drawingsReading}
            onChecked={(v) => onChange({ drawingsReading: v })}
          />
          <CheckRow
            label={t("independentWorkLabel")}
            checked={state.independentWork}
            onChecked={(v) => onChange({ independentWork: v })}
          />
          <CheckRow
            label={t("leadershipLabel")}
            checked={state.leadership}
            onChecked={(v) => onChange({ leadership: v })}
          />
        </div>
        {state.ownTools && (
          <TierPicker label={t("ownToolsLabel")} priorityKey="own_tools" />
        )}
        {state.ownVehicle && !state.ownVehicleRequired && (
          <TierPicker label={t("ownVehicleLabel")} priorityKey="own_vehicle" />
        )}
      </Section>

      {/* ── Application process ────────────────────────────────────────────── */}
      <Section id="process" title={t("sections.process")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("applicationMethodLabel")}
            value={state.applicationMethod}
            onValue={(v) => onChange({ applicationMethod: v })}
            options={enumOptions("applicationMethod", APPLICATION_METHODS)}
          />
          <NumberField
            label={t("interviewStagesLabel")}
            value={state.interviewStages}
            onValue={(v) => onChange({ interviewStages: v })}
            max={5}
          />
          <NumberField
            label={t("responseDeadlineDaysLabel")}
            value={state.responseDeadlineDays}
            onValue={(v) => onChange({ responseDeadlineDays: v })}
            max={60}
          />
          <Select
            label={t("listingKindLabel")}
            value={state.listingKind}
            onValue={(v) => onChange({ listingKind: v })}
            options={enumOptions("listingKind", LISTING_KINDS)}
            testId="sdv2-listing-kind"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CheckRow
            label={t("practicalTestLabel")}
            checked={state.practicalTest}
            onChecked={(v) => onChange({ practicalTest: v })}
          />
          <CheckRow
            label={t("documentVerificationLabel")}
            checked={state.documentVerification}
            onChecked={(v) => onChange({ documentVerification: v })}
          />
        </div>
        {state.listingKind === "talent_pool" && (
          <p
            className="rounded-md border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-xs text-text-secondary"
            role="note"
            data-testid="sdv2-talent-pool-disclosure"
          >
            {t("talentPoolDisclosure")}
          </p>
        )}
      </Section>
    </div>
  );
}
