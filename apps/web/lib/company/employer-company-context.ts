import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, readProfileRow } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import {
  getWorkspaceContext,
  resolveActiveWorkspaceForCaller,
  type WorkspaceContext,
} from "@/lib/company/active-organization";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import type { DomainCaller } from "@/lib/domain/caller";
import {
  isEmployerSurfaceRole,
  isGovernanceRole,
  type GovernanceRole,
} from "@/lib/company/role-capabilities";

/**
 * THE ONE employer company resolver (W8 slice 1).
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The W8 audit's P0-1: the active organization was DECORATIVE. `WorkspaceChip`
 * offered a real, membership-validated switch, and every employer data path
 * still resolved through `companies.profile_id = auth.uid()` — so switching
 * workspaces changed the chip, the accent hue and `resultContext`, and not one
 * row of employer data. Two workspaces showed identical demands, candidates,
 * shortlists and bookings.
 *
 * This module closes that by making ONE canonical chain the only way an
 * employer surface may learn which company it is acting for:
 *
 *   active workspace  →  organizations.legacy_company_id  →  companies.id
 *
 * ─── AUTHORITY RULES ────────────────────────────────────────────────────────
 * 1. NOTHING is trusted from the client. Not an organization id, not a
 *    workspace id, not a company id, not a profile id. The workspace is read
 *    server-side from the canonical resolver (`getWorkspaceContext`), whose
 *    pointer is an httpOnly cookie written only by the membership-validated
 *    switch actions, and which is re-validated against the live membership
 *    list on every request.
 * 2. `organizations` SELECT is readable by ANY authenticated user (the org
 *    directory, W4 matrix finding M7). Reading the org row is therefore NOT an
 *    authorization signal. Membership is proven by the workspace list, which is
 *    built from owned organizations + ACTIVE `engagement_contexts` rows — that
 *    check is the gate, and it runs before the org row is ever read.
 * 3. FAIL-CLOSED. Every ambiguous, missing, unbound or unauthorized state
 *    returns a named reason and NO company id. There is deliberately no
 *    fallback to "the first company this profile owns" and no fallback to
 *    `companies.profile_id = auth.uid()` — those fallbacks are exactly what
 *    made the workspace decorative.
 *
 * ─── WHAT THIS SLICE DOES *NOT* CLAIM ───────────────────────────────────────
 * `customer_requests`, `demand_shortlist` and `booking_requests` still carry no
 * organization/company key — they are keyed on `profile_id` / `owner_id`. This
 * module therefore scopes the SURFACE (which company context may act at all),
 * not yet the ROW. Because `companies` is 1:1 per profile
 * (`companies_profile_id_key`, migration 20260604120000), a profile has at most
 * one company-bound organization today, so the surface gate is sufficient to
 * stop a second workspace from rendering the first one's employer data — but
 * true row-level organization scoping needs a migration and is a W9 decision.
 * Recorded, not faked.
 *
 * M-P0-4 consumer slice (§11): the final gate is now MEMBERSHIP TRUTH — the
 * caller's own ACTIVE `company_memberships` row proves the role, with the
 * company creator kept as an `owner`-equivalent compatibility arm. `member`
 * rows and engagement-only employment resolve NO employer surface
 * (fail-closed, reason `company-not-owned`). The resolved `role` rides in the
 * context so writes gate per-capability (`role-capabilities.ts`) — and every
 * write below is STILL re-validated SQL-side, which today remains
 * creator-bound until the owner-gated `manages_organization` /
 * `save_company_setup_v3` widening applies.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// `organizations` / `legacy_company_id` predate the generated Database type in
// some environments — the same boundary cast `lib/company/owned-organizations.ts`
// and `lib/company/active-organization.ts` already use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Why an employer surface has no company context. Every value is a PRODUCT
 * state with its own honest explanation — never a raw DB message, and never
 * collapsed into "no data".
 */
export type EmployerContextReason =
  /** No session. */
  | "unauthenticated"
  /** The person is acting in their personal space, not an organization. */
  | "personal-workspace"
  /** The person belongs to no organization at all. */
  | "no-organization"
  /** Active organization exists but has no `legacy_company_id` binding. */
  | "no-company-binding"
  /** The bound company row does not exist (dangling legacy pointer). */
  | "company-missing"
  /** The caller holds NO governance role in the organization (M-P0-4
   *  consumer slice): no active `company_memberships` row above `member`,
   *  and not the company creator. Engagement-only employment lands here —
   *  an employment row is never employer authority. Name kept from W8 for
   *  consumer compatibility. */
  | "company-not-owned"
  /** The active workspace is not in the caller's validated membership list. */
  | "not-a-member"
  /** More than one row answered a lookup that must answer with one. */
  | "ambiguous-binding"
  /** `organizations` / the binding column is absent in this environment. */
  | "needs-migration"
  /** A real DB / authorization failure. NEVER rendered as "you have no data". */
  | "error";

