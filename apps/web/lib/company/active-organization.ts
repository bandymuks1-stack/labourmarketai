import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import {
  getOwnedOrganizations,
  readOwnedOrganizations,
  type OwnedOrganization,
} from "@/lib/company/owned-organizations";
import type { DomainCaller } from "@/lib/domain/caller";
import { withoutArchivedOrganizations } from "@/lib/company/archived-organizations";
import {
  PERSONAL_WORKSPACE_ID,
  SWITCHABLE_ENGAGEMENT_RELATIONSHIPS,
  parseWorkspacePointerCookie,
  pickStoredWorkspacePointer,
  resolveActiveWorkspaceId,
  shouldOfferOrganizationSwitch,
  workspaceAccentIndex,
  type WorkspaceInfo,
  type WorkspaceRelationship,
} from "@/lib/company/organization-switch";

/**
 * Active-organization read model (Company Architecture Completion, Sprint
 * v2 §5). Resolves WHICH organization the current profile is acting as,
 * server-side, on top of the EXISTING membership model:
 *
 *   - memberships come from `getOwnedOrganizations()` (organizations RLS is
 *     owner-scoped, so v1 switching covers owned orgs; manager-level
 *     engagement memberships are a documented follow-up — the DB trigger
 *     already accepts them);
 *   - the stored pointer is `profiles.active_organization_id` (owner-gated
 *     migration 20260714210000). Until that migration is applied the column
 *     read fails with 42703 → we fall back to the first owned organization
 *     (exactly today's single-company behaviour) and report
 *     `pointerAvailable: false` so callers stay honest about persistence.
 *
 * The resolution itself is the pure, membership-validated
 * `resolveActiveWorkspaceId`, run in ONE place (`resolveActiveWorkspaceForCaller`)
 * under ONE pointer rule (`pickStoredWorkspacePointer`) — a stale/foreign
 * pointer can never win, and no two readers can name different organizations.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

/**
 * The SERVER-SIDE session workspace pointer (owner audit P0.1). An httpOnly
 * cookie written ONLY by the membership-validated switch actions
 * (`lib/company/organization-actions.ts`) and read back here on every
 * request. It makes workspace switching real where the owner-gated durable
 * pointer migration (20260714210000) is unapplied; where it is applied, an
 * organization in the DB pointer wins and this cookie decides only when the DB
 * pointer is null — the one place it carries something the column cannot, the
 * explicit personal choice (`pickStoredWorkspacePointer`). Bound to the user
 * who set it. Never localStorage, never client-writable.
 */
export const ACTIVE_WORKSPACE_COOKIE = "lm_active_workspace";

/** Read the validated-at-write session pointer for THIS user; resolution
 *  still membership-validates it against the live workspace list before it can
 *  win. The cookie is bound to the user who set it
 *  (`parseWorkspacePointerCookie`): a value written for someone else — a
 *  previous person on a shared browser — is ignored. */
export async function readSessionWorkspacePointer(
  userId: string | null,
): Promise<string | null> {
  try {
    const jar = await cookies();
    return parseWorkspacePointerCookie(jar.get(ACTIVE_WORKSPACE_COOKIE)?.value, userId);
  } catch {
    return null; // outside a request scope — no pointer
  }
}

/**
 * A COOKIE transport's caller carries this browser's session pointer, so a
 * core it calls (`resolveActiveWorkspaceForCaller`, the evidence and people
 * imports) resolves the SAME workspace the chip shows — not the durable
 * pointer alone. Bearer transports never call this.
 */
export async function withSessionWorkspacePointer(
  caller: DomainCaller,
): Promise<DomainCaller> {
  return {
    ...caller,
    sessionWorkspacePointer: await readSessionWorkspacePointer(caller.userId),
  };
}

// The active_organization_id column ships in the owner-gated migration
// 20260714210000 — it is not in the generated DB types until applied
// (same pattern as lib/company/owned-organizations.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** The active organization as every surface names it — the chip's workspace
 *  row, projected. Not an `OwnedOrganization`: the person may be a manager or
 *  employee of an organization they do not own, and a row this reader cannot
 *  see must not be dressed up with an owner-only field. */
