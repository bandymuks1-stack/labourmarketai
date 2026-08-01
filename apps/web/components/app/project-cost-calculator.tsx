"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import {
  EstimateSummaryView,
  type EstimateSummaryViewLabels,
} from "@/components/app/estimate-summary-view";
import {
  EMPTY_ESTIMATE_INPUTS,
  ESTIMATE_TEMPLATES,
  UNIT_TYPES,
  computeEstimate,
  estimateAssumptionKeys,
  estimateMissingInfoKeys,
  hasMeaningfulEstimate,
  validateEstimateInputs,
  type EstimateInputs,
  type EstimateTemplate,
  type UnitType,
} from "@/lib/estimate/estimate";
import {
  EMPTY_AREA_QUANTITY_INPUTS,
  applyAreaQuantityToEstimate,
  computeAreaQuantity,
  validateAreaQuantityInputs,
  type AreaQuantityInputs,
} from "@/lib/estimate/packs/area-quantity-v1";
import {
  computeVatDisplay,
  parseVatPercentInput,
} from "@/lib/estimate/vat-display-v1";
import { buildCalculatorCsv } from "@/lib/estimate/calculator-csv-v1";

/**
 * Public "Darbų ir projekto skaičiuoklė" / project-cost calculator — a
 * stateless, account-free wizard over the EXISTING deterministic estimate
 * engine (lib/estimate/estimate.ts). This component computes NOTHING itself:
 * every number comes from computeEstimate / computeAreaQuantity /
 * computeVatDisplay on the user's own inputs. No persistence, no network —
 * the state lives only in this browser tab.
 *
 * All copy arrives as already-localized labels from the server page (the
 * marketing route group ships a minimal client-message pick, and the
 * client-messages allowlist guard forbids non-literal useTranslations here),
 * following the CompanyNeedForm labels-as-props precedent.
 */

export interface ProjectCostCalculatorLabels {
  readonly steps: {
    readonly context: string;
    readonly quantities: string;
    readonly rates: string;
    readonly result: string;
    readonly back: string;
    readonly next: string;
    readonly startOver: string;
  };
  readonly fields: {
    readonly template: string;
    readonly unitType: string;
    readonly workType: string;
    readonly workTypePlaceholder: string;
    readonly quantity: string;
    readonly workerCount: string;
    readonly hoursPerWorker: string;
    readonly totalHours: string;
    readonly totalHoursHelp: string;
    readonly rate: string;
    readonly ratePlaceholder: string;
    readonly currency: string;
    readonly country: string;
    readonly countryNone: string;
    readonly materials: string;
    readonly equipment: string;
    readonly transport: string;
    readonly overhead: string;
    readonly margin: string;
    readonly contingency: string;
  };
  readonly templates: Readonly<Record<string, string>>;
  readonly units: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly summary: EstimateSummaryViewLabels;
  readonly assumptionLabels: Readonly<Record<string, string>>;
  readonly missingLabels: Readonly<Record<string, string>>;
  readonly vat: {
    readonly label: string;
    readonly help: string;
    readonly invalid: string;
    readonly net: string;
    readonly amount: string;
    readonly gross: string;
  };
  readonly accommodation: {
    readonly title: string;
    readonly note: string;
    readonly workers: string;
    readonly days: string;
    readonly perWorkerDay: string;
    readonly computed: string;
    readonly apply: string;
  };
  readonly pack: {
    readonly toggle: string;
    readonly note: string;
    readonly netArea: string;
    readonly dimensionsHint: string;
    readonly lengthM: string;
    readonly heightM: string;
    readonly openings: string;
    readonly layers: string;
    readonly thickness: string;
    readonly waste: string;
    readonly coverage: string;
    readonly price: string;
    readonly labourPerM2: string;
    readonly crewSize: string;
    readonly outNet: string;
    readonly outCoverage: string;
    readonly outWithWaste: string;
    readonly outPackages: string;
    readonly outMaterialCost: string;
    readonly outLabourHours: string;
    readonly outDuration: string;
    readonly outVolume: string;
    readonly apply: string;
    readonly applied: string;
    readonly errors: Readonly<Record<string, string>>;
  };
  readonly result: {
    readonly incompleteTitle: string;
    readonly incompleteBody: string;
    readonly emptyTitle: string;
    readonly emptyBody: string;
    readonly csv: string;
    readonly print: string;
    readonly ctaTitle: string;
    readonly ctaBody: string;
    readonly ctaDashboard: string;
    readonly ctaDashboardHelp: string;
    readonly ctaCompanyNeed: string;
    readonly ctaCompanyNeedHelp: string;
  };
  /** CSV label map: stable column id → localized label. */
  readonly csvLabels: Readonly<Record<string, string>>;
}

