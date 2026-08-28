/**
 * recognizeIntent (pre-search gate v1) — PURE. The single entry the gate UI calls:
 * for ANY of the four intents it recognizes the intent-RELEVANT fields, shows what
 * is missing + risks + readiness, and returns up to 3 next actions that each open
 * an EXISTING real surface (no generic /dashboard, no new write path).
 *
 * It reuses the existing engines: detectJobDemandFields (detail), structureNeed
 * (identity) and deriveJobDemandRiskFlags. Most field keys are shared across
 * intents (role, location, salary, language, documents …); each intent simply
 * scopes to the subset that makes sense for it, so a worker never sees "legal
 * employer" and a project never sees "overtime".
 */
import { structureNeed } from "@/lib/structuring/structure-need";
import { detectJobDemandFields } from "./missing-fields";
import { deriveJobDemandRiskFlags } from "./risk-flags";
import type {
  RecognitionIntent,
  RecognizedCard,
  RecognizedField,
  MissingField,
  NextAction,
  JobDemandFieldKey,
  ReadinessState,
  ReadinessLabel,
} from "./types";

export interface IntentRecognitionInput {
  readonly rawText?: string | null;
}

/** Intent-relevant field subset. Shared keys, scoped per intent (the pre-search
 *  questions each flow needs before it should ever show results). */
const INTENT_FIELDS: Record<RecognitionIntent, readonly JobDemandFieldKey[]> = {
  // Looking for work: what role, where, when, type, pay, languages, licence,
  // documents, experience/skills.
  need_work: [
    "role",
    "location",
    "experience",
    "scope",
    "weeklyHours",
    "salary",
    "grossNet",
    "language",
    "drivingLicence",
    "accommodationType",
    "requiredDocuments",
    "startDate",
  ],
  // Looking for workers: the full hiring-demand detail set.
  need_workers: [
    "role",
    "location",
    "sector",
    "rotation",
    "experience",
    "scope",
    "salary",
    "grossNet",
    "currency",
    "weeklyHours",
    "overtime",
    "contractType",
    "legalEmployer",
    "language",
    "drivingLicence",
    "toolsPpe",
    "accommodationType",
    "accommodationDeductions",
    "travelTiming",
    "requiredDocuments",
    "startDate",
  ],
  // Offering services: service type, where, capacity/scope, rate, tools, proof,
  // languages, transport, certs.
  offer_services: [
    "role",
    "location",
    "scope",
    "salary",
    "currency",
    "toolsPpe",
    "language",
    "drivingLicence",
    "requiredDocuments",
    "experience",
    "startDate",
  ],
  // Project / need providers: type, location, scope, dates, trades, materials,
  // budget, documents, travel.
  have_project: [
    "role",
    "location",
    "sector",
    "scope",
    "startDate",
    "salary",
    "currency",
    "toolsPpe",
    "requiredDocuments",
    "accommodationType",
    "travelTiming",
  ],
};

/** Existing hand-off routes per intent (audit §7). No generic /dashboard. */
const PROFILE_HREF = "/dashboard/profile";
const JOURNAL_HREF = "/dashboard/journal";
const OPPORTUNITIES_HREF = "/dashboard/opportunities";
const COMPANY_HREF = "/dashboard/company";
const SERVICES_HREF = "/dashboard/services";
const SERVICE_REQUESTS_HREF = "/dashboard/service-requests";

function deriveReadiness(
  intent: RecognitionIntent,
  recognized: readonly RecognizedField[],
  missing: readonly MissingField[],
): ReadinessState {
  const relevant = INTENT_FIELDS[intent];
  const total = relevant.length;
  const met = recognized.length;
  const importantMissing = missing.filter((m) => m.severity === "important");
  const recognizedKeys = new Set(recognized.map((r) => r.key));
  const identityMissing = !recognizedKeys.has("role") || !recognizedKeys.has("location");
  const label: ReadinessLabel = identityMissing
    ? "needs_basics"
    : importantMissing.length === 0
      ? "match_ready"
      : "improving";
  return { label, met, total, missingCount: importantMissing.length };
}

function buildNextActions(
  intent: RecognitionIntent,
  missing: readonly MissingField[],
): NextAction[] {
  const importantMissing = missing.filter((m) => m.severity === "important");
  switch (intent) {
    case "need_work": {
      const actions: NextAction[] = [
        { code: "complete_player_card", href: PROFILE_HREF },
        { code: "add_work_proof", href: JOURNAL_HREF },
        { code: "search_opportunities", href: OPPORTUNITIES_HREF },
      ];
      return actions.slice(0, 3);
    }
    case "need_workers": {
      const actions: NextAction[] = [];
      if (importantMissing.length > 0)
        actions.push({ code: "complete_missing_fields", href: COMPANY_HREF });
      // The ONE hand-off that carries the employer's sentence with it. Without
      // this the recognizer read the need, scored it, and dropped it on the
      // floor - the demand form opened blank and the employer typed it twice.
      actions.push({
        code: "continue_to_demand",
        href: COMPANY_HREF,
        carriesNeedText: true,
      });
      // NOTE: a top 1–3 candidate preview is intentionally NOT a user action here
      // — the live worker pool is not wired (audit §10). No dead-end button.
      return actions.slice(0, 3);
    }
    case "offer_services": {
      return [
        { code: "complete_service_profile", href: SERVICES_HREF },
        { code: "add_work_proof", href: JOURNAL_HREF },
      ];
    }
    case "have_project": {
      const actions: NextAction[] = [];
      if (importantMissing.length > 0)
        actions.push({
          code: "complete_missing_fields",
          href: SERVICE_REQUESTS_HREF,
        });
      actions.push({ code: "continue_to_project", href: SERVICE_REQUESTS_HREF });
      return actions.slice(0, 3);
    }
  }
}

export function recognizeIntent(
  intent: RecognitionIntent,
  input: IntentRecognitionInput,
): RecognizedCard {
  const text = (input.rawText ?? "").trim();
  const structured = structureNeed({ description: text });
  const scan = detectJobDemandFields(text);

  const relevant = new Set(INTENT_FIELDS[intent]);
  const recognized = scan.recognized.filter((r) => relevant.has(r.key));
  const missing = scan.missing.filter((m) => relevant.has(m.key));

  // Risks from the intent-relevant view only (so a worker never gets a
  // "legal employer unclear" flag, etc.).
  const filteredScan = { recognized, missing };
  const risks = deriveJobDemandRiskFlags(filteredScan, structured);

  const readiness = deriveReadiness(intent, recognized, missing);
  const nextActions = buildNextActions(intent, missing);

  return {
    intent,
    recognized,
    missing,
    risks,
    confidence: structured.confidence,
    readiness,
    nextActions,
  };
}

export { INTENT_FIELDS };