export interface ActiveOrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly organizationType: NonNullable<WorkspaceInfo["organizationType"]>;
  /** The person's relationship to it, off the same membership row the chip
   *  shows (`other` when the row carries none). */
  readonly relationship: NonNullable<WorkspaceInfo["relationship"]>;
}

export interface ActiveOrganizationContext {
  /** Organizations the profile OWNS — kept for the callers that map a legacy
   *  `companies.id` back to its organization (`legacyCompanyId`). This list
   *  never decides which organization is active. */
  readonly organizations: readonly OwnedOrganization[];
  /** Membership-validated active org id — THE SAME id the workspace chip
   *  shows (null = the personal workspace, or no organization at all). */
  readonly activeOrganizationId: string | null;
  /** The active organization, for display. */
  readonly activeOrganization: ActiveOrganizationSummary | null;
  /** True when > 1 organization workspace — the ONLY state that renders a
   *  switcher. */
  readonly canSwitch: boolean;
  /** Mirrors `WorkspaceContext.pointerAvailable`. */
  readonly pointerAvailable: boolean;
}

const EMPTY: ActiveOrganizationContext = {
  organizations: [],
  activeOrganizationId: null,
  activeOrganization: null,
  canSwitch: false,
  pointerAvailable: false,
};

/**
 * WHICH ORGANIZATION IS ACTIVE, for the callers that still speak in
 * organizations (pins, starter signals, the company pages, company setup) —
 * a PROJECTION of `getWorkspaceContext`, not a second resolver.
 *
 * It used to be one. It listed OWNED organizations only and read the DB
 * pointer before the cookie, while the chip read owned + governance +
 * engagement memberships cookie-first. For a manager of an organization they
 * do not own it named the WRONG organization (the W9 guard proves it), and
 * whenever the two pointers disagreed the pins, the starters and the company
 * pages acted for a different organization than the chip displayed — in the
 * same request. Now the active id is read off the ONE workspace resolution,
 * so every surface names the organization the person sees.
 */
export const getActiveOrganizationContext = cache(
  async function getActiveOrganizationContext(): Promise<ActiveOrganizationContext> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return EMPTY;

    const [workspace, owned] = await Promise.all([
      getWorkspaceContext(),
      getOwnedOrganizations(),
    ]);
    // needs-migration / error on the owned read leaves the legacy-id lookup
    // empty; it never decides the active organization, so the rest stands.
    const organizations = owned.kind === "ok" ? owned.organizations : [];
    const orgWorkspaces = workspace.workspaces.filter((w) => w.kind === "organization");
    const active =
      orgWorkspaces.find((w) => w.id === workspace.activeWorkspaceId) ?? null;
    if (!active && organizations.length === 0 && orgWorkspaces.length === 0) return EMPTY;

    return {
      organizations,
      activeOrganizationId: active?.id ?? null,
      activeOrganization: active
        ? {
            id: active.id,
            name: active.name,
            organizationType: active.organizationType ?? "other",
            relationship: active.relationship ?? "other",
          }
        : null,
      canSwitch: shouldOfferOrganizationSwitch(orgWorkspaces),
      pointerAvailable: workspace.pointerAvailable,
    };
  },
);

/**
 * The active organization id ONLY where the person GOVERNS it (owner or
 * manager) — the company pages' capability fallback (review P2, #1849).
 *
 * `activeOrganizationId` now follows the chip, so it can name an organization
 * where the person is an employee (or holds some other non-management link).
 * The company pages used it to read the organization's declared capabilities
 * when no owned organization mirrors the resolved company; for an
 * employee-only workspace that rendered OWNER capability UI (education door,
 * capability settings) in someone else's company. Every write behind that UI
 * is still gated server-side — this keeps the page from offering it. Pure.
 */
