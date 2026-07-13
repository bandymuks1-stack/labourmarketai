"use server";

import "server-only";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import type { AiLocale } from "@/lib/ai/runtime/types";

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
  | { status: "ok"; skillLabels: string[] }
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
    // Envelope: { suggestion: true, ..., data: { suggested_skill_claims } }.
    const data = (outcome.value as { data?: { suggested_skill_claims?: unknown } })
      ?.data;
    const labels = Array.isArray(data?.suggested_skill_claims)
      ? data.suggested_skill_claims
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0 && v.length <= 120)
          .slice(0, 40)
      : [];
    if (labels.length === 0) return { status: "off" };
    return { status: "ok", skillLabels: labels };
  } catch (e) {
    // The enhancement is best-effort — a runtime failure degrades to the
    // deterministic-only review, never to an error surface.
    console.error("[cv-ai-structuring] failed:", e);
    return { status: "off" };
  }
}
