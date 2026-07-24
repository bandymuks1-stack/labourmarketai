import type { Role } from "@/lib/auth/actions";
import type {
  ConfirmationTier,
  ConversationActionDescriptor,
} from "@/lib/conversation/action-registry";

/**
 * Pure dispatch-decision core (Phase B). The authorization gate that runs
 * BEFORE any executor. Kept pure so every deny path is unit-testable without a
 * database: unknown action, wrong role, non-executable (deep-link-only) action.
 * The server dispatcher (dispatch.ts) performs the IO — auth, held-roles read,
 * schema validation, confirmation-token verification, executor call — and uses
 * this to decide whether to proceed.
 */

export type AuthzDecision =
  | { ok: true }
  | { ok: false; code: "unknown_action" | "not_authorized" | "not_executable" };

/** Only these tiers require a server-issued confirmation token. */
export function requiresConfirmation(tier: ConfirmationTier): boolean {
  return tier === "important_write" || tier === "strong_irreversible";
}

/**
 * Decide whether a dispatch may proceed to input validation + execution.
 * `executable` = the action has a registered server executor (else it is a
 * deep-link-only action and must never be "run" from the conversation layer).
 */
export function authorizeDispatch(params: {
  descriptor: ConversationActionDescriptor | undefined;
  heldRoles: ReadonlySet<Role>;
  executable: boolean;
}): AuthzDecision {
  const { descriptor, heldRoles, executable } = params;
  // An LLM (or a hand-crafted call) can never invent an action id.
  if (!descriptor) return { ok: false, code: "unknown_action" };
  // Role gate — checked against HELD roles; RLS + the canonical RPC remain the
  // true backstop, this is defence-in-depth at the conversation boundary.
  if (!descriptor.allowedRoles.some((r) => heldRoles.has(r))) {
    return { ok: false, code: "not_authorized" };
  }
  // Deep-link-only actions are navigations, not executions.
  if (!executable) return { ok: false, code: "not_executable" };
  return { ok: true };
}