export function governedActiveOrganizationId(
  ctx: Pick<ActiveOrganizationContext, "activeOrganization">,
): string | null {
  const active = ctx.activeOrganization;
  if (!active) return null;
  return active.relationship === "owner" || active.relationship === "manager"
    ? active.id
    : null;
}

// ── Workspace context (real-user workflow rebuild W1) ────────────────────────
//
// The universal ACTIVE WORK CONTEXT for EVERY identity, not only the company
// one. Extends (does not duplicate) this module's active-organization model:
//   - org memberships come from OWNED organizations PLUS the person's active
//     `engagement_contexts` rows (the canonical person↔org spine, doctrine
//     §5.5) — so a WORKER employed by three companies finally gets a visible
//     context list too;
//   - the stored pointer stays `profiles.active_organization_id` (owner-gated
//     migration 20260714210000) with the same honest degradation;
//   - resolution is the pure `resolveActiveWorkspaceId` — person identity
//     defaults to the personal workspace, company identity keeps today's
//     first-owned-org fallback.

const RELATIONSHIP_MAP: Record<string, WorkspaceRelationship> = {
  owner: "owner",
  manager: "manager",
  external_manager: "manager",
  employee: "employee",
};

function normalizeRelationship(slug: string | null): WorkspaceRelationship {
  return (slug && RELATIONSHIP_MAP[slug]) || "other";
}

function normalizeOrgType(
  value: string | null,
): NonNullable<WorkspaceInfo["organizationType"]> {
  return value === "company" || value === "agency" || value === "team"
    ? value
    : "other";
}

/** The embedded organization columns every membership source reads — the
 *  name, the type, and the legacy company binding with its company type
 *  (through the `organizations_legacy_company_id_fkey` foreign key; companies
 *  SELECT is open to authenticated readers). Display facts only. */
const ORGANIZATION_EMBED =
  "organizations(display_name, legal_name, organization_type, legacy_company_id, companies!organizations_legacy_company_id_fkey(company_type))";

type EmbeddedOrganization = {
  display_name?: string | null;
  legal_name?: string | null;
  organization_type?: string | null;
  legacy_company_id?: string | null;
  companies?: { company_type?: string | null } | null;
} | null;

/** The display fields of a membership row's organization (name, type, company
 *  binding) — one mapping for the governance and engagement sources. */
function organizationDisplay(org: EmbeddedOrganization): Pick<
  WorkspaceInfo,
  "name" | "organizationType" | "companyBound" | "companyType"
> {
  return {
    // An unnamed organization must never render as a bare dash row (owner
    // audit P0.1 "tušti punktai") — empty here, and the chip substitutes a
    // localized fallback label.
    name: org?.display_name?.trim() || org?.legal_name?.trim() || "",
    organizationType: normalizeOrgType(org?.organization_type ?? null),
    companyBound: Boolean(org?.legacy_company_id),
    companyType: org?.companies?.company_type ?? null,
  };
}

/**
 * A schema-shaped absence, as opposed to a FAILURE.
 *
 * `company_memberships` and the pointer column are feature-detected: an
 * environment where the migration is unapplied answers 42P01 / PGRST205 /
 * 42703 / PGRST204, and degrading to "this source contributes nothing" is
 * correct there — the source genuinely does not exist.
 *
 * Every OTHER error is a real failure, and those two cases were conflated:
 * a transient PostgREST or RLS error produced a SHORTER membership list that
 * was then handed on as a complete answer. A person whose organizations
 * briefly failed to read would have been told, with no hedge, which
 * workspaces they belong to — a shorter list presented as the truth. That is
 * the #1314 rule (absence of an answer is never an answer of absence), and it
 * is why these readers now say whether they actually answered.
 */
const ABSENT_SCHEMA_CODES = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
export function isAbsentSchema(code: string | null | undefined): boolean {
  return !!code && ABSENT_SCHEMA_CODES.has(code);
}

/** Rows, and whether this source actually answered. */
interface SourceRead {
  readonly workspaces: readonly WorkspaceInfo[];
  /** False ONLY on a real failure — a structurally absent source is complete. */
  readonly complete: boolean;
}

