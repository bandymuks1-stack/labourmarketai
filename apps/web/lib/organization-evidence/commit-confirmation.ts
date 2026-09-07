import "server-only";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "@/lib/capabilities/confirmable";

/**
 * ONE COMMIT CONFIRMATION, SHARED BY THE HUMAN UI AND BY AN AGENT.
 *
 * The owner requirement is that the web import and an authorized assistant use
 * the same implementation, not two that merely look alike. The riskiest place
 * for those to drift is the commit gate — so the gate lives here, once, and
 * both callers import it:
 *
 *   · the web page previews, puts the token in a hidden field, and the commit
 *     server action verifies it;
 *   · `evidence.import.preview` mints the same token and
 *     `evidence.import.commit` verifies it the same way.
 *
 * ── WHY THE TOKEN IS GENUINELY ONE-TIME ────────────────────────────────────
 * It binds to the EXACT set of rows the preview showed as ready. Committing
 * turns those rows into stored records; the next preview therefore classifies
 * them as `duplicate`, they stop being ready, the fingerprint moves, and a
 * replayed token fails as stale. A constant fingerprint would have made
 * "one-time" a lie with a five-minute expiry.
 *
 * It is defence in depth, not the only defence: `commitImport` writes every
 * ready row in ONE upsert keyed on `(organization_id, record_fingerprint)`
 * with `ignoreDuplicates`, so even a bypassed token cannot import a fact twice.
 */

/** The action id both transports sign under. */
export const COMMIT_ACTION_ID = "evidence.import.commit";

/** The DRAFT IDENTITY — what the caller asked for, and the only part a client
 *  can restate. Normalized so both legs hash identically. */
export function commitHashInput(sessionId: string): Record<string, unknown> {
  return { sessionId };
}

/** The STATE the preview actually showed: which rows would be written. */
export function readyFingerprint(
  rows: readonly { readonly id: string }[],
): string {
  return `evidence-import-ready:v1:${rows
    .map((r) => r.id)
    .sort()
    .join(",")}`;
}

export function mintCommitToken(opts: {
  readonly sessionId: string;
  readonly userId: string;
  readonly readyRows: readonly { readonly id: string }[];
}): string {
  return mintCapabilityConfirmation({
    actionId: COMMIT_ACTION_ID,
    input: commitHashInput(opts.sessionId),
    userId: opts.userId,
    stateFingerprint: readyFingerprint(opts.readyRows),
  });
}

export function verifyCommitToken(opts: {
  readonly token: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly readyRows: readonly { readonly id: string }[];
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  return verifyCapabilityConfirmation({
    actionId: COMMIT_ACTION_ID,
    token: opts.token,
    input: commitHashInput(opts.sessionId),
    userId: opts.userId,
    currentStateFingerprint: readyFingerprint(opts.readyRows),
  });
}
