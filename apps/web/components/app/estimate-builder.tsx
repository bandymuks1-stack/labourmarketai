"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { EstimateSummary } from "@/components/app/estimate-summary";
import { EstimateClarifyAssist } from "@/components/app/estimate-clarify-assist";
import {
  computeEstimate,
  validateEstimateInputs,
  hasMeaningfulEstimate,
  estimateAssumptionKeys,
  estimateMissingInfoKeys,
  EMPTY_ESTIMATE_INPUTS,
  ESTIMATE_TEMPLATES,
  UNIT_TYPES,
  type EstimateInputs,
  type EstimateTemplate,
  type UnitType,
} from "@/lib/estimate/estimate";

/**
 * Optional preliminary Estimate Builder — a transparent, deterministic
 * calculator embedded in the demand-flow Criteria step. Controlled by the
 * parent form (so the inputs ride the request payload on submit). Clearly
 * separates the user's ENTERED numbers from the CALCULATED result, blocks
 * negatives / impossible values with localized inline errors, and never claims a
 * binding quote. Template-based (construction first) but sector-neutral math.
 */
export function EstimateBuilder({
  inputs,
  onChange,
}: {
  inputs: EstimateInputs;
  onChange: (next: EstimateInputs) => void;
}) {
  const t = useTranslations("auth.dashboard.wow.demand.estimate");
  const [open, setOpen] = useState(hasMeaningfulEstimate(inputs));

  const set = <K extends keyof EstimateInputs>(key: K, value: EstimateInputs[K]) =>
    onChange({ ...inputs, [key]: value });
  const setNum = (key: keyof EstimateInputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    set(key, (Number.isFinite(n) ? n : 0) as EstimateInputs[typeof key]);
  };

  const problems = validateEstimateInputs(inputs);
  const result = computeEstimate(inputs);
  const meaningful = hasMeaningfulEstimate(inputs);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="estimate-open"
        className="self-start rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
      >
        + {t("toggle")}{" "}
        <span className="text-text-muted">{t("optionalTag")}</span>
      </button>
    );
  }

  const num = (key: keyof EstimateInputs, labelKey: string, opts?: { max?: number; placeholder?: string }) => (
    <label className="flex flex-col gap-1">
      <Label>{t(labelKey)}</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        max={opts?.max}
        step="any"
        value={String(inputs[key] ?? 0)}
        placeholder={opts?.placeholder}
        onChange={setNum(key)}
        data-testid={`estimate-${String(key)}`}
      />
    </label>
  );

  return (
    <div
      className="flex flex-col gap-4 rounded-md border border-ink-600 bg-ink-800/40 p-4"
      data-testid="estimate-builder"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-text-primary">
          {t("preliminaryTitle")}
        </p>
        <button
          type="button"
          onClick={() => {
            onChange({ ...EMPTY_ESTIMATE_INPUTS });
            setOpen(false);
          }}
          data-testid="estimate-clear"
          className="font-mono text-meta uppercase tracking-label text-text-muted hover:text-text-secondary"
        >
          {t("clear")}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>

      {/* ── Entered numbers ───────────────────────────────────────────── */}
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("sectionEntered")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <Label>{t("f.template")}</Label>
          <DarkListbox
            value={inputs.template}
            onChange={(v) => set("template", v as EstimateTemplate)}
            options={ESTIMATE_TEMPLATES.map((tpl) => ({ value: tpl, label: t(`templates.${tpl}`) }))}
            ariaLabel={t("f.template")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Label>{t("f.unitType")}</Label>
          <DarkListbox
            value={inputs.unitType}
            onChange={(v) => set("unitType", v as UnitType)}
            options={UNIT_TYPES.map((u) => ({ value: u, label: t(`units.${u}`) }))}
            ariaLabel={t("f.unitType")}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <Label>{t("f.workType")}</Label>
          <Input
            type="text"
            maxLength={120}
            value={inputs.workType}
            placeholder={t("f.workTypePlaceholder")}
            onChange={(e) => set("workType", e.target.value)}
            data-testid="estimate-workType"
          />
        </label>
        {num("quantity", "f.quantity")}
        {num("workerCount", "f.workerCount")}
        {num("hoursPerWorker", "f.hoursPerWorker")}
        {num("totalHours", "f.totalHours")}
        {num("rate", "f.rate", { placeholder: t("f.ratePlaceholder") })}
        <label className="flex flex-col gap-1">
          <Label>{t("f.currency")}</Label>
          <Input
            type="text"
            maxLength={6}
            value={inputs.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            data-testid="estimate-currency"
          />
        </label>
        {num("materials", "f.materials")}
        {num("equipment", "f.equipment")}
        {num("transportAccommodation", "f.transport")}
        {num("overheadPercent", "f.overhead", { max: 100 })}
        {num("marginPercent", "f.margin", { max: 100 })}
        {num("contingencyPercent", "f.contingency", { max: 100 })}
      </div>

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="estimate-errors" role="alert">
          {problems.map((p) => (
            <li key={p} className="text-xs text-state-danger">
              {t(`errors.${p}`)}
            </li>
          ))}
        </ul>
      )}

      {/* ── Calculated result ─────────────────────────────────────────── */}
      {meaningful && problems.length === 0 && (
        <EstimateSummary
          result={result}
          assumptions={estimateAssumptionKeys(inputs)}
          missingInfo={estimateMissingInfoKeys(inputs)}
        />
      )}

      {/* Estimate-clarify assist insertion point (Step 1/6). INERT by default —
          renders nothing while the AI flags are off. Never produces numbers. */}
      <EstimateClarifyAssist
        missingInfoKeys={estimateMissingInfoKeys(inputs)}
        workContext={inputs.workType}
      />
    </div>
  );
}
