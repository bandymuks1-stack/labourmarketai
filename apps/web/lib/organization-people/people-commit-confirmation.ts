import "server-only";

import { createHash } from "node:crypto";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "@/lib/capabilities/confirmable";

import { peopleToCreate, type IngestPlan } from "./ingest-core";

/**
 * ONE COMMIT CONFIRMATION FOR PEOPLE INGESTION — the same gate the evidence
 * import uses, applied to the roster half.
 *
 * The rule this enforces is the owner's: **a file arriving is not a commit.**
 * An assistant may only commit people it has ALREADY SHOWN, and only exactly
 * those people. It cannot invent a roster from a sentence, and it cannot
 * quietly widen a previewed batch on the way to the write.
 *
 * ── WHY THE TOKEN IS GENUINELY ONE-TIME ────────────────────────────────────
 * It binds to the EXACT set of people the preview said it would create.
 * Committing puts those people on the roster; the next preview therefore
 * classifies them `already_on_roster`, they stop being creatable, the
 * fingerprint moves, and a replayed token fails as stale. A constant
 * fingerprint would have made "one-time" a lie with an expiry attached.
 *
 * It is defence in depth, not the only defence: `commitPeopleIngest` re-plans
 * against the roster AS IT IS at write time and refuses while anything is
 * unresolved, so even a bypassed token cannot create a duplicate person or
 * settle an ambiguity on its own.
 *
 * The token carries NO personal data. Names are hashed into the fingerprint,
 * never stored in it, so a token in a chat transcript or a log discloses
 * nothing about who is on a roster.
 */

/** The action id both legs sign under. */
export const PEOPLE_COMMIT_ACTION_ID = "people.ingest.commit";

/** The DRAFT IDENTITY — what the caller asked for, and the only part a client
 *  can restate. Normalized so both legs hash identically. */
export function peopleCommitHashInput(opts: {
  readonly organizationId: string;
  readonly relationship: string;
}): Record<string, unknown> {
  return { organizationId: opts.organizationId, relationship: opts.relationship };
}

/**
 * The STATE the preview actually showed: which people would be written.
 *
 * Keyed on the NORMALIZED name plus the organization's own reference — the
 * same pair the roster's uniqueness is expressed in — so the fingerprint
 * moves the moment the set to create changes, and hashed so no name travels
 * inside a token.
 */
export function peopleReadyFingerprint(plan: IngestPlan): string {
  const rows = peopleToCreate(plan)
    .map((r) => `${r.normalizedName}\u0000${r.externalRef ?? ""}\u0000${r.relationshipKind}`)
    .sort();
  const digest = createHash("sha256")
    .update(`people-ingest-ready:v1:${rows.join("")}`)
    .digest("hex");
  return `people-ingest-ready:v1:${rows.length}:${digest}`;
}

export function mintPeopleCommitToken(opts: {
  readonly organizationId: string;
  readonly relationship: string;
  readonly userId: string;
  readonly plan: IngestPlan;
}): string {
  return mintCapabilityConfirmation({
    actionId: PEOPLE_COMMIT_ACTION_ID,
    input: peopleCommitHashInput(opts),
    userId: opts.userId,
    stateFingerprint: peopleReadyFingerprint(opts.plan),
  });
}

export async function verifyPeopleCommitToken(opts: {
  readonly token: string;
  readonly organizationId: string;
  readonly relationship: string;
  readonly userId: string;
  readonly plan: IngestPlan;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  return verifyCapabilityConfirmation({
    actionId: PEOPLE_COMMIT_ACTION_ID,
    token: opts.token,
    input: peopleCommitHashInput(opts),
    userId: opts.userId,
    currentStateFingerprint: peopleReadyFingerprint(opts.plan),
  });
}
