/**
 * Conversation card display model (communication clarity v1, PR A).
 *
 * The thread list must never render a card where the user cannot tell WHO they
 * are talking to, WHAT type of conversation it is, and in WHICH context. The
 * real data model at the list level only carries `conversations.kind`
 * (direct | support | team) + subject — it does NOT carry participant identity
 * (RLS-scoped, not joined here) and conversations are NOT tied to a workspace.
 *
 * So this helper derives an HONEST card model from the real `kind` enum:
 *   - support → counterparty + scope are honestly KNOWN (the support team /
 *     support channel).
 *   - direct / team → counterparty and scope are honest-UNKNOWN. We say so
 *     ("Pašnekovas nepatikslintas" / "Kontekstas nepatikslintas") instead of
 *     pretending. Wiring real per-name identity + a real workspace link is a
 *     documented MISSING BRIDGE for PR B (see the audit doc).
 *
 * Pure + deterministic. Returns i18n keys RELATIVE to the `communication`
 * namespace, so the page (whose `t` is scoped to "communication") can render
 * them directly. No DB, no fake data.
 */

export type ConversationKind = "direct" | "support" | "team";

const KINDS: readonly ConversationKind[] = ["direct", "support", "team"];

export function normalizeKind(kind: string): ConversationKind {
  return (KINDS as readonly string[]).includes(kind)
    ? (kind as ConversationKind)
    : "direct";
}

export interface ConversationCardModel {
  /** i18n key (under `communication`) for the conversation type chip. */
  readonly typeKey: string;
  /** i18n key (under `communication`) for the counterparty line. */
  readonly counterpartyKey: string;
  /** True when the counterparty is honestly known; false = honest-unknown fallback. */
  readonly counterpartyKnown: boolean;
  /** i18n key (under `communication`) for the workspace/context line. */
  readonly scopeKey: string;
  /** True when the scope is honestly known; false = honest-unknown fallback. */
  readonly scopeKnown: boolean;
}

/** Build the honest card model from a conversation's real `kind`. */
export function describeConversationCard(input: { kind: string }): ConversationCardModel {
  const kind = normalizeKind(input.kind);
  const typeKey = `kind.${kind}`;

  if (kind === "support") {
    return {
      typeKey,
      counterpartyKey: "counterparty.support",
      counterpartyKnown: true,
      scopeKey: "scope.support",
      scopeKnown: true,
    };
  }

  // direct / team: no participant identity in the list query, no workspace link
  // in the schema → say so honestly rather than inventing one.
  return {
    typeKey,
    counterpartyKey: "counterparty.unknown",
    counterpartyKnown: false,
    scopeKey: "scope.unknown",
    scopeKnown: false,
  };
}