async function readEngagementMemberships(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SourceRead> {
  const { data, error } = await asAny(supabase)
    .from("engagement_contexts")
    .select(`organization_id, relationship_slug, ${ORGANIZATION_EMBED}`)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .not("organization_id", "is", null)
    // Only relationships the pointer trigger accepts: a listed workspace the
    // switch can never reach (a `student` link) is a guaranteed silent refusal.
    .in("relationship_slug", [...SWITCHABLE_ENGAGEMENT_RELATIONSHIPS])
    .limit(50);
  // Absent schema is a real "nothing here"; anything else is a failure this
  // list must carry, not swallow.
  if (error) return { workspaces: [], complete: isAbsentSchema(error.code) };
  const byOrg = new Map<string, WorkspaceInfo>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const orgId = row.organization_id as string | null;
    if (!orgId || byOrg.has(orgId)) continue;
    byOrg.set(orgId, {
      id: orgId,
      ...organizationDisplay(row.organizations as EmbeddedOrganization),
      kind: "organization",
      relationship: normalizeRelationship(
        (row.relationship_slug as string | null) ?? null,
      ),
      accentIndex: workspaceAccentIndex(orgId),
    });
  }
  return { workspaces: [...byOrg.values()], complete: true };
}

/**
 * M-P0-4 Slice 2 consumer migration (§13): ACTIVE governance memberships are
 * a workspace source. An accepted `company_memberships` row makes the
 * organization appear in the switcher; revocation drops it on the next
 * request (`resolveActiveWorkspaceId` only accepts listed ids — the stale
 * pointer then fails closed). Feature-detected: environments without the
 * Slice 1 table degrade to the two legacy sources.
 */
async function readGovernanceMemberships(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SourceRead> {
  const { data, error } = await asAny(supabase)
    .from("company_memberships")
    .select(`organization_id, role, ${ORGANIZATION_EMBED}`)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .limit(50);
  // Feature detection stays: an environment without the Slice 1 table is
  // complete with nothing to add. A different error is a failure.
  if (error) return { workspaces: [], complete: isAbsentSchema(error.code) };
  const byOrg = new Map<string, WorkspaceInfo>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const orgId = row.organization_id as string | null;
    if (!orgId || byOrg.has(orgId)) continue;
    const role = (row.role as string | null) ?? null;
    byOrg.set(orgId, {
      id: orgId,
      ...organizationDisplay(row.organizations as EmbeddedOrganization),
      kind: "organization",
      governanceRole: role,
      // Governance roles map onto the existing workspace vocabulary: owner
      // stays owner; admin/manager/external_manager surface as manager;
      // member has no management relationship.
      relationship:
        role === "owner"
          ? "owner"
          : role === "admin" || role === "manager" || role === "external_manager"
            ? "manager"
            : "other",
      accentIndex: workspaceAccentIndex(orgId),
    });
  }
  return { workspaces: [...byOrg.values()], complete: true };
}

export interface WorkspaceContext {
  /** Personal workspace first, then every org membership (owner precedence). */
  readonly workspaces: readonly WorkspaceInfo[];
  /** PERSONAL_WORKSPACE_ID or a membership-validated org id. */
  readonly activeWorkspaceId: string;
  /** False while migration 20260714210000 is unapplied, and false when the
   *  pointer could not be read at all — switching is then honestly
   *  unavailable and `activeWorkspaceId` is the resolver's default rather
   *  than a stored choice. */
  readonly pointerAvailable: boolean;
  /** False when a membership source FAILED, so `workspaces` may be missing
   *  organizations. Absent on the session path, which has its own shape. */
  readonly membershipsComplete?: boolean;
}

const EMPTY_WORKSPACE: WorkspaceContext = {
  workspaces: [],
  activeWorkspaceId: PERSONAL_WORKSPACE_ID,
  pointerAvailable: false,
};