export type EmployerCompanyContext =
  | {
      readonly kind: "ok";
      readonly companyId: string;
      readonly organizationId: string;
      readonly organizationName: string;
      /** The caller's governance role in THIS organization — from their own
       *  ACTIVE `company_memberships` row (canonical truth), or `owner` via
       *  the creator-compatibility arm. Never from the client, never from
       *  employment. Gate writes with `hasOrganizationCapability(role, …)`. */
      readonly role: GovernanceRole;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: EmployerContextReason;
      /** The workspace the person IS in, so a surface can state the current
       *  fact ("Current space: …") instead of only what is missing. Null when
       *  it could not be resolved at all. */
      readonly activeWorkspaceName: string | null;
    };

function unavailable(
  reason: EmployerContextReason,
  activeWorkspaceName: string | null = null,
): EmployerCompanyContext {
  return { kind: "unavailable", reason, activeWorkspaceName };
}

/**
 * Resolve the company the caller is acting for RIGHT NOW, from the active
 * workspace. Request-cached: an employer page composes many readers and they
 * must all agree on one answer within one request.
 */
export const resolveEmployerCompanyContext = cache(
  async function resolveEmployerCompanyContext(): Promise<EmployerCompanyContext> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return unavailable("unauthenticated");

    // The person's REAL current identity decides the workspace default. This
    // is deliberately not hard-coded to "company": picking the personal
    // workspace in the chip also switches the active role, so honouring the
    // real identity is what makes an explicit personal choice fail closed
    // instead of being silently overridden back to the first organization.
    const session = await getSessionProfile();
    const identity = session.profile?.active_role
      ? baseIdentityForRole(session.profile.active_role)
      : null;

    // Cookie transport: the session-aware workspace resolution (session
    // pointer wins over the durable pointer); the gate chain below is THE
    // shared core (G4 wagon 3).
    const workspace = await getWorkspaceContext(identity);
    return resolveEmployerCompanyCore({ supabase, userId: user.id }, workspace);
  },
);

/**
 * THE employer-company gate chain as an explicit caller (G4 wagon 3) —
 * workspace membership gate → org row → legacy company binding → governance
 * role — extracted VERBATIM from the cookie resolver so the web surfaces,
 * the MCP capability layer, and mobile resolve "which company am I acting
 * for" through ONE implementation. The transport decides only how the
 * workspace context was resolved (session cookie vs durable pointer).
 */
export async function resolveEmployerCompanyCore(
  caller: DomainCaller,
  workspace: WorkspaceContext,
): Promise<EmployerCompanyContext> {
  const supabase = caller.supabase;
  const activeId = workspace.activeWorkspaceId;
  if (activeId === PERSONAL_WORKSPACE_ID) return unavailable("personal-workspace");

  // MEMBERSHIP GATE. `workspace.workspaces` is the membership-validated list
  // (owned organizations + active engagement contexts). An org that is not in
  // it can never be resolved, whatever a cookie or a client says.
  const active = workspace.workspaces.find(
    (w) => w.kind === "organization" && w.id === activeId,
  );
  if (!active) {
    const hasAnyOrg = workspace.workspaces.some((w) => w.kind === "organization");
    return unavailable(hasAnyOrg ? "not-a-member" : "no-organization");
  }
  const label = active.name || null;

    // The org row itself. The membership gate above already ran, which is what
    // makes this read legitimate: after 20260802170000 (W9 slice 2)
    // `organizations_select` is owner / active-member / admin, so a caller who
    // failed that gate reads 0 rows here too. Before that migration the policy
    // was `using (true)` and this read was unscoped — the gate was the ONLY
    // thing protecting it. `limit(2)` so a duplicated id would surface as
    // ambiguity rather than being silently reduced by `maybeSingle`.
    const orgRes = await asAny(supabase)
      .from("organizations")
      .select("id, display_name, legal_name, legacy_company_id")
      .eq("id", activeId)
      .limit(2);
    if (orgRes.error) {
      if (
        orgRes.error.code === UNDEFINED_COLUMN_CODE ||
        orgRes.error.code === RELATION_NOT_FOUND_CODE
      ) {
        return unavailable("needs-migration", label);
      }
      console.error("[employer-company-context] organization read failed", {
        code: orgRes.error.code,
      });
      return unavailable("error", label);
    }
    const orgRows = (orgRes.data ?? []) as {
      id: string;
      display_name: string | null;
      legal_name: string | null;
      legacy_company_id: string | null;
    }[];
    if (orgRows.length > 1) return unavailable("ambiguous-binding", label);
    const org = orgRows[0];
    if (!org) return unavailable("not-a-member", label);

    const organizationName =
      org.display_name?.trim() || org.legal_name?.trim() || active.name || "";
    const companyId = org.legacy_company_id;
    if (!companyId) {
      return unavailable("no-company-binding", organizationName || label);
    }

    // Confirm the company row exists (and read the creator pointer for the
    // compatibility arm below).
    const compRes = await asAny(supabase)
      .from("companies")
      .select("id, profile_id")
      .eq("id", companyId)
      .limit(2);
    if (compRes.error) {
      if (
        compRes.error.code === UNDEFINED_COLUMN_CODE ||
        compRes.error.code === RELATION_NOT_FOUND_CODE
      ) {
        return unavailable("needs-migration", organizationName || label);
      }
      console.error("[employer-company-context] company read failed", {
        code: compRes.error.code,
      });
      return unavailable("error", organizationName || label);
    }
    const compRows = (compRes.data ?? []) as { id: string; profile_id: string | null }[];
    if (compRows.length > 1) return unavailable("ambiguous-binding", organizationName || label);
    const company = compRows[0];
    if (!company) return unavailable("company-missing", organizationName || label);

    // ── GOVERNANCE GATE (M-P0-4 consumer slice, §11) ────────────────────────
    // Membership proves the role; the active workspace selected the target.
    // Precedence:
    //   1. the caller's own ACTIVE `company_memberships` row — canonical;
    //   2. creator-compatibility arm: `companies.profile_id === auth.uid()`
    //      resolves as `owner` (ownership metadata stays compatibility data,
    //      not sole authority — §11 doctrine; prod's 10 memberships are the
    //      creator backfill, so 1 and 2 agree wherever both exist);
    //   3. everything else — `member` rows, engagement-only employment,
    //      strangers — fails CLOSED with no employer surface.
    // Feature-detected: environments without the memberships table (42P01)
    // use arm 2 alone, exactly the pre-slice behaviour.
    let role: GovernanceRole | null = null;
    const memRes = await asAny(supabase)
      .from("company_memberships")
      .select("role")
      .eq("organization_id", org.id)
      .eq("profile_id", caller.userId)
      .eq("status", "active")
      .limit(1);
    if (memRes.error) {
      if (
        memRes.error.code !== RELATION_NOT_FOUND_CODE &&
        memRes.error.code !== UNDEFINED_COLUMN_CODE
      ) {
        console.error("[employer-company-context] membership read failed", {
          code: memRes.error.code,
        });
        return unavailable("error", organizationName || label);
      }
      // table absent — legacy environment, compatibility arm only
    } else {
      const memberRole = (memRes.data ?? [])[0]?.role as string | undefined;
      if (isGovernanceRole(memberRole)) role = memberRole;
    }
    if (role === null && company.profile_id === caller.userId) role = "owner";
    if (role === null || !isEmployerSurfaceRole(role)) {
      return unavailable("company-not-owned", organizationName || label);
    }

    return {
      kind: "ok",
      companyId: company.id,
      organizationId: org.id,
      organizationName,
      role,
    };
}

