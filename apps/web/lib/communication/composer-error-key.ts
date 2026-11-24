/**
 * The composer shows a send failure in the READER's language, from the
 * failure CODE — never the server's message text. The server text is a
 * Lithuanian operator line (and once carried raw database error text), so a
 * Swedish, English or Polish sender saw Lithuanian and SQL (chat audit
 * 2026-11-11, defect 6). Every code maps to a key under
 * `communication.composer.errors`; an unknown code gets the generic one.
 * Pure, client-safe.
 */
export const COMPOSER_ERROR_KEYS = {
  not_authenticated: "notAuthenticated",
  invalid_input: "invalidInput",
  not_a_participant: "notParticipant",
  conversation_not_found: "notParticipant",
  no_permission: "notParticipant",
  rate_limited: "rateLimited",
  rate_check_unavailable: "rateCheckUnavailable",
  rpc_unavailable: "attachmentsUnavailable",
} as const satisfies Readonly<Record<string, string>>;

export type ComposerErrorKey =
  | (typeof COMPOSER_ERROR_KEYS)[keyof typeof COMPOSER_ERROR_KEYS]
  | "sendFailed";

export const COMPOSER_ERROR_KEY_SET: readonly ComposerErrorKey[] = [
  ...new Set<ComposerErrorKey>([...Object.values(COMPOSER_ERROR_KEYS), "sendFailed"]),
];

export function composerErrorKey(code: string | null | undefined): ComposerErrorKey {
  return (code && (COMPOSER_ERROR_KEYS as Record<string, ComposerErrorKey>)[code]) || "sendFailed";
}
