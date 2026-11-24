import {
  ELIGIBLE_INTERACTION_KINDS,
  type EligibleInteractionKind,
} from "./experience-eligibility";

/**
 * W6 slice 3D — the `?interaction=` token: `kind:uuid`.
 *
 * A PURE module with no `server-only` import, deliberately. The token is
 * parsed on BOTH sides of the boundary — the workspace hook validates it
 * before it becomes state, and `experience-entry.ts` validates it again
 * before it can reach a read — and the two must not be able to disagree about
 * what a valid token is. One implementation is how that is guaranteed.
 *
 * VALIDATION HERE IS NOT AUTHORIZATION. A well-formed token says only that
 * someone named an interaction kind and a uuid. Whether the viewer is a party
 * to it, whether it is finished, who the subject is, and whether they already
 * described it are all decided server-side against the canonical row — and
 * then a second time inside `submit_experience_record`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedInteractionToken = {
  readonly kind: EligibleInteractionKind;
  readonly interactionId: string;
};

/** Null for anything that is not a contract kind + a real uuid. */
export function parseInteractionToken(
  token: string | null | undefined,
): ParsedInteractionToken | null {
  if (typeof token !== "string") return null;
  const sep = token.indexOf(":");
  if (sep < 1) return null;
  const kind = token.slice(0, sep);
  const interactionId = token.slice(sep + 1);
  if (!(ELIGIBLE_INTERACTION_KINDS as readonly string[]).includes(kind)) return null;
  if (!UUID_RE.test(interactionId)) return null;
  return { kind: kind as EligibleInteractionKind, interactionId };
}

export function serializeInteractionToken(
  kind: EligibleInteractionKind,
  interactionId: string,
): string {
  return `${kind}:${interactionId}`;
}

/** Re-serialize rather than pass a raw token through: what a loader is asked
 *  for is then exactly what was validated, in canonical form. */
export function canonicalInteractionToken(token: string | null | undefined): string | null {
  const parsed = parseInteractionToken(token);
  return parsed ? serializeInteractionToken(parsed.kind, parsed.interactionId) : null;
}
