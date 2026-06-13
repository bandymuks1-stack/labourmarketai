"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  submitDemandRequestAction,
} from "@/lib/demand/demand-request-actions";
import type { DemandUrgency } from "@/lib/demand/demand-request";
import { EstimateBuilder } from "@/components/app/estimate-builder";
import { EstimateSummary } from "@/components/app/estimate-summary";
import {
  computeEstimate,
  validateEstimateInputs,
  hasMeaningfulEstimate,
  estimateAssumptionKeys,
  estimateMissingInfoKeys,
  EMPTY_ESTIMATE_INPUTS,
  type EstimateInputs,
} from "@/lib/estimate/estimate";

/**
 * Demand-request FORM → the CANONICAL demand intake (§17). A real 3-step input
 * flow (describe → criteria → review) that submits a structured
 * `customer_request` (status='submitted', kind by intent) through the
 * owner-scoped `submitDemandRequestAction`. It no longer creates an empty
 * placeholder request: the description is required and an empty need is blocked
 * client-side AND server-side. It never posts to `/api/leads` (that stays a
 * DISTINCT anonymous pre-auth funnel, §17.2). The server action resolves the
 * owner from the session — no client email is read or sent.
 *
 * The numbered steps are a REAL form wizard driven by real Back/Next buttons —
 * not fake-clickable cards. The progress dots are progress-only (current/done),
 * never standalone tap targets.
 */
