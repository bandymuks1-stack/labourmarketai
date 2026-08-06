import {
  PRODUCTION_PROJECT_REF,
  decodeJwtClaims,
  keyProjectRef,
  redactKey,
} from "./local-supabase-guard";

/**
 * THE PRODUCTION QA IDENTITY GUARD — the mirror image of the local one.
 *
 * `local-supabase-guard.ts` refuses to touch anything that is not the local
 * stack. That guard is deliberately absolute and **is not weakened here**: the
 * owner's authorisation was explicit that Auth, RLS and service-role protections
 * must not be loosened. So this is a SEPARATE, NARROWER guard on a different
 * axis, and both stay fail-closed:
 *
 *   local-supabase-guard   → the target must be the LOCAL stack.
 *   prod-qa-guard (this)   → the target must be PRODUCTION **and** the identity
 *                            must be exactly the one allowlisted synthetic QA
 *                            account.
 *
 * Sharing code between them was considered and rejected. A single "flexible"
 * helper with a mode flag is one edit away from minting a production session
 * for an arbitrary email, and that edit would look innocuous in review. Two
 * small guards that each refuse everything outside their one job cannot be
 * merged into that mistake by accident. This is the rare case where duplication
 * is the safety property.
 *
 * WHAT THIS GUARD DOES NOT DO
 *  - It is not an endpoint. Nothing in the app imports it; it exists for
 *    scripts run from a developer machine or CI. There is no route, no server
 *    action and no public surface that can reach it.
 *  - It never creates an identity. Provisioning the account is an owner action
 *    (`scripts/prod-qa-provision.ts` refuses to run without an explicit
 *    acknowledgement flag and is documented as owner-run).
 *  - It never accepts a password. The QA session is minted through a
 *    magic-link OTP, so no password for this account exists to leak.
 */

/** Refusal code — grep-able, and the only thing printed on refusal. */
export const QA_REFUSAL_CODE = "REFUSED_NON_QA_PRODUCTION_IDENTITY";

export class ProdQaGuardError extends Error {
  constructor(reason: string) {
    super(`${QA_REFUSAL_CODE}: ${reason}`);
    this.name = "ProdQaGuardError";
  }
}

/**
 * THE ALLOWLISTED SYNTHETIC IDENTITIES.
 *
 * Hard-coded on purpose. If this were an environment variable, the allowlist
 * would be whatever the caller's shell happened to say, which is not an
 * allowlist. Widening it is a code change, in a diff, in a PR — which is
 * exactly the review surface an identity with production access deserves.
 *
 * `+` addressing keeps each unmistakably synthetic and routable to a real
 * mailbox the owner controls, without inventing a domain.
 *
 * 2026-08-06 (owner PROD_QA approval, prod-qa-account.md v2): the single v1
 * identity `qa.worker+goal3@` was REPLACED by the three `+multiw` identities
 * of the approved multi-W write journey. The old address was never
 * provisioned; its authorisation is superseded, so keeping it listed would
 * only widen the surface for nothing.
 */
export const PROD_QA_OWNER_EMAIL = "qa.owner+multiw@labourmarket.ai" as const;
export const PROD_QA_MANAGER_EMAIL = "qa.manager+multiw@labourmarket.ai" as const;
export const PROD_QA_WORKER_EMAIL = "qa.worker+multiw@labourmarket.ai" as const;

/** Every allowlisted synthetic identity. Exactly these three, by owner
 *  decision — equality-matched, never prefix or pattern. */
export const PROD_QA_IDENTITIES: readonly string[] = [
  PROD_QA_OWNER_EMAIL,
  PROD_QA_MANAGER_EMAIL,
  PROD_QA_WORKER_EMAIL,
];

export const PRODUCTION_ORIGIN = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

export interface ProdQaTargetInput {
  readonly url: string | undefined;
  readonly email: string | undefined;
  /** Optional — validated when present. Never logged. */
  readonly serviceKey?: string;
  readonly anonKey?: string;
}

export interface ProdQaTarget {
  readonly origin: string;
  readonly projectRef: string;
  readonly email: string;
}

/**
 * Assert this is the production project AND the one synthetic QA identity, or
 * throw. Every check below is independently sufficient to refuse.
 */
export function assertProdQaTarget(input: ProdQaTargetInput): ProdQaTarget {
  const { url, email, serviceKey, anonKey } = input;

  if (!url) {
    throw new ProdQaGuardError(
      "no Supabase URL was supplied. This helper never guesses a target.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProdQaGuardError(`the Supabase URL is not parseable: ${url}`);
  }

  // 1. Production, and only production. A loopback target here means the caller
  //    reached for the wrong script — `e2e-mint-session.ts` is the local one.
  if (parsed.origin !== PRODUCTION_ORIGIN) {
    throw new ProdQaGuardError(
      `target origin ${parsed.origin} is not the production project ` +
        `(${PRODUCTION_ORIGIN}). For local work use e2e-mint-session.ts.`,
    );
  }

  // 2. The identity must be EXACTLY one of the allowlisted synthetic accounts.
  //    Compared case-insensitively after trimming, and never by prefix or
  //    pattern — "starts with qa." would let `qa.anything@` through.
  const normalised = (email ?? "").trim().toLowerCase();
  if (!normalised) {
    throw new ProdQaGuardError("no identity was supplied.");
  }
  if (!PROD_QA_IDENTITIES.includes(normalised)) {
    throw new ProdQaGuardError(
      `"${normalised}" is not the allowlisted synthetic QA identity. ` +
        "This helper can only ever act for a single, code-reviewed account; " +
        "it must never be pointed at a real user.",
    );
  }

  // 3. Any supplied key must belong to THIS project. A key for another project
  //    reaching a production script is a misconfiguration worth stopping on.
  for (const [label, key] of [
    ["service", serviceKey],
    ["anon", anonKey],
  ] as const) {
    if (!key) continue;
    const ref = keyProjectRef(key);
    if (ref && ref !== PRODUCTION_PROJECT_REF) {
      throw new ProdQaGuardError(
        `the ${label} key belongs to project "${ref}", not ` +
          `"${PRODUCTION_PROJECT_REF}" (${redactKey(key)}).`,
      );
    }
    if (!decodeJwtClaims(key)) {
      throw new ProdQaGuardError(
        `the ${label} key is not a decodable Supabase key (${redactKey(key)}).`,
      );
    }
  }

  return {
    origin: parsed.origin,
    projectRef: PRODUCTION_PROJECT_REF,
    email: normalised,
  };
}

/** Human-readable target line. Contains no key material, ever. */
export function describeProdQaTarget(t: ProdQaTarget): string {
  return `production QA target: origin=${t.origin} projectRef=${t.projectRef} identity=${t.email}`;
}
