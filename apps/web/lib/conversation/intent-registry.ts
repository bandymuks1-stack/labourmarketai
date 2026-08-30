import type { ConversationIntent } from "./intent-router";

/**
 * THE INTENT REGISTRY (chat-first audit 2026-08-30, gap G2) — the declarative
 * intent→handling table the conversation chat dispatches through.
 *
 * Before this table the actual routing lived inline in
 * `conversation-chat.tsx` (a workflow map + an if-chain + a switch): the
 * product's own sentence vocabulary could not be ENUMERATED, so nothing could
 * audit it — not the fallback copy (G15), not per-locale coverage (G3), not
 * the read/write classification. `action-registry.ts` and
 * `result-registry.ts` were already declarative; the door between them was
 * not.
 *
 * This is a MECHANICAL extraction, not new behavior: every descriptor names a
 * handler the component still owns (the handlers close over component state —
 * flows, labels, identity — which is exactly why the registry carries handler
 * IDS, not functions). `Record<RoutedIntent, …>` and
 * `Record<IntentHandlerId, …>` make the coupling exhaustive in BOTH
 * directions at compile time: a new `ConversationIntent` without a row here,
 * or a row naming a handler the component does not implement, is a type
 * error, never a silent fallthrough to the generic fallback.
 */

/** Every intent the router can classify, minus the not-understood sentinel. */
export type RoutedIntent = Exclude<ConversationIntent, "unknown">;

/** Where in the product the intent lands — enumerable audit metadata. */
export type IntentDomain =
  | "journal"
  | "matching"
  | "profile"
  | "cv"
  | "communication"
  | "time"
  | "context"
  | "company"
  | "admin"
  | "value"
  | "money"
  | "project";

/**
 * What the intent can lead to. HONEST classification, not aspiration:
 * - `read`   — renders recorded facts / opens a read projection; writes nothing.
 * - `write`  — opens a flow that can persist (always behind its own explicit
 *              user confirmation; the intent itself never writes).
 * - `route`  — answers with a `link:` chip to the ONE canonical surface
 *              rather than growing a second view of it inside the chat.
 * - `blocked`— honest degradation: the engine does not exist, so the answer
 *              says so and fakes nothing (doctrine §7 / §18).
 */
export type IntentAccess = "read" | "write" | "route" | "blocked";

/** The component-bound handler each intent resolves to. Several intents may
 *  share one handler (one question, one engine — never two stacks). */
export type IntentHandlerId =
  | "findWork"
  | "skillGap"
  | "recentJournal"
  | "figures"
  | "openProject"
  | "findWorkers"
  | "contextReadback"
  | "interestInbox"
  | "switchContext"
  | "profileSummary"
  | "nextActionSummary"
  | "resumeSummary"
  | "criteria"
  | "playerCard"
  | "engagements"
  | "experiences"
  | "agenda"
  | "cvChip"
  | "offersChip"
  | "logWork"
  | "needWorkers"
  | "needService"
  | "offerValue"
  | "companyOverview"
  | "createOrganization"
  | "lmc"
  | "adminApprovals"
  | "adminRequests"
  | "reminderBlocked"
  | "translateBlocked"
  | "messages"
  | "writeEmployer";

export type IntentDescriptor = {
  domain: IntentDomain;
  access: IntentAccess;
  handler: IntentHandlerId;
  /**
   * true — the handler runs a real async read/workflow and shows its OWN
   * typing cue; false — the dispatcher wraps it in the thread's synchronous
   * typing tick (the old `withTyping(switch …)` group). This flag exists so
   * the extraction changes NOTHING about when the typing indicator shows.
   */
  ownTyping: boolean;
};

