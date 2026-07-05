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
 *   - direct → the counterparty is KNOWN only when the caller supplies a REAL
 *     `counterpartName` obtained through the safe counterpart identity reader
 *     (readCounterpartIdentities — the §8.1 permission-gated RPC that returns
 *     only the other unrevoked participant's display name of a 2-person direct
 *     thread the viewer participates in). Without a permitted name the
 *     counterparty stays in the RESTRICTED / details-not-shown-yet state, NOT a
 *     normal "unspecified recipient" — a system-limited lock chip, never an
 *     invented name.
 *   - team → always RESTRICTED (the identity reader is deliberately
 *     direct-only; a multi-party roster is not a single counterpart).
 *     Scope stays honest-unknown ("Kontekstas nepatikslintas").
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
  /**
   * The counterpart's REAL display name — present ONLY when the caller passed
   * a permitted, non-empty `counterpartName` from the safe identity reader
   * (§8.1). `null` otherwise; the UI must then fall back to the i18n key and
   * never invent a name.
   */
  readonly counterpartyName: string | null;
  /** True when the counterparty is honestly known (e.g. the support team). */
  readonly counterpartyKnown: boolean;
  /**
   * True when the counterparty is in a RESTRICTED / details-not-shown-yet
   * state — the conversation is real but its co-participant identity is not
   * read by the current query (owner-gated bridge). The UI must render this as
   * a system-limited / locked state, never as a normal participant name and
   * never as a bland "unspecified recipient". Mutually exclusive with
   * `counterpartyKnown`.
   */
  readonly counterpartyRestricted: boolean;
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

/** Build the honest card model from a conversation's real `kind` (+ creator +
 *  an optional PERMITTED counterpart name from the safe identity reader). */
export function describeConversationCard(input: {
  kind: string;
  createdBy?: string | null;
  viewerId?: string | null;
  /** Real display name from readCounterpartIdentities (§8.1) — direct only.
   *  Absent/blank → the counterpart stays honestly restricted. */
  counterpartName?: string | null;
}): ConversationCardModel {
  const kind = normalizeKind(input.kind);
  const typeKey = `kind.${kind}`;
  const originKey = deriveOriginKey(input.createdBy, input.viewerId);

  if (kind === "support") {
    return {
      typeKey,
      counterpartyKey: "counterparty.support",
      counterpartyName: null,
      counterpartyKnown: true,
      counterpartyRestricted: false,
      scopeKey: "scope.support",
      scopeKnown: true,
      originKey,
    };
  }

  // direct with a PERMITTED real name (safe identity reader, §8.1): the
  // counterpart is honestly known. Only a non-empty trimmed name counts —
  // nothing is ever fabricated. Team conversations never take a name here
  // (the reader is direct-only), so they stay restricted below.
  const permittedName =
    kind === "direct" ? (input.counterpartName ?? "").trim() : "";
  if (permittedName.length > 0) {
    return {
      typeKey,
      counterpartyKey: "counterparty.permitted",
      counterpartyName: permittedName,
      counterpartyKnown: true,
      counterpartyRestricted: false,
      scopeKey: "scope.unknown",
      scopeKnown: false,
      originKey,
    };
  }

  // direct / team without a permitted identity: the conversation is real but
  // its co-participant identity is not readable by this viewer (permission
  // model, §8.1). Surface a RESTRICTED / details-not-shown-yet state — never
  // a fake name, never a bland "unspecified recipient". Scope stays
  // honest-unknown.
  return {
    typeKey,
    counterpartyKey: "counterparty.restricted",
    counterpartyName: null,
    counterpartyKnown: false,
    counterpartyRestricted: true,
    scopeKey: "scope.unknown",
    scopeKnown: false,
    originKey,
  };
}
