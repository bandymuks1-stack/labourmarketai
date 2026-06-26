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
  /**
   * i18n key (under `communication`) for who STARTED the thread — derived only
   * from the real `conversations.created_by` vs the viewer's id (RLS-safe: the
   * row is already readable by the viewer). `null` when `created_by` is missing
   * (then render nothing — never guess). This is the one real, fake-free context
   * signal available without a co-participant profile read or a schema link:
   * "did I reach out, or did someone reach out to me?"
   */
  readonly originKey: string | null;
}

/**
 * Honest "who started this thread" key from the real creator vs the viewer.
 * Returns null when it cannot be known (no created_by / no viewer) so the UI
 * renders nothing rather than inventing an origin. Never reveals WHO the other
 * party is — only whether the viewer themselves started the conversation.
 */
export function deriveOriginKey(
  createdBy: string | null | undefined,
  viewerId: string | null | undefined,
): string | null {
  if (!createdBy || !viewerId) return null;
  return createdBy === viewerId ? "origin.you" : "origin.other";
}

/** Build the honest card model from a conversation's real `kind` (+ creator). */
export function describeConversationCard(input: {
  kind: string;
  createdBy?: string | null;
  viewerId?: string | null;
}): ConversationCardModel {
  const kind = normalizeKind(input.kind);
  const typeKey = `kind.${kind}`;
  const originKey = deriveOriginKey(input.createdBy, input.viewerId);

  if (kind === "support") {
    return {
      typeKey,
      counterpartyKey: "counterparty.support",
      counterpartyKnown: true,
      scopeKey: "scope.support",
      scopeKnown: true,
      originKey,
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
    originKey,
  };
}
