"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  getOwnLastDemandPrefillAction,
  submitDemandRequestAction,
} from "@/lib/demand/demand-request-actions";
import { deleteDemandDraftAction } from "@/lib/demand/demand-drafts-actions";
import type { DemandPrefill, DemandUrgency } from "@/lib/demand/demand-request";
import { DemandAdvancedSections } from "@/components/app/demand-advanced-sections";
import {
  buildStructuredV2Input,
  storedV2ToFormState,
  EMPTY_ADVANCED_DEMAND_STATE,
  type AdvancedDemandFormState,
} from "@/lib/demand/structured-demand-form";
import {
  deriveCompensationHonestyFlags,
  requiresTalentPoolDisclosure,
  sanitizeStructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";
import {
  buildWorkCategoryOptions,
  MARKET_COUNTRIES,
} from "@/lib/taxonomy/work-categories";
import { structureNeed } from "@/lib/structuring/structure-need";
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
import { cn } from "@/lib/utils";

/** Required tools / equipment options (§8.6) — a CLOSED set of EXISTING
 *  canonical taxonomy skill slugs (lib/taxonomy/profession-skills.ts; labels
 *  come from the existing skillNames catalogue — no new taxonomy, no free
 *  text). Mirrors REQUIRED_TOOL_SLUGS in lib/demand/demand-request.ts and the
 *  worker RPC whitelist (20260705210000) EXACTLY — guard-pinned. */
const REQUIRED_TOOL_OPTIONS: readonly string[] = [
  "bulldozer-operator",
  "compactor-operator",
  "crane-operator",
  "equipment-operation",
  "excavator-operator",
  "forklift-operator",
  "grader-operator",
  "hand-tools",
  "loader-operator",
  "scaffolding",
];

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
  const router = useRouter();
  // Structured field labels reuse the existing 3-locale catalogues (no new
  // 11-locale keys): companyNeed for the field labels + accommodation options,
  // labourMarket for the country names.
  const tc = useTranslations("companyNeed");
  const tlm = useTranslations("labourMarket");
  // Existing platform taxonomy names (slug → localized label) — reused for the
  // required-tools chips exactly like the profile skill picker does.
  const tSkill = useTranslations("skillNames");
  const locale = useLocale();
  const workCategories = buildWorkCategoryOptions(locale);
  // Intent-specific copy: company hiring is NOT a generic buyer "need".
  const key = intent === "hire_workers" ? "hire" : "partner";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState("");
  const [urgency, setUrgency] = useState<DemandUrgency>("flexible");
  const [notes, setNotes] = useState("");
  // Structured, worker-board-safe fields.
  const [workType, setWorkType] = useState("");
  const [country, setCountry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const accommodationOptions: { value: string; label: string }[] = [
    { value: "provided_free", label: tc("accFree") },
    { value: "provided_paid", label: tc("accPaid") },
    { value: "provided_deducted", label: tc("accDeducted") },
    { value: "not_provided", label: tc("accNone") },
  ];
  // Transport condition (§8.5) — same closed-set pattern as accommodation;
  // optional and honest ("" = not stated, never a fabricated value).
  const [transport, setTransport] = useState("");
  const transportOptions: { value: string; label: string }[] = [
    { value: "provided", label: tc("transProvided") },
    { value: "compensated", label: tc("transCompensated") },
    { value: "not_provided", label: tc("transNone") },
    { value: "unknown", label: tc("transUnknown") },
  ];
  // Required tools/equipment (§8.6) — optional multi-select over the closed
  // slug set; honest by default (nothing selected = "not stated", never a
  // fabricated requirement).
  const [requiredTools, setRequiredTools] = useState<string[]>([]);
  function toggleRequiredTool(slug: string) {
    setRequiredTools((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }
  const toolLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const workTypeLabel =
    workCategories.flatMap((c) => c.options).find((o) => o.slug === workType)?.label ?? "";
  const accommodationLabel =
    accommodationOptions.find((o) => o.value === accommodation)?.label ?? "";
  const transportLabel =
    transportOptions.find((o) => o.value === transport)?.label ?? "";
  // systemic-ux-mobile-v1: dark-listbox option sets (replace the native white
  // dropdown on mobile). Profession options are flattened from the sector
  // groups, sector context kept in the label so nothing is lost.
  const professionOptions: { value: string; label: string }[] =
    workCategories.flatMap((c) =>
      c.options.map((o) => ({ value: o.slug, label: `${o.label} · ${c.sector}` })),
    );
  const countryOptions: { value: string; label: string }[] =
    MARKET_COUNTRIES.map((code) => ({
      value: code,
      label: tlm(`countryNames.${code}`),
    }));
  const [estimate, setEstimate] = useState<EstimateInputs>(EMPTY_ESTIMATE_INPUTS);
  const [showDescError, setShowDescError] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error" | "needsMigration">(
    "idle",
  );
  // Advanced structured clusters (structured_v2, PR 2) — optional; empty
  // stays an honest "not stated" and the request submits exactly as before.
  const tsd = useTranslations("structuredDemand");
  const [adv, setAdv] = useState<AdvancedDemandFormState>({
    ...EMPTY_ADVANCED_DEMAND_STATE,
  });
  const patchAdv = (patch: Partial<AdvancedDemandFormState>) =>
    setAdv((prev) => ({ ...prev, ...patch }));
  // Duplicate-and-edit: prefill the whole wizard from the owner's OWN last
  // request (repeat action, Capability E/G). Own data only; nothing invented.
  const [prefillState, setPrefillState] = useState<
    "idle" | "loading" | "empty" | "done" | "draft"
  >("idle");
  // The live draft row behind an auto-continue (canonical-journey P3): closed
  // (draft→closed) after the real submit so exactly ONE canonical demand row
  // remains — the company never re-enters the same need.
  const [draftSource, setDraftSource] = useState(false);

  function applyPrefill(res: Extract<DemandPrefill, { found: true }>) {
    const f = res.fields;
    setRole(f.role);
    setDescription(f.description);
    setLocation(f.location);
    setSkills(f.skills);
    if (f.urgency) setUrgency(f.urgency);
    setNotes(f.notes);
    setWorkType(f.workType ?? "");
    setCountry(f.country ?? "");
    setTeamSize(f.teamSize != null ? String(f.teamSize) : "");
    setAccommodation(f.accommodation ?? "");
    setTransport(f.transport ?? "");
    setRequiredTools(f.requiredTools);
    setAdv(storedV2ToFormState(res.structuredV2));
    setShowDescError(false);
  }

  async function prefillFromLast() {
    setPrefillState("loading");
    try {
      const res = await getOwnLastDemandPrefillAction(intent);
      if (!res.found) {
        setPrefillState("empty");
        return;
      }
      applyPrefill(res);
      setDraftSource(res.source === "draft");
      setPrefillState(res.source === "draft" ? "draft" : "done");
    } catch {
      setPrefillState("empty");
    }
  }

  // Canonical-journey P3 — auto-continue from the company's OWN saved draft.
  // Runs once on mount, applies ONLY when the form is still untouched, and
  // only for a real draft row (a past submitted request never auto-fills —
  // that stays the explicit duplicate-and-edit button above). The company
  // saved this data themselves; asking them to re-type it was the bug.
  const autoPrefillRan = useRef(false);
  // Render-synced mirror of the description — the async auto-prefill checks it
  // at APPLY time so it never overrides input the user typed meanwhile.
  const descRef = useRef(description);
  descRef.current = description;
  useEffect(() => {
    if (autoPrefillRan.current) return;
    autoPrefillRan.current = true;
    void (async () => {
      try {
        const res = await getOwnLastDemandPrefillAction(intent);
        if (!res.found || res.source !== "draft") return;
        if (descRef.current.trim()) return; // untouched check at apply time
        applyPrefill(res);
        setDraftSource(true);
        setPrefillState("draft");
      } catch {
        // Prefill is a convenience — a failure leaves an empty form, never an error state.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Review-step honesty derivations — computed from the SAME sanitizer the
  // server uses, so the preview never disagrees with what will be stored.
  const advWire = buildStructuredV2Input(adv);
  const advV2 = sanitizeStructuredDemandV2(advWire);
  const honestyFlags = deriveCompensationHonestyFlags(advV2);
  const talentPoolDisclosure = requiresTalentPoolDisclosure(advV2);

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
    // Deterministic auto-suggest: when entering the criteria step, pre-fill the
    // structured selects from the free text (only empty ones, never overriding
    // the user). Closed-set values only; the user reviews and can correct.
    if (step === 1) {
      const s = structureNeed({ role, description });
      if (s.workType && !workType) setWorkType(s.workType);
      if (s.country && !country) setCountry(s.country);
      if (s.teamSize != null && !teamSize.trim()) setTeamSize(String(s.teamSize));
      if (s.startPeriod) setUrgency(s.startPeriod);
      if (s.accommodation && !accommodation) setAccommodation(s.accommodation);
      setAutoSuggested(s.reasons.length > 0);
    }
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
        workType: workType || undefined,
        country: country || undefined,
        teamSize: teamSize.trim() ? Number(teamSize) : undefined,
        accommodation: accommodation || undefined,
        transport: transport || undefined,
        requiredTools: requiredTools.length > 0 ? requiredTools : undefined,
        estimate: estimateEngaged ? estimate : undefined,
        structuredV2: advWire,
      });
      setState(
        res.ok
          ? "done"
          : res.code === "needs_migration"
            ? "needsMigration"
            : "error",
      );
      // Canonical-journey P3: the submitted request supersedes the draft it
      // was continued from — close the draft (draft→closed, guard-allowed)
      // so exactly ONE canonical demand row remains. Best-effort: a failure
      // leaves a stale draft behind (harmless), never blocks the submit.
      if (res.ok && draftSource) {
        try {
          await deleteDemandDraftAction(
            intent === "hire_workers" ? "company_request" : "agency_offer",
          );
        } catch {
          /* stale draft is harmless; the submit already succeeded */
        }
      }
      // Refresh server components so the read-back list below shows the new
      // request immediately — it used to stay stale until a manual reload
      // (audit PR4: "demand submit success is a dead end").
      if (res.ok) router.refresh();
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
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tc("profession")}
      </dt>
      <dd className="text-text-primary">{workTypeLabel || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tc("country")}
      </dt>
      <dd className="text-text-primary">
        {country ? tlm(`countryNames.${country}`) : "—"}
      </dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tc("numberOfWorkers")}
      </dt>
      <dd className="text-text-primary">{teamSize.trim() || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tc("accommodation")}
      </dt>
      <dd className="text-text-primary">{accommodationLabel || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tc("transportOffer")}
      </dt>
      <dd className="text-text-primary">{transportLabel || "—"}</dd>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tc("requiredTools")}
      </dt>
      <dd className="text-text-primary" data-testid="demand-summary-required-tools">
        {requiredTools.length > 0
          ? [...requiredTools].sort().map(toolLabel).join(", ")
          : "—"}
      </dd>
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
        {/* The exact next step — the scouting room where matches + interest for
            this need appear (audit PR4: success used to be a dead-end panel). */}
        <Link
          href={"/dashboard/company/scouting" as "/dashboard"}
          className="w-fit text-sm font-medium text-brand-blue hover:underline"
          data-testid="demand-done-scouting-link"
        >
          {t("form.doneScoutingLink")} →
        </Link>
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
          {/* Duplicate-and-edit — repeat action: copy the own last request
              into the form, then edit. Own data echoed back; nothing invented. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={prefillFromLast}
              disabled={prefillState === "loading"}
              data-testid="demand-prefill-last"
            >
              {prefillState === "loading" ? tsd("prefillLoading") : tsd("prefillButton")}
            </Button>
            {prefillState === "empty" && (
              <span className="text-xs text-text-muted" data-testid="demand-prefill-empty">
                {tsd("prefillEmpty")}
              </span>
            )}
            {prefillState === "done" && (
              <span
                className="text-xs text-state-success"
                role="status"
                data-testid="demand-prefill-done"
              >
                {tsd("prefillDone")}
              </span>
            )}
            {prefillState === "draft" && (
              <span
                className="text-xs text-state-success"
                role="status"
                data-testid="demand-prefill-draft"
              >
                {tsd("prefillFromDraft")}
              </span>
            )}
          </div>
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
          {autoSuggested && (
            <p
              className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
              data-testid="demand-auto-suggested"
            >
              {tc("autoSuggested")}
            </p>
          )}
          {/* Structured, worker-board-safe fields — these are what a worker
              sees on the opportunities board (no free text exposed). */}
          <label className="flex flex-col gap-1.5">
            <Label>{tc("profession")}</Label>
            <DarkListbox
              value={workType}
              onChange={setWorkType}
              options={professionOptions}
              ariaLabel={tc("profession")}
              placeholder="—"
              testId="demand-work-type"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <Label>{tc("country")}</Label>
              <DarkListbox
                value={country}
                onChange={setCountry}
                options={countryOptions}
                ariaLabel={tc("country")}
                placeholder="—"
                testId="demand-country-select"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>{tc("numberOfWorkers")}</Label>
              <Input
                type="number"
                min={1}
                max={100000}
                value={teamSize}
                placeholder="1"
                onChange={(e) => setTeamSize(e.target.value)}
                data-testid="demand-team-size"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <Label>{tc("accommodation")}</Label>
            <DarkListbox
              value={accommodation}
              onChange={setAccommodation}
              options={accommodationOptions}
              ariaLabel={tc("accommodation")}
              placeholder="—"
              testId="demand-accommodation"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>{tc("transportOffer")}</Label>
            <DarkListbox
              value={transport}
              onChange={setTransport}
              options={transportOptions}
              ariaLabel={tc("transportOffer")}
              placeholder="—"
              testId="demand-transport"
            />
          </label>
          {/* Required tools / equipment (§8.6) — optional toggle chips over the
              CLOSED taxonomy slug set (same real-control pattern as the profile
              skill picker; labels from the existing skillNames catalogue). No
              free-text tool input exists — unselected stays an honest "not
              stated" on the worker board. */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="contents">
              <Label>
                {tc("requiredTools")}{" "}
                <span className="text-text-muted">{t("form.optionalTag")}</span>
              </Label>
            </legend>
            <p className="text-xs text-text-muted">{tc("requiredToolsHelp")}</p>
            <ul
              className="flex flex-wrap gap-2"
              data-testid="demand-required-tools"
            >
              {REQUIRED_TOOL_OPTIONS.map((slug) => {
                const isSelected = requiredTools.includes(slug);
                return (
                  <li key={slug}>
                    <button
                      type="button"
                      onClick={() => toggleRequiredTool(slug)}
                      aria-pressed={isSelected}
                      data-slug={slug}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors",
                        isSelected
                          ? "border-brand-orange bg-brand-orange text-ink-900"
                          : "border-ink-500 text-text-secondary hover:border-text-muted",
                      )}
                    >
                      {toolLabel(slug)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>

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

          {/* Advanced structured clusters (structured_v2) — optional
              progressive disclosure; quick entry above stays the minimum
              publishable path. */}
          <DemandAdvancedSections state={adv} onChange={patchAdv} />
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

          {/* Publish-honesty flags — visible gaps, not blockers (goal spec:
              no unexplained "up to" amount; missing minimum / gross-net basis
              / guaranteed hours / deductions are always shown). */}
          {honestyFlags.length > 0 && (
            <div
              className="rounded-md border border-state-warning/40 bg-state-warning/10 p-3"
              data-testid="demand-honesty-flags"
            >
              <p className="text-xs font-semibold text-text-primary">
                {tsd("honesty.title")}
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-text-secondary">
                {honestyFlags.map((flag) => (
                  <li key={flag} data-flag={flag}>
                    {tsd(`honesty.${flag}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {talentPoolDisclosure && (
            <p
              className="rounded-md border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-xs text-text-secondary"
              role="note"
              data-testid="demand-review-talent-pool"
            >
              {tsd("talentPoolDisclosure")}
            </p>
          )}

          {/* Preview as the worker board shows it TODAY — exactly the current
              whitelist (role, country, team size, start, accommodation,
              transport, tools). Honest note when richer v2 details were
              captured but are not yet worker-visible (human-gated MP-3). */}
          <div
            className="rounded-md border border-brand-blue/30 bg-brand-blue/5 p-3"
            data-testid="demand-worker-preview"
          >
            <p className="text-xs font-semibold text-text-primary">
              {tsd("preview.title")}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-text-muted">{tc("profession")}</dt>
              <dd className="text-text-primary">{workTypeLabel || "—"}</dd>
              <dt className="text-text-muted">{tc("country")}</dt>
              <dd className="text-text-primary">
                {country ? tlm(`countryNames.${country}`) : "—"}
              </dd>
              <dt className="text-text-muted">{tc("numberOfWorkers")}</dt>
              <dd className="text-text-primary">{teamSize.trim() || "—"}</dd>
              <dt className="text-text-muted">{t("form.urgencyLabel")}</dt>
              <dd className="text-text-primary">{urgencyLabel}</dd>
              <dt className="text-text-muted">{tc("accommodation")}</dt>
              <dd className="text-text-primary">{accommodationLabel || "—"}</dd>
              <dt className="text-text-muted">{tc("transportOffer")}</dt>
              <dd className="text-text-primary">{transportLabel || "—"}</dd>
              <dt className="text-text-muted">{tc("requiredTools")}</dt>
              <dd className="text-text-primary">
                {requiredTools.length > 0
                  ? [...requiredTools].sort().map(toolLabel).join(", ")
                  : "—"}
              </dd>
            </dl>
            {advV2 != null && (
              <p className="mt-2 text-xs text-text-muted" data-testid="demand-preview-v2-note">
                {tsd("preview.v2NotVisibleNote")}
              </p>
            )}
          </div>
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
      {state === "needsMigration" && (
        <p
          className="text-xs text-state-warning"
          role="alert"
          data-testid="demand-needs-migration"
        >
          {t("needsMigration")}
        </p>
      )}
    </div>
  );
}