/**
 * THE caller's workspace MEMBERSHIP list (G4 bridge) — the transport-neutral
 * core under `getWorkspaceContext` and the membership authority the
 * workspace-switch core validates against. Personal workspace first, then
 * every org membership from the three canonical sources (owned +
 * governance + engagement), owner precedence, deduped — extracted verbatim
 * from the resolver below. NO pointer resolution here: which workspace is
 * ACTIVE is a session concern the cookie-side wrapper owns.
 */
/**
 * The membership list AND whether it is COMPLETE.
 *
 * `complete: false` means at least one of the three sources failed, so the
 * list may be missing organizations the person really belongs to. A caller
 * that shows a person "these are your workspaces" must not present that as an
 * answer — it is a shorter list, not a smaller truth.
 *
 * `listWorkspaceMemberships` stays as it was for the callers that legitimately
 * degrade (a membership CHECK only ever narrows: an org missing from a
 * degraded list is refused, never wrongly admitted). Reads that show the list
 * to a person use this one.
 */
export interface WorkspaceMembershipsRead {
  readonly workspaces: readonly WorkspaceInfo[];
  readonly complete: boolean;
}

export async function readWorkspaceMemberships(
  caller: DomainCaller,
): Promise<WorkspaceMembershipsRead> {
  const [owned, engagement, governance] = await Promise.all([
    readOwnedOrganizations(caller),
    readEngagementMemberships(caller.supabase, caller.userId),
    readGovernanceMemberships(caller.supabase, caller.userId),
  ]);
  // ARCHIVED organizations (owner decision 2026-09-23) keep their memberships
  // and engagements as history but are no workspace. Owned rows are already
  // filtered by `readOwnedOrganizations`; the member-sourced rows are checked
  // here in one bounded read. An unreadable archive state contributes nothing
  // and marks the list incomplete — never an unchecked organization.
  const memberSourced = await withoutArchivedOrganizations(caller.supabase, [
    ...governance.workspaces,
    ...engagement.workspaces,
  ]);
  const complete =
    owned.kind === "ok" && engagement.complete && governance.complete && memberSourced.ok;

  const orgWorkspaces: WorkspaceInfo[] = [];
  const seen = new Set<string>();
  if (owned.kind === "ok") {
    for (const o of owned.organizations) {
      seen.add(o.id);
      orgWorkspaces.push({
        id: o.id,
        name: o.name,
        kind: "organization",
        organizationType: normalizeOrgType(o.organizationType),
        relationship: "owner",
        accentIndex: workspaceAccentIndex(o.id),
        companyBound: o.legacyCompanyId !== null,
        companyType: o.companyType,
      });
    }
  }
  // Governance memberships BEFORE engagement rows: a person who is both a
  // member and an employee of the same org keeps the governance relationship
  // label; either source alone still lists the workspace.
  for (const w of memberSourced.ok ? memberSourced.rows : []) {
    if (!seen.has(w.id)) {
      seen.add(w.id);
      orgWorkspaces.push(w);
    }
  }

  const personal: WorkspaceInfo = {
    id: PERSONAL_WORKSPACE_ID,
    name: "",
    kind: "personal",
    accentIndex: 0,
  };
  return { workspaces: [personal, ...orgWorkspaces], complete };
}

/** The list alone — unchanged for every caller that only needs to CHECK it. */
export async function listWorkspaceMemberships(
  caller: DomainCaller,
): Promise<readonly WorkspaceInfo[]> {
  return (await readWorkspaceMemberships(caller)).workspaces;
}

/**
 * THE workspace resolution (G4 wagon 3) — the ONE place `resolveActiveWorkspaceId`
 * runs. The membership list is the shared core; the stored choice is the
 * DURABLE DB pointer (`profiles.active_organization_id`, written only by the
 * membership-validated switch core) under the ONE pointer rule, with the
 * session pointer a cookie transport supplies on the caller
 * (`caller.sessionWorkspacePointer`; a bearer client has none). The web
 * session's `getWorkspaceContext` is a wrapper over this, so "acting for
 * organization X" means ONE thing for the web session, the MCP capability
 * layer, and mobile.
 */
