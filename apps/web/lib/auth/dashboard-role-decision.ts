import { isLiveRoleId, type LiveRoleId } from "@/lib/config/roles";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";

/**
 * WHICH ROLE OPENS THE DASHBOARD — the pure decision (W6 honesty, 2026-09-06).
 *
 * Measured on production: the dashboard root resolved its role as
 * `session.profile?.active_role ?? "worker"`. The session reader is honestly
 * three-state underneath (`readProfileRow` → `{ ok: false }` on a failed
 * read), but the shell flattened "the read FAILED" and "no row" into the same
 * `null`, and the root then picked `worker` — so a company owner whose
 * `profiles` read timed out was greeted in the personal space as a person.
 * Nothing said the read had failed; the wrong workspace simply appeared.
 *
 * The rule:
 *   - a SUCCESSFUL read decides from the row (a live role, else the person's
 *     own space — a row without an active role is a brand-new person);
 *   - a FAILED read never invents a role. The last known context — the
 *     durable, membership-validated workspace pointer the person chose
 *     themselves — decides if it exists (an organization → company, an
 *     explicit personal choice → person);
 *   - with no pointer either, the answer is `read-failed`: the page renders
 *     its NAMED degrade state (the real workspace chooser + retry), never a
 *     silently chosen workspace.
 *
 * Pure so it is testable without a request; the page supplies the inputs.
 */

export type ProfileReadState = "ok" | "failed";

/** The stored workspace pointer, classified against the person's REAL
 *  organization memberships — a stale/foreign id is `null`, never trusted. */
export type DurablePointerKind = "personal" | "organization" | null;

export type DashboardRoleDecision =
  | {
      readonly kind: "role";
      readonly role: LiveRoleId;
      /** `profile` = the row said so; `pointer` = the read failed and the
       *  person's own durable workspace choice stood in for it. */
      readonly source: "profile" | "pointer";
    }
  | { readonly kind: "read-failed" };

export function classifyDurablePointer(
  stored: string | null | undefined,
  organizationIds: readonly string[],
): DurablePointerKind {
  if (!stored) return null;
  if (stored === PERSONAL_WORKSPACE_ID) return "personal";
  return organizationIds.includes(stored) ? "organization" : null;
}

export function decideDashboardRole(input: {
  readonly profileRead: ProfileReadState;
  readonly activeRole: string | null;
  readonly pointer: DurablePointerKind;
}): DashboardRoleDecision {
  if (input.profileRead === "ok") {
    const role: LiveRoleId =
      input.activeRole && isLiveRoleId(input.activeRole) ? input.activeRole : "worker";
    return { kind: "role", role, source: "profile" };
  }
  if (input.pointer === "organization") return { kind: "role", role: "company", source: "pointer" };
  if (input.pointer === "personal") return { kind: "role", role: "worker", source: "pointer" };
  return { kind: "read-failed" };
}
