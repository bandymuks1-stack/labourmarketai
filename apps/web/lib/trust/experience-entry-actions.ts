"use server";

import "server-only";

import {
  listExperienceInvitations,
  loadExperienceSubmitContext,
  parseInteractionToken,
  type ExperienceInvitationsResult,
  type ExperienceSubmitContext,
} from "./experience-entry";

/**
 * W6 slice 3D — the two server actions the conversation and the result panel
 * call. Thin by design: every decision lives in `experience-entry.ts`, and
 * the only thing added here is that a client-supplied token is PARSED AND
 * VALIDATED before it can reach a read.
 *
 * The token is the whole of what a client may say about which interaction it
 * means, and even that is re-derived on the far side.
 */

export async function loadExperienceInvitationsAction(): Promise<ExperienceInvitationsResult> {
  return listExperienceInvitations();
}

export async function loadExperienceSubmitContextAction(
  token: string,
): Promise<ExperienceSubmitContext> {
  const parsed = parseInteractionToken(token);
  // A malformed token is answered exactly like an interaction the viewer has
  // no part in — there is no separate "you typed it wrong" state to probe.
  if (!parsed) return { state: "not_eligible", reason: "not_available" };
  return loadExperienceSubmitContext(parsed.kind, parsed.interactionId);
}