export async function resolveActiveWorkspaceForCaller(
  caller: DomainCaller,
  identity: "person" | "company" | null,
): Promise<WorkspaceContext> {
  const memberships = await readWorkspaceMemberships(caller);
  const workspaces = memberships.workspaces;
  const orgWorkspaces = workspaces.filter((w) => w.kind === "organization");

  let dbPointer: string | null = null;
  // `pointerAvailable` was hardcoded `true` here, which contradicted this
  // module's own contract (§ the note above: "until that migration is applied
  // the column read fails with 42703 → ... report `pointerAvailable: false` so
  // callers stay honest about persistence"). A caller therefore enabled a
  // switch control, and told the person the active workspace was their stored
  // choice, in exactly the environment where `context.switch` answers
  // `needs_migration` — the honest branch was unreachable where it was needed.
  //
  // It is DERIVED now: false when the column is absent (the migration is
  // unapplied and switching genuinely cannot work) and false when the read
  // failed for any other reason (the mechanism may exist, but the value shown
  // is then the resolver's default rather than a choice anyone made, and
  // saying otherwise is the claim that misleads).
  let pointerAvailable = true;
  const { data, error } = await asAny(caller.supabase)
    .from("profiles")
    .select("active_organization_id")
    .eq("id", caller.userId)
    .maybeSingle();
  if (error) {
    pointerAvailable = false;
  } else {
    dbPointer =
      ((data as { active_organization_id?: string | null } | null)
        ?.active_organization_id as string | null) ?? null;
  }

  // ONE pointer rule (d2, `pickStoredWorkspacePointer`): an organization in
  // the DB pointer wins; the session pointer — present only when a cookie
  // transport supplied it — decides only when the DB pointer is null, where it
  // alone can carry the explicit personal choice (D-20). The sentinel is passed
  // THROUGH: flattening it to null made "I chose personal" indistinguishable
  // from "I never chose", and the single-org default then overruled the
  // person's own choice.
  const storedId = pickStoredWorkspacePointer(
    dbPointer,
    caller.sessionWorkspacePointer ?? null,
  );

  return {
    workspaces,
    activeWorkspaceId: resolveActiveWorkspaceId(
      identity,
      orgWorkspaces.map((w) => w.id),
      storedId,
    ),
    pointerAvailable,
    membershipsComplete: memberships.complete,
  };
}

/**
 * The acting identity that decides the workspace DEFAULT, from the session
 * profile — the same `active_role` every surface of the request reads.
 */
function sessionIdentity(activeRole: string | null | undefined): "person" | "company" | null {
  return activeRole ? baseIdentityForRole(activeRole) : null;
}

/**
 * THE web session's active workspace — the cookie transport over the ONE
 * resolver above (`resolveActiveWorkspaceForCaller`): same membership list,
 * same pointer rule, same `resolveActiveWorkspaceId`, plus this browser's
 * session pointer.
 *
 * It takes NO argument, on purpose. It used to take the caller's choice of
 * identity, and React's request cache is keyed by the argument: the layout
 * passed the `active_role` identity, the journal and the work-log passed
 * "person", the dispatcher passed "company" — so with no stored pointer and
 * exactly one organization, ONE request held two active workspaces (company
 * resolved the organization, person resolved the personal space). The
 * identity that decides the single-org default is now read here, once, from
 * the request-cached session profile, and every caller gets the same answer.
 */
export const getWorkspaceContext = cache(async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_WORKSPACE;

  const [session, sessionPointer] = await Promise.all([
    getSessionProfile(),
    readSessionWorkspacePointer(user.id),
  ]);
  const resolved = await resolveActiveWorkspaceForCaller(
    { supabase, userId: user.id, sessionWorkspacePointer: sessionPointer },
    sessionIdentity(session.profile?.active_role),
  );

  return {
    workspaces: resolved.workspaces,
    activeWorkspaceId: resolved.activeWorkspaceId,
    // Switching is a real mechanism for every session — the session pointer
    // exists even where the durable column does not — so the chip renders
    // working switch buttons, never a "not enabled yet" production text.
    pointerAvailable: true,
  };
});
