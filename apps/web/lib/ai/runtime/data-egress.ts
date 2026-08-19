/**
 * DATA EGRESS GATE — what may leave labourmarket.ai, and to whom.
 *
 * OWNER DECISION 2026-08-19 (AI DATA BOUNDARY), binding:
 *
 *   No external AI provider may receive labourmarket.ai internal, private or
 *   user information unless that transfer is explicitly permitted by this
 *   policy. By default NOTHING non-public leaves the project boundary: CVs and
 *   profile data, Work Journal content, worker and employer personal data,
 *   documents, absence / working-time / pay data, organisations' internal
 *   information, project / task / approval / audit information, contacts,
 *   credentials and secrets.
 *
 *   Local / on-prem models that do not physically move data outside our own
 *   infrastructure MAY work with internal information, subject to the user's
 *   own permissions and the task policy.
 *
 *   "€0 never grants permission to send data."
 *
 * ── WHAT THIS REPLACES, AND WHY THE OLD RULE WAS THE WRONG AXIS ────────────
 *
 * `data-sensitivity.ts` already vetoed a FREE cloud tier for personal data, on
 * the ground that a free service's consideration is sometimes the content. Good
 * rule, wrong axis: it sorted providers by PRICE, so a PAID cloud provider was
 * eligible for anyone's CV. The reasoning recorded there was that reaching a
 * paid provider "already required the owner to enable it under commercial
 * terms" — an enablement decision treated as if it were a data-transfer
 * decision. The owner has now separated them, and they are separate: paying a
 * vendor is not the same act as permitting it to process a worker's journal.
 *
 * So the axis is INTERNAL vs EXTERNAL, and permission is explicit:
 *
 *   - `local` — inside infrastructure we control. No egress occurs, so there is
 *     nothing to permit. Unrestricted here; the user's own permissions and the
 *     task policy still apply upstream.
 *   - anything else — external. Receives `PUBLIC` only, unless this file
 *     records a grant raising its ceiling.
 *
 * ── DEFAULT DENY IS THE POINT ──────────────────────────────────────────────
 *
 * `AI_EGRESS_GRANTS` is EMPTY, and that is the correct current state, not an
 * unfinished one. No external provider is enabled today, and no owner decision
 * has yet permitted any category of private content to leave. An empty grant
 * table means the gate is closed; adding a provider to the runtime cannot open
 * it as a side effect, because opening it is a separate, dated, sourced edit
 * here.
 *
 * Since no task is classed `PUBLIC` today (see `TASK_SENSITIVITY` — a recorded
 * finding, not an omission), the live consequence is: every task either runs on
 * a local model or does not run at all. `BLOCK external → try local → otherwise
 * fail safely`, which is exactly the owner's stated order.
 *
 * ── NO SIDEWAYS FALLBACK ───────────────────────────────────────────────────
 *
 * The chain applies this veto in its FIRST pass, so an impermissible provider
 * is removed from the candidate list entirely — not merely skipped first. It
 * can therefore never be reached by a fallback after another provider fails,
 * which is the owner's "no automatic fallback to another external provider with
 * private data".
 *
 * Pure. No IO, no env, no server-only, no SDK import.
 */
import type { AiDataSensitivity } from "./data-sensitivity";

/** Ordered least → most restricted. Local copy so this module stays standalone. */
const SENSITIVITY_RANK: Record<AiDataSensitivity, number> = {
  PUBLIC: 0,
  LOW_RISK_PROJECT_DATA: 1,
  PERSONAL: 2,
  SENSITIVE_FREE_TEXT: 3,
};

/**
 * An explicit permission for ONE external provider to receive data up to ONE
 * sensitivity class. Every field is required because a grant without a reason
 * and a date is indistinguishable from a typo.
 */
export interface AiEgressGrant {
  readonly provider: string;
  /** The HIGHEST class this provider may receive. Never a list — a ceiling. */
  readonly maxSensitivity: AiDataSensitivity;
  /** Why this is lawful and agreed: DPA reference, owner decision, terms URL. */
  readonly basis: string;
  /** ISO date the grant was made. */
  readonly grantedOn: string;
}

