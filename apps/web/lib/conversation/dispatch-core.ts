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

/**
 * WAS THE WRITE MADE FROM THE WORKSPACE THE SERVER IS ACTING IN?
 * (owner program 2026-09-23.)
 *
 * The client sends the workspace it DISPLAYED; the dispatcher resolves the
 * active workspace itself. They disagree when a switch happened elsewhere —
 * another tab (the cookie is shared), another device, the MCP door — and the
 * screen still shows the old one. Executing then would attribute the write to
 * an organization the person is not looking at. Membership is still enforced
 * either way, so this is not an escalation check: it refuses attribution to
 * the wrong one of the person's own workspaces.
 *
 * `expected` absent = a caller that does not bind (older client, a
 * person-scoped surface): nothing to compare, and the confirmation token's
 * workspace-bound fingerprint below still refuses a token minted elsewhere.
 * The client id is NEVER used for authority — only for this comparison.
 */
export function isStaleWorkspaceContext(
  expectedWorkspaceId: string | null | undefined,
  activeWorkspaceId: string,
): boolean {
  if (!expectedWorkspaceId) return false;
  return expectedWorkspaceId !== activeWorkspaceId;
}

/**
 * The confirmation fingerprint, bound to the workspace it was minted in: a
 * token shown in workspace A can never execute in workspace B, even where the
 * action's own state is unchanged (the per-action fingerprint alone is `n/a`
 * for most actions).
 */
export function workspaceBoundFingerprint(
  activeWorkspaceId: string,
  actionFingerprint: string,
): string {
  return `ws:${activeWorkspaceId}|${actionFingerprint}`;
}

/** Only these tiers require a server-issued confirmation token. */
export function requiresConfirmation(tier: ConfirmationTier): boolean {
  return tier === "important_write" || tier === "strong_irreversible";
}

/**
 * The roles a dispatch may act on, from three facts the dispatcher read.
 *
 * `profileRoles` is the RBAC catalogue as recorded. Two arms add a role the
 * catalogue does not carry, each from the capability the WEB already acts on:
 *
 *  - `opensCompanySpace` — a governance membership in the active workspace
 *    holds `company` (capability matrix P1, 2026-09-23; `membership_accept_v1`
 *    never grants `profile_roles`).
 *  - `ownsWorkerProfile` — the person's OWN `workers` row holds `worker`
 *    (production defect measured 2026-11-02: 11 profiles that hold only
 *    `company` but have their own worker profile were refused every worker
 *    action — accepting a roster invitation included — through chat and MCP,
 *    while the web, whose worker pages are not role-gated, let them act: the
 *    authority there is the `owns_worker` RLS policy and the accept RPC keyed on
 *    that row). It never adds `company`, `agency`, `customer` or `admin`.
 *
 * An empty result keeps the `worker` default for a brand-new account (a read
 * that ANSWERED with no rows); a failed read never reaches here (see
 * `heldRolesOf`).
 */
export function heldDispatchRoles(params: {
  profileRoles: readonly string[];
  opensCompanySpace: boolean;
  ownsWorkerProfile: boolean;
}): Set<Role> {
  const set = new Set<Role>(params.profileRoles as Role[]);
  if (params.opensCompanySpace) set.add("company");
  if (params.ownsWorkerProfile) set.add("worker");
  return set.size > 0 ? set : new Set<Role>(["worker"]);
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
