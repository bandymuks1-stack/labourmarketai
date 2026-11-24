import "server-only";

import { readProfileRow } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import {
  listWorkspaceMemberships,
  resolveActiveWorkspaceForCaller,
} from "@/lib/company/active-organization";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import {
  hasOrganizationCapability,
  isGovernanceRole,
  type GovernanceRole,
} from "@/lib/company/role-capabilities";
import type { DomainCaller } from "@/lib/domain/caller";

/**
 * WHICH ORGANIZATION AM I IMPORTING EVIDENCE FOR, AND MAY I?
 *
 * ── WHY THIS IS NOT `requireEmployerCompanyForCaller` ──────────────────────
 * That resolver is the canonical EMPLOYER context and it is correct for what
 * it does — but it resolves through `organizations.legacy_company_id →
 * companies.id`, so an organization with no company binding (a team, an
 * institution registered as an organization only) fails it with
 * `no-company-binding`.
 *
 * The owner correction of 2026-09-07 is explicit: the root actor is the
 * ORGANIZATION, and company/employer is one role it may hold. An evidence
 * import must therefore work for an employer, an agency, a school, a training
 * provider and a public body alike. This resolver answers the organization
 * question directly and never asks the company one.
 *
 * ── IT REUSES, IT DOES NOT FORK ────────────────────────────────────────────
 * The workspace list, the active-workspace pointer and the governance-role
 * vocabulary are all the canonical ones:
 *
 *   resolveActiveWorkspaceForCaller  →  which workspace am I acting in
 *   listWorkspaceMemberships         →  which organizations am I in, and how
 *   hasOrganizationCapability        →  may this role import evidence
 *
 * Nothing is trusted from the client — not an organization id, not a role.
 * The caller may name an organization, but it is only ever used to SELECT
 * among the memberships the server already read for them.
 *
 * ── FAIL-CLOSED, AND THE DB DECIDES ANYWAY ─────────────────────────────────
 * Every ambiguous or unauthorized state returns a named reason and NO
 * organization id. And this is the app layer narrowing what is OFFERED: every
 * write still runs under the caller's own RLS, where
 * `public.manages_organization(organization_id)` decides. An app-layer pass
 * cannot widen what the database accepts.
 */

export type EvidenceOrgReason =
  /** No session. */
  | "unauthenticated"
  /** Acting in the personal space — a person is not an organization. */
  | "personal-workspace"
  /** The caller belongs to no organization at all. */
  | "no-organization"
  /** A named organization is not one of the caller's own memberships. */
  | "not-a-member"
  /** Several memberships and no active pointer — the caller must choose. */
  | "choice-required"
  /** The caller is in the organization but holds no governance role that may
   *  import evidence (`member`, or employment only). */
  | "not-authorized"
  /** The workspace/pointer columns are absent in this environment. */
  | "needs-migration"
  /** A real read failure. NEVER rendered as "you have no organization". */
  | "error";

export interface EvidenceOrgOption {
  readonly id: string;
  readonly name: string;
}

export type EvidenceOrgContext =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly organizationName: string;
      readonly role: GovernanceRole;
    }
  | {
      readonly ok: false;
      readonly reason: EvidenceOrgReason;
      /** Present on `choice-required` and `not-a-member`, so a client can ask
       *  the human by NAME instead of inventing a uuid (#1360 lesson). */
      readonly options?: readonly EvidenceOrgOption[];
    };

/** The membership relationship as a governance role, or null when the
 *  relationship is employment-only (which is never governance authority). */
function governanceRoleOf(
  relationship: string | null | undefined,
): GovernanceRole | null {
  if (!relationship) return null;
  return isGovernanceRole(relationship) ? relationship : null;
}

/**
 * Resolve the organization this caller is importing evidence for.
 *
 * `requestedOrganizationId` is OPTIONAL and is a SELECTOR, never a grant: it
 * can only pick one of the caller's own memberships. An unknown value returns
 * `not-a-member` with the real options rather than falling back to "the first
 * organization", which is exactly how a workspace becomes decorative.
 */
export async function resolveEvidenceOrganization(
  caller: DomainCaller,
  requestedOrganizationId?: string | null,
): Promise<EvidenceOrgContext> {
  let memberships: Awaited<ReturnType<typeof listWorkspaceMemberships>>;
  try {
    memberships = await listWorkspaceMemberships(caller);
  } catch {
    return { ok: false, reason: "error" };
  }

  const orgs = memberships.filter((w) => w.kind === "organization");
  if (orgs.length === 0) return { ok: false, reason: "no-organization" };

  const options: EvidenceOrgOption[] = orgs.map((o) => ({
    id: o.id,
    name: o.name?.trim() || o.id,
  }));

  // 1. An explicitly named organization — matched against the caller's OWN
  //    memberships, by id or by exact (case-insensitive) name.
  const requested = requestedOrganizationId?.trim();
  if (requested) {
    const needle = requested.toLowerCase();
    const matches = orgs.filter(
      (o) =>
        o.id.toLowerCase() === needle ||
        (o.name ?? "").trim().toLowerCase() === needle,
    );
    if (matches.length !== 1)
      return { ok: false, reason: "not-a-member", options };
    return authorize(matches[0]);
  }

  // 2. No name given — the ACTIVE workspace decides, resolved server-side.
  let activeId: string | null = null;
  try {
    const profileRead = await readProfileRow(caller);
    const identity =
      profileRead.ok && profileRead.value?.active_role
        ? baseIdentityForRole(profileRead.value.active_role)
        : null;
    const ctx = await resolveActiveWorkspaceForCaller(caller, identity);
    activeId = ctx.activeWorkspaceId;
  } catch {
    return { ok: false, reason: "error" };
  }

  if (activeId === PERSONAL_WORKSPACE_ID) {
    return { ok: false, reason: "personal-workspace", options };
  }
  const active = activeId ? orgs.find((o) => o.id === activeId) : undefined;
  if (active) return authorize(active);

  // 3. Exactly one organization and no usable pointer — unambiguous, so
  //    resolving it is a fact, not a guess. More than one is a real choice.
  if (orgs.length === 1) return authorize(orgs[0]);
  return { ok: false, reason: "choice-required", options };

  function authorize(w: (typeof orgs)[number]): EvidenceOrgContext {
    const role = governanceRoleOf(w.relationship);
    if (!role || !hasOrganizationCapability(role, "import-evidence")) {
      return { ok: false, reason: "not-authorized" };
    }
    return {
      ok: true,
      organizationId: w.id,
      organizationName: w.name?.trim() || w.id,
      role,
    };
  }
}