const FIELD =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";
const LABEL = "flex flex-col gap-1 text-xs";
const STEPS = ["context", "quantities", "rates", "result"] as const;
type StepKey = (typeof STEPS)[number];

export function ProjectCostCalculator({
  labels,
  locale,
  countryOptions,
}: {
  readonly labels: ProjectCostCalculatorLabels;
  readonly locale: string;
  /** Market countries (code + localized name) from the shared taxonomy. */
  readonly countryOptions: ReadonlyArray<{ code: string; label: string }>;
}) {
  const [step, setStep] = useState<StepKey>("context");
  const [inputs, setInputs] = useState<EstimateInputs>({ ...EMPTY_ESTIMATE_INPUTS });
  const [vatRaw, setVatRaw] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [pack, setPack] = useState<AreaQuantityInputs>({ ...EMPTY_AREA_QUANTITY_INPUTS });
  const [packApplied, setPackApplied] = useState(false);
  const [acc, setAcc] = useState({ workers: 0, days: 0, perWorkerDay: 0 });

  const set = <K extends keyof EstimateInputs>(key: K, value: EstimateInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };
  const setNum =
    (key: keyof EstimateInputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      set(key, (Number.isFinite(n) ? n : 0) as EstimateInputs[typeof key]);
    };
  const setPackNum =
    (key: keyof AreaQuantityInputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      setPack((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
      setPackApplied(false);
    };

  const problems = validateEstimateInputs(inputs);
  const result = computeEstimate(inputs);
  const meaningful = hasMeaningfulEstimate(inputs);
  const missing = estimateMissingInfoKeys(inputs);
  const labourMissing = missing.includes("rate") || missing.includes("hours");

  const vatPercent = parseVatPercentInput(vatRaw);
  const vat = computeVatDisplay(result.estimatedTotal, vatPercent);
  const vatInvalid = vatRaw.trim() !== "" && vat === null;

  const packResult = computeAreaQuantity(pack);
  const packProblems = validateAreaQuantityInputs(pack);

  const accTotal =
    Math.max(0, acc.workers) * Math.max(0, acc.days) * Math.max(0, acc.perWorkerDay);

  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (n: number) => `${nf.format(n)} ${result.currency}`;

  const stepIndex = STEPS.indexOf(step);

  function downloadCsv() {
    const csv = buildCalculatorCsv({
      inputs,
      result,
      vat,
      pack: packApplied ? packResult : null,
      generatedAtIso: new Date().toISOString(),
      missingInfo: missing,
      labels: labels.csvLabels,
      disclaimer: labels.summary.disclaimer,
    });
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-cost-estimate.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const num = (
    key: keyof EstimateInputs,
    label: string,
    opts?: { max?: number; placeholder?: string; help?: string },
  ) => (
    <label className={LABEL}>
      <span className="text-text-secondary">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={opts?.max}
        step="any"
        value={String(inputs[key] ?? 0)}
        placeholder={opts?.placeholder}
        onChange={setNum(key)}
        className={FIELD}
        data-testid={`pcc-${String(key)}`}
      />
      {opts?.help ? <span className="text-meta text-text-muted">{opts.help}</span> : null}
    </label>
  );

  const packNum = (key: keyof AreaQuantityInputs, label: string) => (
    <label className={LABEL}>
      <span className="text-text-secondary">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={String(pack[key] ?? 0)}
        onChange={setPackNum(key)}
        className={FIELD}
        data-testid={`pcc-pack-${String(key)}`}
      />
    </label>
  );

  const stepLabels: Record<StepKey, string> = {
    context: labels.steps.context,
    quantities: labels.steps.quantities,
    rates: labels.steps.rates,
    result: labels.steps.result,
  };

  return (
    <div className="flex flex-col gap-6" data-testid="project-cost-calculator">
      {/* ── Step header (progressive disclosure) ───────────────────────── */}
      <ol className="flex flex-wrap gap-2 print:hidden" aria-label={labels.steps.context}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i <= stepIndex && setStep(s)}
              aria-current={s === step ? "step" : undefined}
              disabled={i > stepIndex}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                s === step
                  ? "border-brand-blue bg-brand-blue/15 text-brand-blue"
                  : i < stepIndex
                    ? "border-border-default text-text-secondary hover:border-brand-blue/50"
                    : "border-border-default text-text-muted opacity-60"
              }`}
              data-testid={`pcc-step-${s}`}
            >
              {i + 1}. {stepLabels[s]}
            </button>
          </li>
        ))}
      </ol>

      {/* ── Step 1: context ────────────────────────────────────────────── */}
      {step === "context" && (
        <section className="flex flex-col gap-4" aria-label={labels.steps.context}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.fields.template}</span>
              <select
                value={inputs.template}
                onChange={(e) => set("template", e.target.value as EstimateTemplate)}
                className={FIELD}
                data-testid="pcc-template"
              >
                {ESTIMATE_TEMPLATES.map((tpl) => (
                  <option key={tpl} value={tpl}>
                    {labels.templates[tpl] ?? tpl}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.fields.country}</span>
              <select
                value={inputs.country}
                onChange={(e) => set("country", e.target.value)}
                className={FIELD}
                data-testid="pcc-country"
              >
                <option value="">{labels.fields.countryNone}</option>
                {countryOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={LABEL}>
            <span className="text-text-secondary">{labels.fields.workType}</span>
            <input
              type="text"
              maxLength={120}
              value={inputs.workType}
              placeholder={labels.fields.workTypePlaceholder}
              onChange={(e) => set("workType", e.target.value)}
              className={FIELD}
              data-testid="pcc-workType"
            />
          </label>
          <label className={`${LABEL} sm:max-w-[12rem]`}>
            <span className="text-text-secondary">{labels.fields.currency}</span>
            <input
              type="text"
              maxLength={6}
              value={inputs.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              className={FIELD}
              data-testid="pcc-currency"
            />
          </label>
        </section>
      )}

      {/* ── Step 2: quantities ─────────────────────────────────────────── */}
      {step === "quantities" && (
        <section className="flex flex-col gap-4" aria-label={labels.steps.quantities}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.fields.unitType}</span>
              <select
                value={inputs.unitType}
                onChange={(e) => set("unitType", e.target.value as UnitType)}
                className={FIELD}
                data-testid="pcc-unitType"
              >
                {UNIT_TYPES.map((u) => (
                  <option key={u} value={u}>
                    {labels.units[u] ?? u}
                  </option>
                ))}
              </select>
            </label>
            {num("quantity", labels.fields.quantity)}
            {num("workerCount", labels.fields.workerCount)}
            {num("hoursPerWorker", labels.fields.hoursPerWorker)}
            {num("totalHours", labels.fields.totalHours, {
              help: labels.fields.totalHoursHelp,
            })}
          </div>

          {/* Area quantity pack (insulation / area-based) — optional helper. */}
          <div className="rounded-md border border-ink-600 bg-ink-800/40 p-4">
            <button
              type="button"
              onClick={() => setPackOpen((o) => !o)}
              aria-expanded={packOpen}
              className="text-left text-sm font-semibold text-brand-blue"
              data-testid="pcc-pack-toggle"
            >
              {packOpen ? "− " : "+ "}
              {labels.pack.toggle}
            </button>
            {packOpen && (
              <div className="mt-4 flex flex-col gap-4">
                <p className="text-xs leading-relaxed text-text-secondary">
                  {labels.pack.note}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {packNum("netAreaM2", labels.pack.netArea)}
                  <p className="self-end text-meta text-text-muted">
                    {labels.pack.dimensionsHint}
                  </p>
                  {packNum("lengthM", labels.pack.lengthM)}
                  {packNum("heightM", labels.pack.heightM)}
                  {packNum("openingsAreaM2", labels.pack.openings)}
                  {packNum("layers", labels.pack.layers)}
                  {packNum("layerThicknessMm", labels.pack.thickness)}
                  {packNum("wastePercent", labels.pack.waste)}
                  {packNum("coveragePerPackageM2", labels.pack.coverage)}
                  {packNum("pricePerPackage", labels.pack.price)}
                  {packNum("labourHoursPerM2", labels.pack.labourPerM2)}
                  {packNum("crewSize", labels.pack.crewSize)}
                </div>
                {packProblems.length > 0 ? (
                  <ul className="flex flex-col gap-1" role="alert">
                    {packProblems.map((p) => (
                      <li key={p} className="text-xs text-state-danger">
                        {labels.pack.errors[p] ?? p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl
                    className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs"
                    data-testid="pcc-pack-result"
                  >
                    {(
                      [
                        [labels.pack.outNet, `${nf.format(packResult.netAreaM2)} m²`],
                        [labels.pack.outCoverage, `${nf.format(packResult.coverageAreaM2)} m²`],
                        [labels.pack.outWithWaste, `${nf.format(packResult.coverageWithWasteM2)} m²`],
                        [labels.pack.outPackages, String(packResult.packageCount)],
                        [labels.pack.outVolume, `${nf.format(packResult.insulationVolumeM3)} m³`],
                        [labels.pack.outMaterialCost, money(packResult.materialCost)],
                        [labels.pack.outLabourHours, nf.format(packResult.labourHours)],
                        [labels.pack.outDuration, nf.format(packResult.crewDurationHours)],
                      ] as Array<[string, string]>
                    ).map(([l, v]) => (
                      <div key={l} className="contents">
                        <dt className="text-text-secondary">{l}</dt>
                        <dd className="text-right font-mono text-text-primary">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={packProblems.length > 0}
                    onClick={() => {
                      setInputs((prev) => applyAreaQuantityToEstimate(prev, packResult));
                      setPackApplied(true);
                    }}
                    className="self-start rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
                    data-testid="pcc-pack-apply"
                  >
                    {labels.pack.apply}
                  </button>
                  {packApplied && (
                    <span className="text-xs text-state-success" data-testid="pcc-pack-applied">
                      {labels.pack.applied}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Step 3: rates & extra costs ────────────────────────────────── */}
      {step === "rates" && (
        <section className="flex flex-col gap-4" aria-label={labels.steps.rates}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {num("rate", labels.fields.rate, { placeholder: labels.fields.ratePlaceholder })}
            {num("materials", labels.fields.materials)}
            {num("equipment", labels.fields.equipment)}
            {num("transportAccommodation", labels.fields.transport)}
            {num("overheadPercent", labels.fields.overhead, { max: 100 })}
            {num("marginPercent", labels.fields.margin, { max: 100 })}
            {num("contingencyPercent", labels.fields.contingency, { max: 100 })}
            <label className={LABEL}>
              <span className="text-text-secondary">{labels.vat.label}</span>
              <input
                type="text"
                inputMode="decimal"
                maxLength={6}
                value={vatRaw}
                onChange={(e) => setVatRaw(e.target.value)}
                className={FIELD}
                data-testid="pcc-vat"
              />
              <span className="text-meta text-text-muted">{labels.vat.help}</span>
              {vatInvalid && (
                <span className="text-meta text-state-danger" role="alert">
                  {labels.vat.invalid}
                </span>
              )}
            </label>
          </div>

          {/* Accommodation helper — user-entered numbers only; the product is
              written into the transport & accommodation field on request. */}
          <details className="rounded-md border border-ink-600 bg-ink-800/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-blue">
              {labels.accommodation.title}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-text-secondary">
                {labels.accommodation.note}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(
                  [
                    ["workers", labels.accommodation.workers],
                    ["days", labels.accommodation.days],
                    ["perWorkerDay", labels.accommodation.perWorkerDay],
                  ] as Array<[keyof typeof acc, string]>
                ).map(([k, l]) => (
                  <label key={k} className={LABEL}>
                    <span className="text-text-secondary">{l}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={String(acc[k])}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setAcc((prev) => ({ ...prev, [k]: Number.isFinite(n) ? n : 0 }));
                      }}
                      className={FIELD}
                      data-testid={`pcc-acc-${k}`}
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-text-secondary">
                  {labels.accommodation.computed}:{" "}
                  <span className="font-mono text-text-primary" data-testid="pcc-acc-total">
                    {money(Math.round((accTotal + Number.EPSILON) * 100) / 100)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={accTotal <= 0}
                  onClick={() =>
                    set(
                      "transportAccommodation",
                      Math.round((accTotal + Number.EPSILON) * 100) / 100,
                    )
                  }
                  className="rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
                  data-testid="pcc-acc-apply"
                >
                  {labels.accommodation.apply}
                </button>
              </div>
            </div>
          </details>

          {problems.length > 0 && (
            <ul className="flex flex-col gap-1" data-testid="pcc-errors" role="alert">
              {problems.map((p) => (
                <li key={p} className="text-xs text-state-danger">
                  {labels.errors[p] ?? p}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Step 4: result ─────────────────────────────────────────────── */}
      {step === "result" && (
        <section
          className="flex flex-col gap-4"
          aria-label={labels.steps.result}
          id="pcc-print-area"
        >
          {!meaningful ? (
            <div
              className="rounded-md border border-ink-600 bg-ink-800/40 p-5"
              data-testid="pcc-empty"
            >
              <p className="font-display text-sm font-semibold text-text-primary">
                {labels.result.emptyTitle}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {labels.result.emptyBody}
              </p>
            </div>
          ) : (
            <>
              {labourMissing && (
                <div
                  className="rounded-md border border-state-warning/40 bg-state-warning/5 p-4"
                  data-testid="pcc-incomplete"
                >
                  <p className="text-sm font-semibold text-state-warning">
                    {labels.result.incompleteTitle}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    {labels.result.incompleteBody}
                  </p>
                </div>
              )}
              <EstimateSummaryView
                result={result}
                assumptionItems={estimateAssumptionKeys(inputs).map(
                  (k) => labels.assumptionLabels[k] ?? k,
                )}
                missingItems={missing.map((k) => labels.missingLabels[k] ?? k)}
                labels={labels.summary}
                locale={locale}
              />
              {vat && (
                <dl
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-4 text-sm"
                  data-testid="pcc-vat-lines"
                >
                  <dt className="text-text-secondary">{labels.vat.net}</dt>
                  <dd className="text-right font-mono text-text-primary">
                    {money(vat.netTotal)}
                  </dd>
                  <dt className="text-text-secondary">
                    {labels.vat.amount} ({nf.format(vat.vatPercent)} %)
                  </dt>
                  <dd className="text-right font-mono text-text-primary">
                    {money(vat.vatAmount)}
                  </dd>
                  <dt className="border-t border-ink-600 pt-2 font-semibold text-text-primary">
                    {labels.vat.gross}
                  </dt>
                  <dd className="border-t border-ink-600 pt-2 text-right font-mono font-bold text-text-primary">
                    {money(vat.grossTotal)}
                  </dd>
                </dl>
              )}
              <div className="flex flex-wrap gap-3 print:hidden">
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-brand-blue"
                  data-testid="pcc-csv"
                >
                  {labels.result.csv}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-brand-blue"
                  data-testid="pcc-print"
                >
                  {labels.result.print}
                </button>
              </div>

              {/* Bridge into the real product — both routes exist today. */}
              <div
                className="flex flex-col gap-3 rounded-md border border-brand-blue/30 bg-brand-blue/5 p-5 print:hidden"
                data-testid="pcc-bridge"
              >
                <p className="font-display text-sm font-semibold text-text-primary">
                  {labels.result.ctaTitle}
                </p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {labels.result.ctaBody}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <AuthCtaLink
                    relPath={`/${locale}/dashboard/company#demand-intake`}
                    className="rounded-md bg-brand-blue px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-blue/80"
                  >
                    {labels.result.ctaDashboard}
                  </AuthCtaLink>
                  <Link
                    href={{
                      pathname: "/company-need",
                      query: {
                        // Bounded, non-PII, non-price prefill only (validated
                        // again by the company-need adapter).
                        ...(inputs.workerCount > 0
                          ? { number_of_workers: String(Math.trunc(inputs.workerCount)) }
                          : {}),
                        ...(inputs.country ? { country: inputs.country } : {}),
                      },
                    }}
                    className="rounded-md border border-border-default px-4 py-2 text-center text-sm font-semibold text-text-primary transition-colors hover:border-brand-blue"
                    data-testid="pcc-cta-company-need"
                  >
                    {labels.result.ctaCompanyNeed}
                  </Link>
                </div>
                <p className="text-meta leading-relaxed text-text-muted">
                  {labels.result.ctaDashboardHelp} {labels.result.ctaCompanyNeedHelp}
                </p>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Wizard navigation ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 print:hidden">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStep(STEPS[stepIndex - 1])}
            className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-blue"
            data-testid="pcc-back"
          >
            {labels.steps.back}
          </button>
        )}
        {stepIndex < STEPS.length - 1 && (
          <button
            type="button"
            onClick={() => setStep(STEPS[stepIndex + 1])}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80"
            data-testid="pcc-next"
          >
            {labels.steps.next}
          </button>
        )}
        {step === "result" && (
          <button
            type="button"
            onClick={() => {
              setInputs({ ...EMPTY_ESTIMATE_INPUTS });
              setVatRaw("");
              setPack({ ...EMPTY_AREA_QUANTITY_INPUTS });
              setPackApplied(false);
              setAcc({ workers: 0, days: 0, perWorkerDay: 0 });
              setStep("context");
            }}
            className="ml-auto font-mono text-meta uppercase tracking-label text-text-muted hover:text-text-secondary"
            data-testid="pcc-start-over"
          >
            {labels.steps.startOver}
          </button>
        )}
      </div>
    </div>
  );
}
