"use server";

/**
 * Worker intake form — server action (Staffing Operating Model v1, PR10 UI).
 *
 * Parses the intake FormData, runs the worker_profile AI agent via
 * draftWorkerProfileFromIntake, and returns a small state the client renders as
 * a labelled AI SUGGESTION. Nothing is persisted here — this is a draft the
 * worker reviews. AI is disabled in prod until the owner provides a provider, so
 * the state honestly reports "disabled" then.
 */
import { getLocale } from "next-intl/server";
import { draftWorkerProfileFromIntake } from "./worker-intake-actions";
import { aiActionRateLimited } from "../security/ai-action-throttle";
import type { AiLocale } from "../ai/runtime/types";

export interface WorkerIntakeFormState {
  readonly ok: boolean;
  readonly code?: "invalid" | "error";
  readonly draftStatus?: "suggestion" | "disabled" | "needs_review";
  readonly headline?: string | null;
  readonly skills?: readonly string[];
  readonly missing?: readonly string[];
  readonly message?: string;
}

function toAiLocale(value: string): AiLocale {
  return value === "lt" || value === "ru" ? value : "en";
}

function csv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function str(value: FormDataEntryValue | null): string | undefined {
  const s = String(value ?? "").trim();
  return s.length ? s : undefined;
}

export async function submitWorkerIntakeAction(
  _prev: WorkerIntakeFormState | null,
  formData: FormData,
): Promise<WorkerIntakeFormState> {
  const teamSizeRaw = Number(formData.get("team_size"));
  const raw = {
    fullName: str(formData.get("full_name")) ?? "",
    profession: str(formData.get("profession")) ?? "",
    targetCountries: csv(formData.get("target_countries")),
    availableFrom: str(formData.get("available_from")),
    accommodation: str(formData.get("accommodation")) ?? "needs_accommodation",
    transport: str(formData.get("transport")) ?? "none",
    engagementType: str(formData.get("engagement_type")) ?? "employee",
    languages: csv(formData.get("languages")),
    // ZZP / brigade details (optional)
    businessName: str(formData.get("business_name")),
    vatNumber: str(formData.get("vat_number")),
    teamSize: Number.isFinite(teamSizeRaw) && teamSizeRaw > 0 ? Math.trunc(teamSizeRaw) : undefined,
    teamProfessions: csv(formData.get("team_professions")),
    tools: csv(formData.get("tools")),
    insurance: str(formData.get("insurance")),
    invoiceReady: formData.get("invoice_ready") === "yes",
    comment: str(formData.get("comment")),
  };

  // Unauthenticated marketing surface → the model call is metered per client.
  // A throttled caller gets the same honest "disabled" state the action
  // already renders when the AI runtime is off — never a fake draft.
  if (
    await aiActionRateLimited({
      name: "ai-worker-intake-draft",
      limit: 5,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return { ok: true, draftStatus: "disabled" };
  }

  const locale = toAiLocale(await getLocale());
  const result = await draftWorkerProfileFromIntake(raw, locale);

  if (!result.ok) {
    return { ok: false, code: "invalid", message: result.error };
  }

  const draft = result.draft;
  if (draft.status === "suggestion") {
    const value = draft.value as {
      data: {
        suggested_headline: string | null;
        suggested_skill_claims: string[];
        missing_profile_fields: string[];
      };
    };
    return {
      ok: true,
      draftStatus: "suggestion",
      headline: value.data.suggested_headline,
      skills: value.data.suggested_skill_claims,
      missing: value.data.missing_profile_fields,
    };
  }

  return {
    ok: true,
    draftStatus: draft.status === "disabled" ? "disabled" : "needs_review",
  };
}
