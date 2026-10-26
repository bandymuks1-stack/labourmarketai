/**
 * The counterpart identity RPC (`conversation_counterpart_identities`) names a
 * candidate who has not disclosed their name with a fixed, locale-free
 * pseudonym: `Candidate ` + the first six id characters, upper-cased (the same
 * form as `anonymizedWorkerLabel`). This module turns that pseudonym into the
 * reader's own catalogue word; any other name passes through unchanged.
 *
 * Pure: no IO, no next-intl import — the caller supplies the formatter.
 */
const PSEUDONYM_RE = /^Candidate ([A-Z0-9]{1,6})$/;

export function pseudonymToken(name: string): string | null {
  const m = PSEUDONYM_RE.exec(name.trim());
  return m ? m[1]! : null;
}

export function localizePseudonymousName(
  name: string,
  candidateName: (token: string) => string,
): string {
  const token = pseudonymToken(name);
  return token === null ? name : candidateName(token);
}
