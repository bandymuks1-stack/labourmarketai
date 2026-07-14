"use server";

import "server-only";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import type { AiLocale } from "@/lib/ai/runtime/types";
import {
  mapWorkJournalSuggestions,
  type JournalAiSuggestions,
  type WorkJournalEnvelopeData,
} from "./journal-ai-suggestions-model";

/**
 * Journal Proof Engine v1 (Sprint v2 §3) — OPTIONAL AI suggestions from ONE
 * journal entry draft, inside the real workflow (the composer's structured
 * review step), never a standalone AI page.
 *
 * The deterministic lexicon recognition (lib/structuring) is the ALWAYS-ON
 * layer; this action only ADDS labelled candidates when the owner has enabled
 * the existing AI runtime (AI_PROVIDER_MODE=live + AI_API_KEY — see
 * lib/ai/runtime). It reuses the registered `work_journal` agent (v1.1,
 * suggestion-only system prompt; routed as `normalize_work_scope`, low_cost
 * tier, small cost ceiling) through the shared router, so every live run is
 * cost-routed and audit-logged append-only (ai_runs) exactly like the CV flow
 * (§7.1 — extraction runs are logged; input content never is).
 *
 * ONLY the worker's own entry draft text is sent (data minimisation — no
 * contact data, no photos, no ids). Every returned item is a CANDIDATE:
 *   skills      → the SAME self-declared-claim chip flow as today;
 *   achievements→ a proposed worker_achievements row (user confirms);
 *   experience  → a proposed self-declared work-history period (user confirms);
 *   projects    → names matched against the worker's OWN engagements (user
 *                 confirms the link by picking the context).
 * Nothing is persisted here — confirm actions live with their sections.
 *
 * Honest fallback: runtime disabled/unavailable/empty → `{ status: "off" }`
 * and the UI shows an honest "not enabled" line — no fake AI badge, no error
 * noise, deterministic suggestions unaffected.
 */

export type JournalAiSuggestionsResult =
  | ({ status: "ok" } & JournalAiSuggestions)
  | { status: "off" };

const SUPPORTED: ReadonlySet<string> = new Set(["en", "lt", "ru"]);

export async function aiJournalEntrySuggestions(
  text: string,
  locale: string,
): Promise<JournalAiSuggestionsResult> {
  const rawText = (text ?? "").trim().slice(0, 8000);
  if (rawText.length < 20) return { status: "off" };

  const aiLocale: AiLocale = SUPPORTED.has(locale) ? (locale as AiLocale) : "en";
  try {
    const outcome = await runAiAgent(
      "work_journal",
      { rawText },
      { locale: aiLocale, inputSource: "journal_entry_draft" },
    );
    if (outcome.status !== "suggestion") return { status: "off" };
    const data = (outcome.value as { data?: WorkJournalEnvelopeData })?.data;
    const mapped = mapWorkJournalSuggestions(data);
    if (mapped === null) return { status: "off" };
    return { status: "ok", ...mapped };
  } catch (e) {
    // Best-effort enhancement — a runtime failure degrades to the
    // deterministic-only review, never to an error surface.
    console.error("[journal-ai-suggestions] failed:", e);
    return { status: "off" };
  }
}
