/**
 * Operator control — authorization, rate limiting and the audit record. PURE.
 *
 * Three separate decisions that are easy to collapse into one and must not be:
 *
 *   1. IS THE CHANNEL OPEN? An empty allowlist means the control surface is
 *      OFF. Not "open to everyone" — off. This is the fail-closed direction,
 *      and it is why an unconfigured deployment is safe rather than exposed.
 *   2. IS THIS SENDER ALLOWED? Membership in an explicit allowlist. Never
 *      inferred from anything the caller sends about itself.
 *   3. HAS THIS SENDER ASKED TOO OFTEN? A budget per sender, so one authorized
 *      operator cannot turn a read-only surface into a load generator.
 *
 * The order matters and is enforced: an unauthorized sender is rejected BEFORE
 * their request is counted, so an attacker cannot exhaust an operator's budget
 * by spamming with their id.
 *
 * NO SECRET APPEARS HERE. The allowlist holds opaque sender identifiers, and
 * the audit record deliberately carries the command NAME and the outcome —
 * never the raw inbound text, never a token, never a chat title.
 *
 * Pure. No IO, no env, no server-only, no network. Time is injected.
 */
import type { ControlCommand } from "./control-commands";

export interface ControlSender {
  /** Opaque id from the calling system. Compared, never parsed. */
  readonly senderId: string;
}

export interface ControlPolicy {
  /**
   * Senders permitted to issue commands. EMPTY MEANS THE SURFACE IS OFF —
   * an unconfigured deployment answers nobody rather than everybody.
   */
  readonly allowedSenderIds: readonly string[];
  /** Max commands per sender per window. */
  readonly maxPerWindow: number;
  readonly windowMs: number;
}

export const DEFAULT_CONTROL_POLICY: ControlPolicy = {
  allowedSenderIds: [],
  maxPerWindow: 20,
  windowMs: 60_000,
};

export type AuthorizationOutcome =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: "surface_disabled" | "sender_not_allowed" | "rate_limited";
      /** Safe to return to the caller. Names no other sender and no secret. */
      readonly detail: string;
    };

/** A sender's recent request timestamps. Caller owns the storage. */
export type ControlRateState = Map<string, number[]>;

export function newRateState(): ControlRateState {
  return new Map();
}

/**
 * Decide whether this sender may run this command now.
 *
 * `nowMs` is injected rather than read from the clock so the window behaviour
 * is testable without sleeping, and so this module stays pure.
 */
export function authorizeControlCommand(
  sender: ControlSender,
  policy: ControlPolicy,
  state: ControlRateState,
  nowMs: number,
): AuthorizationOutcome {
  if (policy.allowedSenderIds.length === 0) {
    return {
      allowed: false,
      reason: "surface_disabled",
      detail: "the control surface is not enabled for this deployment",
    };
  }
  if (!policy.allowedSenderIds.includes(sender.senderId)) {
    // Rejected BEFORE counting — otherwise an unauthorized sender could burn an
    // authorized operator's budget just by claiming their id is theirs.
    return {
      allowed: false,
      reason: "sender_not_allowed",
      detail: "sender is not authorized for operator commands",
    };
  }

  const cutoff = nowMs - policy.windowMs;
  const recent = (state.get(sender.senderId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= policy.maxPerWindow) {
    // Do NOT record this attempt: counting refusals would let a burst extend
    // its own lockout indefinitely.
    state.set(sender.senderId, recent);
    return {
      allowed: false,
      reason: "rate_limited",
      detail: `at most ${policy.maxPerWindow} commands per ${Math.round(policy.windowMs / 1000)}s`,
    };
  }
  recent.push(nowMs);
  state.set(sender.senderId, recent);
  return { allowed: true };
}

export interface ControlAuditRecord {
  /** Command NAME, or null when parsing refused it. Never the raw input. */
  readonly command: ControlCommand | null;
  readonly senderId: string;
  readonly outcome: "answered" | "refused";
  /** Machine-readable refusal reason; null when answered. */
  readonly refusedBecause: string | null;
  readonly atMs: number;
}

/**
 * Build the audit record for one inbound command.
 *
 * Deliberately omits the raw text. Knowing that sender X ran /status is
 * operational; storing what they typed turns an audit log into a copy of the
 * control channel, and a rejected line is exactly the place a hostile payload
 * would sit.
 */
export function buildControlAudit(
  command: ControlCommand | null,
  senderId: string,
  outcome: ControlAuditRecord["outcome"],
  refusedBecause: string | null,
  atMs: number,
): ControlAuditRecord {
  return { command, senderId, outcome, refusedBecause, atMs };
}
