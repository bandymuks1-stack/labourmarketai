"use server";

import "server-only";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import type { AiLocale } from "@/lib/ai/runtime/types";
import {
  parseCvSections,
  type CvSectionProposals,
} from "@/lib/cv/structured-parse";
import {
  isWorkerLanguage,
  isWorkerLanguageLevel,
} from "@/lib/worker/worker-languages-model";
import { isEducationTypeSlug } from "@/lib/worker/worker-education-model";

/**
 * Canonical-journey P2/P6 — OPTIONAL AI enhancement of CV/profile-text
 * structuring, inside the real workflow (the profile review step), never a
 * standalone AI page.
 *
 * The deterministic lexicon extraction is the ALWAYS-ON path; this action
 * only ADDS labelled suggestions when the owner has enabled the existing AI
 * runtime (AI_PROVIDER_MODE=live + AI_API_KEY — see lib/ai/runtime). It
 * reuses the registered `worker_profile` agent (suggestion-only system
 * prompt: never verifies, never invents) and returns ONLY skill-claim
 * labels; the caller feeds them into the SAME per-chip human review the
 * deterministic suggestions use — nothing is persisted without an explicit
 * user confirm.
 *
 * Honest fallback: when the runtime is disabled/unavailable the result is
 * `{ status: "off" }` and the UI shows NOTHING extra — no fake AI badge, no
 * error noise. Only the user's own composed text is sent (bio field), no
 * contact data, no documents (data minimisation).
 */

export type CvAiStructuringResult =
  | {
      status: "ok";
      skillLabels: string[];
      /** Full CV System v1: structured section candidates from the SAME single
       *  agent run (mapped into the deterministic parser's proposal shape) —
       *  null when the model returned none. One run, one cost, two surfaces. */
      sections: CvSectionProposals | null;
    }
  | { status: "off" };

const SUPPORTED: ReadonlySet<string> = new Set(["en", "lt", "ru"]);

export async function aiCvStructuringSuggestions(
  text: string,
  locale: string,
): Promise<CvAiStructuringResult> {
  const bio = (text ?? "").trim().slice(0, 8000);
  if (bio.length < 20) return { status: "off" };

  const aiLocale: AiLocale = SUPPORTED.has(locale) ? (locale as AiLocale) : "en";
  try {
    const outcome = await runAiAgent("worker_profile", { bio }, { locale: aiLocale });
    if (outcome.status !== "suggestion") return { status: "off" };
    // Envelope: { suggestion: true, ..., data: { suggested_skill_claims, ... } }.
    const data = (outcome.value as { data?: WorkerProfileEnvelopeData })?.data;
    const labels = Array.isArray(data?.suggested_skill_claims)
      ? data.suggested_skill_claims
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0 && v.length <= 120)
          .slice(0, 40)
      : [];
    // Structured section candidates ride on the SAME envelope (v1.1 additive
    // fields) — mapped here so the flow never pays for a second agent run.
    const sections = mapEnvelopeSections(data);
    if (labels.length === 0 && sections === null) return { status: "off" };
    return { status: "ok", skillLabels: labels, sections };
  } catch (e) {
    // The enhancement is best-effort — a runtime failure degrades to the
    // deterministic-only review, never to an error surface.
    console.error("[cv-ai-structuring] failed:", e);
    return { status: "off" };
  }
}

// ── Full CV System v1 — shared envelope→proposal mapping (private) ──────────

interface WorkerProfileEnvelopeData {
  suggested_skill_claims?: unknown;
  suggested_work_history?: Array<{
    title: string;
    start_year: number | null;
    end_year: number | null;
    is_current: boolean;
  }>;
  suggested_education?: Array<{
    institution: string;
    program: string | null;
    education_type_slug: string;
    start_year: number | null;
    end_year: number | null;
  }>;
  suggested_languages?: Array<{ lang: string; level: string | null }>;
  suggested_certificates?: Array<{ title: string; year: number | null }>;
  suggested_salary_expectation?: {
    min_eur: number | null;
    max_eur: number | null;
  } | null;
}

/**
 * Map the worker_profile v1.1 envelope's OPTIONAL structured section fields
 * into the SAME proposal shape the deterministic parser
 * (lib/cv/structured-parse.ts) produces, so the review panel treats both
 * sources identically (per-item human confirm; AI items are labelled).
 *
 * Every mapped item carries confidence "low" — an AI restatement is never
 * more trustworthy than a deterministic pattern match. Closed vocabularies
 * are re-validated (unknown language codes DROPPED, unknown education slugs
 * downgraded to 'other', non-CEFR levels dropped to null so the user picks).
 * Returns null when the model suggested nothing structured.
 */
function mapEnvelopeSections(
  data: WorkerProfileEnvelopeData | undefined,
): CvSectionProposals | null {
  if (!data) return null;
  const proposals: CvSectionProposals = {
    ...parseCvSections(""), // canonical empty shape
    workHistory: (data.suggested_work_history ?? []).slice(0, 20).map((w) => ({
      title: w.title.trim().slice(0, 200),
      startYear: w.start_year,
      endYear: w.end_year,
      isCurrent: w.is_current === true,
      confidence: "low" as const,
      sourceLine: "",
    })),
    education: (data.suggested_education ?? []).slice(0, 20).map((e) => ({
      institution: e.institution.trim().slice(0, 200),
      program: e.program?.trim().slice(0, 200) || null,
      educationTypeSlug: isEducationTypeSlug(e.education_type_slug)
        ? e.education_type_slug
        : "other",
      startYear: e.start_year,
      endYear: e.end_year,
      confidence: "low" as const,
      sourceLine: "",
    })),
    languages: (data.suggested_languages ?? [])
      .filter((l) => isWorkerLanguage(l.lang))
      .slice(0, 20)
      .map((l) => ({
        lang: l.lang,
        level: l.level && isWorkerLanguageLevel(l.level) ? l.level : null,
        confidence: "low" as const,
        sourceLine: "",
      })),
    certificates: (data.suggested_certificates ?? []).slice(0, 20).map((c) => ({
      title: c.title.trim().slice(0, 160),
      year: c.year,
      confidence: "low" as const,
      sourceLine: "",
    })),
    salary:
      data.suggested_salary_expectation &&
      (data.suggested_salary_expectation.min_eur !== null ||
        data.suggested_salary_expectation.max_eur !== null)
        ? {
            minEur: data.suggested_salary_expectation.min_eur,
            maxEur: data.suggested_salary_expectation.max_eur,
            confidence: "low" as const,
            sourceLine: "",
          }
        : null,
  };
  const any =
    proposals.workHistory.length > 0 ||
    proposals.education.length > 0 ||
    proposals.languages.length > 0 ||
    proposals.certificates.length > 0 ||
    proposals.salary !== null;
  return any ? proposals : null;
}
