/**
 * THE WORK DAY THE ASSISTANT NAMED (owner P1 2026-11-22: one-tap journal).
 *
 * The header's journal button must open the day the person already told the
 * assistant ("Užpildyk vakarykštį darbo žurnalą" → yesterday), not today. That
 * day is never stored as a fact: it is read from the person's own sentences in
 * the chat goal with the SAME reader the chat files the entry with
 * (`worklogDraftFromEvidence`), so the button and the chat can never disagree.
 *
 * Two sources, one answer:
 *   - the chat is open → its live goal (passed by the chat to the header);
 *   - any other page → the goal the chat KEPT for this tab when it unmounted
 *     (`GOAL_ACROSS_PAGES_KEY`, same owner check, same 30-minute window).
 * Only a work-log goal names a day. Today, or no day, is `null`: the journal's
 * own default (no `?date=`).
 */

import type { ConversationGoal } from "@/lib/conversation/conversation-goal";
import { worklogDraftFromEvidence } from "@/lib/conversation/evidence-to-worklog";

/** Where the chat keeps its goal while it is unmounted by a page switch. */
export const GOAL_ACROSS_PAGES_KEY = "lm.chat.goalAcrossPages";
/** How long a kept goal may be taken back. */
export const GOAL_ACROSS_PAGES_TTL_MS = 30 * 60_000;

/** The day a work-log goal names, or `null` (today / not a work-log goal). */
export function assistantJournalDay(goal: ConversationGoal | null | undefined, today: string): string | null {
  if (!goal || goal.intent !== "log-work" || goal.said.length === 0) return null;
  const draft = worklogDraftFromEvidence({ said: goal.said, evidence: goal.evidence, today, latest: "" });
  return draft.date && draft.date !== today ? draft.date : null;
}

/** The day named by the goal the chat kept for this tab, for this owner. */
export function keptAssistantJournalDay(
  raw: string | null,
  owner: string,
  today: string,
  now: number = Date.now(),
): string | null {
  if (!raw) return null;
  try {
    const kept = JSON.parse(raw) as { owner?: unknown; at?: unknown; goal?: ConversationGoal | null };
    if (kept.owner !== owner || typeof kept.at !== "number" || now - kept.at >= GOAL_ACROSS_PAGES_TTL_MS) return null;
    return assistantJournalDay(kept.goal, today);
  } catch {
    return null;
  }
}
