import type { Role } from "@/lib/auth/actions";

/**
 * W7-S5b — non-worker identity made EXPLICIT on the person profile.
 *
 * The audited premise was "a pure company/agency identity silently loses 13
 * blocks" (every block gates on `workerId`). Empirically that state is
 * UNREACHABLE for accounts created since migration 0009: the
 * `on_profile_created_ensure_worker` trigger gives EVERY new profile a
 * `workers` row, and `can_view_worker` lets the owner read it — so
 * `workerId` is never null for a normally-created account, whatever its
 * roles. The REAL reachable defect is the reverse shape: an account whose
 * roles hold no person identity (identity truth = `profile_roles`, exactly
 * what the RoleSwitcher's held/missing sets are computed from) sees the full
 * worker-framed page with empty person sections and "Your professional
 * passport" copy — with no word about why.
 *
 * So the notice keys on IDENTITY (roles), and the entity row picks the
 * honest PRESENTATION variant:
 *   - `sections-empty`  — workers row exists (the normal case): the person
 *     sections render but hold no person data.
 *   - `sections-hidden` — workers row absent (legacy / self-deleted via
 *     `workers_delete` RLS / degraded): the blocks are genuinely not
 *     rendered, which previously read as breakage.
 *
 * This derivation is PURE (no IO) so the page decides from data it already
 * reads — no new request stage (W7-S3 ratchet) and no
 * `getOwnedOrganizations()` (forbidden on this page by W7-S4).
 */
export type NonWorkerIdentityNotice =
  | { kind: "hidden" }
  | {
      kind: "visible";
      /**
       * `organization-only` — the account holds a company/agency/customer
       * role but no person identity: the expected state for an organisation
       * owner who never added the person identity.
       * `no-person-role` — no organisation role either: still no person
       * identity to frame the page with, but support/tests can tell the
       * states apart via `data-reason`.
       */
      reason: "organization-only" | "no-person-role";
      /** Which true sentence the notice must say about the person sections. */
      presentation: "sections-empty" | "sections-hidden";
    };

const ORGANIZATION_ROLES: ReadonlySet<Role> = new Set([
  "company",
  "agency",
  "customer",
]);

export function deriveNonWorkerIdentityNotice(input: {
  workerId: string | null;
  roles: readonly Role[];
}): NonWorkerIdentityNotice {
  if (input.roles.includes("worker")) return { kind: "hidden" };
  const hasOrganizationRole = input.roles.some((r) => ORGANIZATION_ROLES.has(r));
  return {
    kind: "visible",
    reason: hasOrganizationRole ? "organization-only" : "no-person-role",
    presentation: input.workerId ? "sections-empty" : "sections-hidden",
  };
}
