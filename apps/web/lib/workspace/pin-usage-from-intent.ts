import type { ConversationIntent } from "@/lib/conversation/intent-router";

import { isPinnableRef } from "./pins-model";

/**
 * MY SPACE — usage detection for the TYPED sentence (owner contract
 * 2026-09-04 §4C: "the system may detect repeated usage and ASK").
 *
 * A chip click already counts as a use of its reference. A person who never
 * clicks a chip but types "užrašyk darbą" three times a week is using the
 * same canonical surface — so the sentence counts for the SAME reference the
 * chip would carry, never a second key space. The map is deliberately
 * closed: an intent that answers with a route chip, a blocked answer, a
 * question back, or a one-off entity is not a surface worth pinning.
 *
 * `company` marks references that only exist inside a company workspace; in
 * the personal space the same sentence gets the honest bridge answer and
 * counts nothing.
 */
const SENTENCE_REFS: Partial<Record<ConversationIntent, { ref: string; company?: true }>> = {
  "log-work": { ref: "logwork" },
  "find-work": { ref: "jobs" },
  opportunities: { ref: "jobs" },
  cv: { ref: "cv" },
  "player-card": { ref: "cv" },
  profile: { ref: "profile" },
  offers: { ref: "offers" },
  "calendar-view": { ref: "agenda" },
  engagements: { ref: "engagements" },
  documents: { ref: "documents-centre" },
  "learning-compass": { ref: "compass-page" },
  projects: { ref: "projects", company: true },
  candidates: { ref: "candidates", company: true },
  "find-workers": { ref: "candidates", company: true },
  "need-workers": { ref: "f:company.create-demand", company: true },
  "client-demand": { ref: "agency:demand", company: true },
  "proposal-status": { ref: "agency:progress", company: true },
  "invite-client": { ref: "f:agency.invite-client", company: true },
  "invite-candidate": { ref: "f:company.invite-worker", company: true },
  "invite-student": { ref: "f:company.invite-learner", company: true },
  "create-project": { ref: "f:company.create-project", company: true },
};

export type SentenceIdentity = "company" | "person";

/** The pin reference a typed sentence is a use of, or null when the sentence
 *  is not a use of a pinnable surface for this identity. */
export function pinRefForSentence(intent: ConversationIntent, identity: SentenceIdentity): string | null {
  const row = SENTENCE_REFS[intent];
  if (!row) return null;
  if (row.company && identity !== "company") return null;
  return isPinnableRef(row.ref) ? row.ref : null;
}

/** Every reference the map can produce — for the guard, so a ref the chat
 *  cannot resolve is refused at test time, never as a dead pin. */
export const SENTENCE_PIN_REFS: readonly string[] = [...new Set(Object.values(SENTENCE_REFS).map((r) => r.ref))];
