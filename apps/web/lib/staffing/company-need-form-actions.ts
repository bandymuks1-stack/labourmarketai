"use server";

/**
 * Company need form — server action (Staffing Operating Model v1, PR4 UI / PR10).
 *
 * Parses the vacancy FormData, runs the company_need AI agent via
 * draftVacancyFromNeed, and returns a small state the client renders as a
 * labelled vacancy SUGGESTION. Nothing is published here — the company reviews
 * the draft. AI is disabled in prod until the owner provides a provider.
 */
import { getLocale } from "next-intl/server";
import { draftVacancyFromNeed } from "./company-need-actions";
import type { AiLocale } from "../ai/runtime/types";

export interface CompanyNeedFormState {
  readonly ok: boolean;
  readonly code?: "invalid" | "error";
  readonly draftStatus?: "suggestion" | "disabled" | "needs_review";
  readonly role?: string | null;
  readonly skills?: readonly string[];
  readonly documents?: readonly string[];
  readonly missing?: readonly string[];
  readonly blockers?: readonly string[];
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

export async function submitCompanyNeedAction(
  _prev: CompanyNeedFormState | null,
  formData: FormData,
): Promise<CompanyNeedFormState> {
  const workers = Number(formData.get("number_of_workers"));
  const raw = {
    companyName: str(formData.get("company_name")) ?? "",
    country: str(formData.get("country")) ?? "",
    profession: str(formData.get("profession")) ?? "",
    numberOfWorkers: Number.isFinite(workers) && workers > 0 ? Math.trunc(workers) : 1,
    startDate: str(formData.get("start_date")),
    accommodationOffer: str(formData.get("accommodation")) ?? "not_provided",
    transportProvided: formData.get("transport_provided") === "yes",
    languageRequirements: csv(formData.get("languages")),
    engagementModel: str(formData.get("engagement_model")) ?? "employment",
    description: str(formData.get("description")) ?? "",
  };

  const locale = toAiLocale(await getLocale());
  const result = await draftVacancyFromNeed(raw, locale);

  if (!result.ok) {
    return { ok: false, code: "invalid", message: result.error };
  }

  const draft = result.draft;
  if (draft.status === "suggestion") {
    const value = draft.value as {
      data: {
        normalized_role: string | null;
        required_skills: string[];
        required_documents: string[];
        missing_fields: string[];
        country_readiness_blockers: string[];
      };
    };
    return {
      ok: true,
      draftStatus: "suggestion",
      role: value.data.normalized_role,
      skills: value.data.required_skills,
      documents: value.data.required_documents,
      missing: value.data.missing_fields,
      blockers: value.data.country_readiness_blockers,
    };
  }

  return {
    ok: true,
    draftStatus: draft.status === "disabled" ? "disabled" : "needs_review",
  };
}
