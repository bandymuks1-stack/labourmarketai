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
import { persistPublicCompanyNeed } from "./company-need-public-intake";
import { sendCompanyNeedOwnerAlert } from "../notifications/telegram-owner-alerts";
import { isConstructionWorkType } from "../taxonomy/work-categories";
import type { AiLocale } from "../ai/runtime/types";

export interface CompanyNeedFormState {
  readonly ok: boolean;
  readonly code?: "invalid" | "error";
  /**
   * Whether the anonymous structured need was actually PERSISTED for
   * follow-up (v1). true → show the "request received" success state; false
   * → the honest "prepared — create an account to submit" fallback (the
   * backend is not applied yet or a transient error occurred). Never a
   * dead-end, never a false success.
   */
  readonly persisted?: boolean;
  /**
   * Whether the submitted need is for construction workers. When true, the
   * response shows the honest LT/PL partner-company fallback route (copy-only;
   * a human-coordinated launch-stage option, not automatic matching).
   */
  readonly isConstruction?: boolean;
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
  const urgencyRaw = str(formData.get("urgency"));
  const urgency =
    urgencyRaw === "asap" || urgencyRaw === "weeks" || urgencyRaw === "flexible"
      ? urgencyRaw
      : "flexible";
  const raw = {
    companyName: str(formData.get("company_name")) ?? "",
    contactPerson: str(formData.get("contact_person")),
    country: str(formData.get("country")) ?? "",
    cityRegion: str(formData.get("city_region")),
    profession: str(formData.get("profession")) ?? "",
    numberOfWorkers: Number.isFinite(workers) && workers > 0 ? Math.trunc(workers) : 1,
    startDate: str(formData.get("start_date")),
    expectedDuration: str(formData.get("expected_duration")),
    urgency,
    accommodationOffer: str(formData.get("accommodation")) ?? "not_provided",
    transportProvided: formData.get("transport_provided") === "yes",
    languageRequirements: csv(formData.get("languages")),
    engagementModel: str(formData.get("engagement_model")) ?? "employment",
    description: str(formData.get("description")) ?? "",
  };

  // Actionability guard (Pre-Advertising Launch Readiness v1): a stored
  // intake with no reachable contact is un-actionable. The public form marks
  // contact_email `required`, but markup is bypassable (no-JS, bots, direct
  // action calls), so enforce a valid email server-side BEFORE persisting —
  // return the honest `invalid` state (rendered as statusInvalid), never a
  // silent un-contactable row. (An RPC-level CHECK is the owner-gated schema
  // follow-up in docs/launch/launch-blocker-register-v1.md §F1.)
  const contactEmail = str(formData.get("contact_email"));
  const contactEmailOk =
    !!contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
  if (!contactEmailOk) {
    return { ok: false, code: "invalid" };
  }

  const rawLocale = await getLocale();
  const locale = toAiLocale(rawLocale);

  // Persist the structured need for follow-up (anonymous path, v1). This is
  // the real backend now: a success means a row was stored for the operator.
  // On failure the helper returns a code and we fall back to the honest
  // "prepared" state — never a false success, never a dead-end.
  const persist = await persistPublicCompanyNeed({
    locale: rawLocale,
    companyName: raw.companyName,
    contactName: raw.contactPerson,
    contactEmail,
    country: raw.country,
    cityRegion: raw.cityRegion,
    sector: raw.profession,
    headcount: raw.numberOfWorkers,
    startWindow: raw.startDate,
    expectedDuration: raw.expectedDuration,
    urgency: raw.urgency,
    accommodation: raw.accommodationOffer,
    transportNeeded: raw.transportProvided,
    languages: raw.languageRequirements.join(", ") || undefined,
    engagementType: raw.engagementModel,
    description: raw.description,
    sourcePath: `/${rawLocale}/company-need`,
  });
  const persisted = persist.ok;

  // Rate-limited caller → the honest "prepared" fallback WITHOUT invoking
  // the AI draft. The limiter used to guard only the DB insert, leaving the
  // model call below as unmetered anonymous work reachable from a public
  // page (2026-08-17 audit, AI boundary gap). No AI run for a flooded key.
  if (!persist.ok && persist.code === "rate_limited") {
    return {
      ok: true,
      persisted: false,
      isConstruction: isConstructionWorkType(raw.profession),
      draftStatus: "disabled",
    };
  }

  // Best-effort owner demand-signal alert (Telegram, server-only + env-gated).
  // Fires ONLY on a persisted intake. The helper never throws and no-ops when
  // the channel is unconfigured; the extra try/catch is defense-in-depth so a
  // Telegram failure can never affect the submission, persistence, or queue.
  if (persisted) {
    try {
      await sendCompanyNeedOwnerAlert({
        companyName: raw.companyName,
        contact: [raw.contactPerson, str(formData.get("contact_email"))]
          .filter(Boolean)
          .join(" "),
        sector: raw.profession,
        country: raw.country,
        cityRegion: raw.cityRegion,
        headcount: raw.numberOfWorkers,
        urgency: raw.urgency,
        startOrDate: raw.startDate,
        duration: raw.expectedDuration,
        languages: raw.languageRequirements.join(", ") || undefined,
        sourcePath: `/${rawLocale}/company-need`,
      });
    } catch {
      // never surfaced to the user
    }
  }

  const isConstruction = isConstructionWorkType(raw.profession);

  const result = await draftVacancyFromNeed(raw, locale);

  if (!result.ok) {
    // The AI-draft parse failed, but if the row was persisted the submission
    // still succeeded for the employer — show the success state.
    if (persisted) return { ok: true, persisted: true, isConstruction };
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
      persisted,
      isConstruction,
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
    persisted,
    isConstruction,
    draftStatus: draft.status === "disabled" ? "disabled" : "needs_review",
  };
}
