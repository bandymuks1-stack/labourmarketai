/**
 * The words a person reads when a message cannot be sent or a conversation
 * cannot be opened. The server returns a CODE and a Lithuanian developer
 * `message`; the composers used to render that message verbatim, so an English
 * (or Swedish, German, Polish) person read Lithuanian (Swedish employer audit
 * 2026-11-11, N-3). The UI now renders the catalogue line for the code, in the
 * person's language; an unknown code reads as the generic line.
 */
export const COMMUNICATION_ERROR_CODES = [
  "invalid_input",
  "no_permission",
  "rate_limited",
  "rate_check_unavailable",
  "insert_failed",
  "not_a_participant",
  "rpc_unavailable",
  "not_authenticated",
  "update_failed",
] as const;

export type CommunicationErrorKey = (typeof COMMUNICATION_ERROR_CODES)[number] | "generic";

/** The `communication.errors.<key>` key for a server result code. Pure. */
export function communicationErrorKey(code: string | null | undefined): CommunicationErrorKey {
  return (COMMUNICATION_ERROR_CODES as readonly string[]).includes(code ?? "")
    ? (code as CommunicationErrorKey)
    : "generic";
}
