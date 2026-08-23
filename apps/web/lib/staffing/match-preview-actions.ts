"use server";

/**
 * ⛔ DEPRECATED — FROZEN LEGACY FORK (Wagon 4). The /match-preview marketing
 * page rides the frozen lib/staffing/fit.ts engine — see the header there.
 * No new imports (guard: lib/guards/staffing-fit-frozen.test.ts); new
 * matching work goes to lib/market/match-v1.ts.
 *
 * Match preview — server action (Staffing Operating Model v1, PR8).
 *
 * PREVIEW ONLY. Given a worker's facts + a company need, it computes the
 * deterministic fit and runs the matching_explanation agent (disabled in prod
 * until a provider; mock in dev). It NEVER books, NEVER persists, NEVER writes
 * to any table, NEVER contacts anyone. The output is explicitly a preview, not a
 * booking request.
 */
import { getLocale } from "next-intl/server";
import { runAiAgent } from "../ai/run-agent-server";
import { aiActionRateLimited } from "../security/ai-action-throttle";
import { workerIntakeSchema } from "./worker-intake";
import { companyNeedSchema } from "./company-need";
import {
  buildMatchPreview,
  buildMatchingExplanationInput,
  type MatchScore,
} from "./match-preview";
import type { AiLocale } from "../ai/runtime/types";

export interface MatchPreviewDimension {
  readonly dimension: string;
  readonly verdict: string;
  readonly detail: string;
}

export interface MatchPreviewState {
  readonly ok: boolean;
  readonly code?: "invalid";
  readonly score?: MatchScore;
  readonly dimensions?: readonly MatchPreviewDimension[];
  readonly blockers?: readonly string[];
  readonly explanation?: string | null;
  readonly explanationStatus?: "suggestion" | "disabled" | "needs_review";
  readonly message?: string;
}

function toAiLocale(value: string): AiLocale {
  return value === "lt" || value === "ru" ? value : "en";
}

function str(value: FormDataEntryValue | null): string | undefined {
  const s = String(value ?? "").trim();
  return s.length ? s : undefined;
}

function csv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function previewMatchAction(
  _prev: MatchPreviewState | null,
  formData: FormData,
): Promise<MatchPreviewState> {
  const workerParsed = workerIntakeSchema.safeParse({
    fullName: "preview",
    profession: str(formData.get("w_profession")) ?? "",
    availableFrom: str(formData.get("w_available_from")),
    accommodation: str(formData.get("w_accommodation")) ?? "needs_accommodation",
    transport: str(formData.get("w_transport")) ?? "none",
    languages: csv(formData.get("w_languages")),
  });
  const needParsed = companyNeedSchema.safeParse({
    companyName: "preview",
    country: str(formData.get("n_country")) ?? "",
    profession: str(formData.get("n_profession")) ?? "",
    startDate: str(formData.get("n_start_date")),
    accommodationOffer: str(formData.get("n_accommodation")) ?? "not_provided",
    transportProvided: formData.get("n_transport_provided") === "yes",
    languageRequirements: csv(formData.get("n_languages")),
    acceptsNonEnglish: formData.get("n_accepts_non_english") !== "no",
    description: "preview",
  });

  if (!workerParsed.success || !needParsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: workerParsed.success ? needParsed.error?.message : workerParsed.error.message,
    };
  }

  const preview = buildMatchPreview(workerParsed.data, needParsed.data);
  const locale = toAiLocale(await getLocale());

  // Unauthenticated marketing surface → the model call is metered per client.
  // The deterministic preview above stays available when throttled; only the
  // AI explanation degrades, honestly, to the existing "disabled" state.
  const limited = await aiActionRateLimited({
    name: "ai-match-preview",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  let explanation: string | null = null;
  let explanationStatus: MatchPreviewState["explanationStatus"];
  if (limited) {
    explanationStatus = "disabled";
  } else {
    const explainOutcome = await runAiAgent(
      "matching_explanation",
      buildMatchingExplanationInput(workerParsed.data, needParsed.data, preview.fit),
      { locale },
    );
    if (explainOutcome.status === "suggestion") {
      const v = explainOutcome.value as { data: { fit_summary: string | null } };
      explanation = v.data.fit_summary;
      explanationStatus = "suggestion";
    } else {
      explanationStatus = explainOutcome.status === "disabled" ? "disabled" : "needs_review";
    }
  }

  return {
    ok: true,
    score: preview.score,
    dimensions: preview.fit.dimensions.map((d) => ({
      dimension: d.dimension,
      verdict: d.verdict,
      detail: d.detail,
    })),
    blockers: preview.blockers,
    explanation,
    explanationStatus,
  };
}