export function DemandRequestButton({
  intent,
  stepTitles,
}: {
  intent: "hire_workers" | "partner";
  /** Localized titles for steps 1/2/3 (from auth.dashboard.wow.flow.company). */
  stepTitles: [string, string, string];
}) {
  const t = useTranslations("auth.dashboard.wow.demand");
  // Intent-specific copy: company hiring is NOT a generic buyer "need".
  const key = intent === "hire_workers" ? "hire" : "partner";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState("");
  const [urgency, setUrgency] = useState<DemandUrgency>("flexible");
  const [notes, setNotes] = useState("");
  const [estimate, setEstimate] = useState<EstimateInputs>(EMPTY_ESTIMATE_INPUTS);
  const [showDescError, setShowDescError] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  const descOk = description.trim().length > 0;
  // The estimate is OPTIONAL. It only blocks submit when the user actually
  // engaged it AND it is invalid (negatives / impossible %). An untouched
  // estimate never blocks and is never persisted.
  const estimateEngaged = hasMeaningfulEstimate(estimate);
  const estimateProblems = estimateEngaged
    ? validateEstimateInputs(estimate, true)
    : [];
  const estimateOk = estimateProblems.length === 0;

  function goNext() {
    // Step 1 gate: a request with no description is meaningless — block it and
    // surface a localized inline error instead of advancing.
    if (step === 1 && !descOk) {
      setShowDescError(true);
      return;
    }
    setShowDescError(false);
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  }
  function goBack() {
    setShowDescError(false);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  }

  async function create() {
    if (!descOk) {
      setStep(1);
      setShowDescError(true);
      return;
    }
    setState("sending");
    try {
      const res = await submitDemandRequestAction(intent, {
        role,
        description,
        location,
        skills,
        urgency,
        notes,
        estimate: estimateEngaged ? estimate : undefined,
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  const urgencyOptions: { value: DemandUrgency; label: string }[] = [
    { value: "flexible", label: t("form.urgencyFlexible") },
    { value: "this_week", label: t("form.urgencyThisWeek") },
    { value: "urgent", label: t("form.urgencyUrgent") },
  ];
  const urgencyLabel =
    urgencyOptions.find((o) => o.value === urgency)?.label ?? "";

  // The submitted-values summary — shown on the review step AND, after a
  // successful submit, as a read-back panel so the owner can see exactly what
  // they created. This is purely their own input echoed back (no fabricated
  // content, no matching / verification claims).
  const summaryList = (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-ink-600 bg-ink-800/40 p-4 text-sm"
      data-testid="demand-summary-list"
    >
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t(`${key}.roleLabel`)}
      </dt>
      <dd className="text-text-primary">{role.trim() || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t(`${key}.descLabel`)}
      </dt>
      <dd className="whitespace-pre-wrap text-text-primary" data-testid="demand-summary-description">
        {description.trim()}
      </dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("form.locationLabel")}
      </dt>
      <dd className="text-text-primary">{location.trim() || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("form.skillsLabel")}
      </dt>
      <dd className="text-text-primary">{skills.trim() || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("form.urgencyLabel")}
      </dt>
      <dd className="text-text-primary">{urgencyLabel}</dd>
      {notes.trim() && (
        <>
          <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("form.notesLabel")}
          </dt>
          <dd className="whitespace-pre-wrap text-text-primary">{notes.trim()}</dd>
        </>
      )}
    </dl>
  );

  // The preliminary estimate summary — rendered on review + after submit when
  // the user actually filled in a (valid) estimate. Optional: omitted otherwise.
  const estimateSummary =
    estimateEngaged && estimateOk ? (
      <EstimateSummary
        result={computeEstimate(estimate)}
        assumptions={estimateAssumptionKeys(estimate)}
        missingInfo={estimateMissingInfoKeys(estimate)}
        compact
      />
    ) : null;

  if (state === "done") {
    return (
      <div className="flex flex-col gap-3" data-testid="demand-submitted-summary">
        <p
          className="text-sm font-semibold text-state-success"
          role="status"
          data-testid="demand-done"
        >
          ✓ {t(`${key}.done`)}
        </p>
        <p className="text-xs text-text-secondary">{t("form.submittedHeading")}</p>
        {summaryList}
        {estimateSummary}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="demand-form">
      {/* Progress dots — progress-only (current/done), not tap targets. */}
      <ol className="flex items-center gap-2" aria-label={t("form.progressLabel")}>
        {stepTitles.map((title, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const stateClass =
            n === step
              ? "border-brand-orange bg-brand-orange/15 text-brand-orange"
              : n < step
                ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
                : "border-ink-600 bg-ink-800/60 text-text-muted";
          return (
            <li key={title} className="flex min-w-0 items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold ${stateClass}`}
                aria-current={n === step ? "step" : undefined}
              >
                {n}
              </span>
              {/* Label: only the current step's label on mobile, all at sm+. */}
              <span
                className={`truncate text-xs font-semibold ${
                  n === step ? "text-text-primary" : "hidden text-text-muted sm:inline"
                }`}
              >
                {title}
              </span>
              {i < stepTitles.length - 1 && (
                <span className="hidden h-px w-4 bg-ink-600 sm:inline-block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* STEP 1 — describe the need */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <Label>{t(`${key}.roleLabel`)}</Label>
            <Input
              type="text"
              value={role}
              maxLength={120}
              placeholder={t(`${key}.rolePlaceholder`)}
              onChange={(e) => setRole(e.target.value)}
              data-testid="demand-role"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>
              {t(`${key}.descLabel`)} <span className="text-state-danger">*</span>
            </Label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (e.target.value.trim()) setShowDescError(false);
              }}
              rows={4}
              required
              placeholder={t(`${key}.descPlaceholder`)}
              data-testid="demand-description"
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
            {showDescError && (
              <span
                className="text-xs text-state-danger"
                role="alert"
                data-testid="demand-desc-error"
              >
                {t("form.descRequired")}
              </span>
            )}
          </label>
        </div>
      )}

      {/* STEP 2 — criteria / context */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <Label>
              {t("form.locationLabel")}{" "}
              <span className="text-text-muted">{t("form.optionalTag")}</span>
            </Label>
            <Input
              type="text"
              value={location}
              maxLength={120}
              placeholder={t("form.locationPlaceholder")}
              onChange={(e) => setLocation(e.target.value)}
              data-testid="demand-location"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>
              {t("form.skillsLabel")}{" "}
              <span className="text-text-muted">{t("form.optionalTag")}</span>
            </Label>
            <Input
              type="text"
              value={skills}
              maxLength={300}
              placeholder={t("form.skillsPlaceholder")}
              onChange={(e) => setSkills(e.target.value)}
              data-testid="demand-skills"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{t("form.urgencyLabel")}</Label>
            <DarkListbox
              value={urgency}
              onChange={(v) => setUrgency(v as DemandUrgency)}
              options={urgencyOptions}
              ariaLabel={t("form.urgencyLabel")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>
              {t("form.notesLabel")}{" "}
              <span className="text-text-muted">{t("form.optionalTag")}</span>
            </Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t("form.notesPlaceholder")}
              data-testid="demand-notes"
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>

          {/* Optional preliminary Estimate Builder (deterministic, no AI). */}
          <EstimateBuilder inputs={estimate} onChange={setEstimate} />
        </div>
      )}

      {/* STEP 3 — review & create */}
      {step === 3 && (
        <div className="flex flex-col gap-3" data-testid="demand-review">
          <p className="text-sm text-text-secondary">{t("form.reviewIntro")}</p>
          {summaryList}
          {estimateSummary && (
            <div data-testid="demand-review-estimate">{estimateSummary}</div>
          )}
        </div>
      )}

      {/* Navigation — real controls (no fake-clickable cards). */}
      <div className="flex flex-col gap-2 border-t border-ink-600 pt-4 sm:flex-row sm:items-center sm:gap-3">
        {step > 1 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={goBack}
            disabled={state === "sending"}
            className="w-full sm:w-auto"
            data-testid="demand-back"
          >
            ← {t("form.back")}
          </Button>
        )}
        {step < 3 ? (
          <Button
            type="button"
            size="sm"
            onClick={goNext}
            // Step 1: needs a description (no empty creation). Step 2: an engaged
            // estimate must be valid before advancing (no impossible numbers).
            disabled={(step === 1 && !descOk) || (step === 2 && !estimateOk)}
            className="w-full sm:w-auto sm:self-start"
            data-testid="demand-next"
          >
            {t("form.next")} →
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={create}
            disabled={state === "sending" || !descOk || !estimateOk}
            // Mobile-first: the room's primary action is a full-width tap target
            // on phones, compact on larger screens.
            className="w-full sm:w-auto sm:self-start"
            data-testid="demand-create"
          >
            {state === "sending" ? t("sending") : t(`${key}.cta`)}
          </Button>
        )}
      </div>
      {state === "error" && (
        <p className="text-xs text-state-danger" role="alert" data-testid="demand-error">
          {t("error")}
        </p>
      )}
    </div>
  );
}