/**
 * Bearer-transport guard (G4 wagon 3): resolve the employer company the
 * caller is acting for from the DURABLE workspace pointer — the same gate
 * chain as `requireEmployerCompany`, through the SAME core, without a
 * session cookie. The identity default mirrors the cookie path: the
 * caller's recorded `active_role` decides whether a single organization may
 * be inferred when no pointer is stored.
 */
export async function requireEmployerCompanyForCaller(
  caller: DomainCaller,
): Promise<
  | {
      ok: true;
      companyId: string;
      organizationId: string;
      organizationName: string;
      role: GovernanceRole;
    }
  | { ok: false; reason: EmployerContextReason }
> {
  const profileRead = await readProfileRow(caller);
  if (!profileRead.ok) return { ok: false, reason: "error" };
  const identity = profileRead.value?.active_role
    ? baseIdentityForRole(profileRead.value.active_role)
    : null;
  const workspace = await resolveActiveWorkspaceForCaller(caller, identity);
  const ctx = await resolveEmployerCompanyCore(caller, workspace);
  return ctx.kind === "ok"
    ? {
        ok: true,
        companyId: ctx.companyId,
        organizationId: ctx.organizationId,
        organizationName: ctx.organizationName,
        role: ctx.role,
      }
    : { ok: false, reason: ctx.reason };
}

/**
 * Guard form for the employer entry points: `ok` carries the ids, everything
 * else carries the named reason so the caller can map it onto ITS OWN existing
 * tagged result vocabulary instead of inventing a second one.
 */
export async function requireEmployerCompany(): Promise<
  | {
      ok: true;
      companyId: string;
      organizationId: string;
      organizationName: string;
      role: GovernanceRole;
    }
  | { ok: false; reason: EmployerContextReason }
> {
  const ctx = await resolveEmployerCompanyContext();
  return ctx.kind === "ok"
    ? {
        ok: true,
        companyId: ctx.companyId,
        organizationId: ctx.organizationId,
        organizationName: ctx.organizationName,
        role: ctx.role,
      }
    : { ok: false, reason: ctx.reason };
}

/**
 * True when the reason is an INFRASTRUCTURE failure rather than a legitimate
 * "you are not acting as a company right now". Callers use it to avoid
 * rendering a broken environment as an empty employer workspace — the exact
 * defect this slice fixes in `callerCompanyId`.
 */
export function isEmployerContextFailure(reason: EmployerContextReason): boolean {
  return (
    reason === "error" ||
    reason === "ambiguous-binding" ||
    reason === "needs-migration" ||
    reason === "company-missing"
  );
}