/**
 * THE GRANT TABLE. Empty by owner decision.
 *
 * Adding a row here permits real user content to leave the platform. It is an
 * owner act, not an engineering one: it needs the legal basis in `basis`, a
 * date, and the same scrutiny as any other data-processing decision. A free
 * tier is not exempt from that scrutiny — see `MAX_GRANTABLE_FOR_FREE_TIER`.
 */
export const AI_EGRESS_GRANTS: readonly AiEgressGrant[] = [];

/**
 * A free cloud tier may never be granted personal data, whatever a grant says.
 *
 * Carried over from the free-provider matrix (docs/ai/free-provider-matrix-2026-08-09.md):
 * Google's Gemini free tier documents that content IS used to improve their
 * products while the paid tier documents that it is not. Generalised: when a
 * service is free the consideration is sometimes the content itself. A vendor
 * whose current terms genuinely permit the processing is not unblocked by
 * arguing here — it is unblocked by verifying the terms and moving it out of
 * `free_tier` with the source recorded.
 */
export const MAX_GRANTABLE_FOR_FREE_TIER: AiDataSensitivity =
  "LOW_RISK_PROJECT_DATA";

/**
 * `grants` is injectable for the same reason `AI_PROVIDER_PROFILES` is: a rule
 * whose live subject set is EMPTY is indistinguishable from a rule that does
 * not work. The grant table is empty by owner decision, so the only way to
 * prove that a grant actually opens the gate — and that the free-tier ceiling
 * still caps it — is to inject one in a test.
 */
export function egressGrantFor(
  provider: string,
  grants: readonly AiEgressGrant[] = AI_EGRESS_GRANTS,
): AiEgressGrant | null {
  return grants.find((g) => g.provider === provider) ?? null;
}

/** What this provider is permitted to receive at most. */
export function maxPermittedSensitivity(
  profile: { readonly id: string; readonly locality: "local" | "cloud"; readonly costClass: string },
  grants: readonly AiEgressGrant[] = AI_EGRESS_GRANTS,
): AiDataSensitivity {
  // Inside our own infrastructure: no egress, nothing to permit.
  if (profile.locality === "local") return "SENSITIVE_FREE_TEXT";

  const grant = egressGrantFor(profile.id, grants);
  if (!grant) return "PUBLIC";

  // A free tier's ceiling is capped regardless of what the grant claims.
  if (
    profile.costClass === "free_tier" &&
    SENSITIVITY_RANK[grant.maxSensitivity] >
      SENSITIVITY_RANK[MAX_GRANTABLE_FOR_FREE_TIER]
  ) {
    return MAX_GRANTABLE_FOR_FREE_TIER;
  }
  return grant.maxSensitivity;
}

export type EgressVerdict =
  | { readonly permitted: true }
  | { readonly permitted: false; readonly reason: string };

/** May this payload leave for this provider? Default deny. */
export function egressPermitted(
  profile: { readonly id: string; readonly locality: "local" | "cloud"; readonly costClass: string },
  sensitivity: AiDataSensitivity,
  grants: readonly AiEgressGrant[] = AI_EGRESS_GRANTS,
): EgressVerdict {
  if (profile.locality === "local") return { permitted: true };

  const ceiling = maxPermittedSensitivity(profile, grants);
  if (SENSITIVITY_RANK[sensitivity] <= SENSITIVITY_RANK[ceiling]) {
    return { permitted: true };
  }

  const grant = egressGrantFor(profile.id, grants);
  return {
    permitted: false,
    reason: grant
      ? `data egress gate: "${profile.id}" is permitted up to ${ceiling}, but this task carries ${sensitivity} (owner decision 2026-08-19, AI DATA BOUNDARY)`
      : `data egress gate: "${profile.id}" is external and holds no egress grant, so it may receive PUBLIC data only — this task carries ${sensitivity} (owner decision 2026-08-19, AI DATA BOUNDARY)`,
  };
}