export const INTENT_REGISTRY: Readonly<Record<RoutedIntent, IntentDescriptor>> = {
  // ── AI-workspace goals (W4): real workflows over canonical reads ─────────
  "find-work": { domain: "matching", access: "read", handler: "findWork", ownTyping: true },
  // "Kokias galimybes man gali pasiūlyti?" is the SAME question as "rask man
  // darbą", so it runs the SAME engine — one matching pipeline, one result
  // surface, no second stack.
  opportunities: { domain: "matching", access: "read", handler: "findWork", ownTyping: true },
  "skill-gap": { domain: "profile", access: "read", handler: "skillGap", ownTyping: true },
  "journal-recent": { domain: "journal", access: "read", handler: "recentJournal", ownTyping: true },
  figures: { domain: "journal", access: "read", handler: "figures", ownTyping: true },
  "open-project": { domain: "project", access: "read", handler: "openProject", ownTyping: true },
  "find-workers": { domain: "matching", access: "read", handler: "findWorkers", ownTyping: true },
  context: { domain: "context", access: "read", handler: "contextReadback", ownTyping: true },
  // Routed by IDENTITY inside the handler; the ambiguous dual-role case is
  // ASKED, never guessed (guard: interest-inbox-asks-not-guesses).
  "interest-inbox": { domain: "matching", access: "read", handler: "interestInbox", ownTyping: true },

  // ── flows with their own async server read + typing cue ──────────────────
  // ONE ACTIVE CONTEXT by sentence (G1). A write: it changes the active
  // workspace — via the ONE existing switching mechanism, chip-confirmed.
  "switch-context": { domain: "context", access: "write", handler: "switchContext", ownTyping: true },
  profile: { domain: "profile", access: "read", handler: "profileSummary", ownTyping: true },
  "next-action": { domain: "profile", access: "read", handler: "nextActionSummary", ownTyping: true },
  resume: { domain: "profile", access: "read", handler: "resumeSummary", ownTyping: true },
  criteria: { domain: "matching", access: "read", handler: "criteria", ownTyping: true },
  "player-card": { domain: "cv", access: "read", handler: "playerCard", ownTyping: true },
  engagements: { domain: "context", access: "read", handler: "engagements", ownTyping: true },
  experiences: { domain: "profile", access: "read", handler: "experiences", ownTyping: true },
  "calendar-view": { domain: "time", access: "read", handler: "agenda", ownTyping: true },

  // ── synchronous answers inside the thread's typing tick ──────────────────
  cv: { domain: "cv", access: "read", handler: "cvChip", ownTyping: false },
  offers: { domain: "matching", access: "read", handler: "offersChip", ownTyping: false },
  // Opens the confirm-gated journal write flow — the intent itself persists
  // nothing; the flow's explicit save does.
  "log-work": { domain: "journal", access: "write", handler: "logWork", ownTyping: false },
  // Opens the canonical demand-intake form (identity-gated in the handler).
  "need-workers": { domain: "company", access: "write", handler: "needWorkers", ownTyping: false },
  "need-service": { domain: "value", access: "route", handler: "needService", ownTyping: false },
  // V9/V10: reads the statement, runs channel discovery, renders honest
  // options — state only, nothing persisted.
  "offer-value": { domain: "value", access: "read", handler: "offerValue", ownTyping: false },
  "company-overview": { domain: "company", access: "route", handler: "companyOverview", ownTyping: false },
  "create-organization": { domain: "company", access: "route", handler: "createOrganization", ownTyping: false },
  lmc: { domain: "money", access: "route", handler: "lmc", ownTyping: false },
  "admin-approvals": { domain: "admin", access: "route", handler: "adminApprovals", ownTyping: false },
  "admin-requests": { domain: "admin", access: "route", handler: "adminRequests", ownTyping: false },
  "messages-view": { domain: "communication", access: "read", handler: "messages", ownTyping: false },

  // ── honest degradation: no engine, no fake (doctrine §7/§18) ─────────────
  reminder: { domain: "time", access: "blocked", handler: "reminderBlocked", ownTyping: false },
  translate: { domain: "communication", access: "blocked", handler: "translateBlocked", ownTyping: false },
  // Neither acts nor refuses cleanly — recorded as gap G18; the registry
  // states what IS, not what should be.
  "write-employer": { domain: "communication", access: "blocked", handler: "writeEmployer", ownTyping: false },
};

/** The component supplies one implementation per declared handler id.
 *  Handlers close over the sentence and component state, so they take no
 *  arguments here. */
export type IntentHandlers = Readonly<Record<IntentHandlerId, () => void>>;

/**
 * THE one dispatch. `unknown` (and only `unknown`) goes to the fallback —
 * every routed intent resolves through its descriptor, preserving the exact
 * typing-cue behavior the inline routing had.
 */
export function dispatchIntent(
  intent: ConversationIntent,
  handlers: IntentHandlers,
  withTyping: (fn: () => void) => void,
  fallback: () => void,
): void {
  if (intent === "unknown") {
    withTyping(fallback);
    return;
  }
  const descriptor = INTENT_REGISTRY[intent];
  if (descriptor.ownTyping) {
    handlers[descriptor.handler]();
    return;
  }
  withTyping(() => handlers[descriptor.handler]());
}
