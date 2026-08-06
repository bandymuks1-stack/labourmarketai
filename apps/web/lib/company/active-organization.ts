import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  getOwnedOrganizations,
  type OwnedOrganization,
} from "@/lib/company/owned-organizations";
import {
  PERSONAL_WORKSPACE_ID,
  resolveActiveOrganizationId,
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
 * `resolveActiveOrganizationId` — a stale/foreign pointer can never win.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

/**
 * The SERVER-SIDE session workspace pointer (owner audit P0.1). An httpOnly
 * cookie written ONLY by the membership-validated switch actions
 * (`lib/company/organization-actions.ts`) and read back here on every
 * request. It makes workspace switching real before the owner-gated durable
 * pointer migration (20260714210000) is applied; once that lands, the DB
 * pointer becomes the cross-device default and this stays the most-recent
 * in-session choice. Never localStorage, never client-writable.
 */
export const ACTIVE_WORKSPACE_COOKIE = "lm_active_workspace";

/** Read the validated-at-write session pointer; resolution still membership-
 *  validates it against the live workspace list before it can win. */
async function readSessionWorkspacePointer(): Promise<string | null> {
  try {
    const jar = await cookies();
    const v = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null; // outside a request scope — no pointer
  }
}

// The active_organization_id column ships in the owner-gated migration
// 20260714210000 — it is not in the generated DB types until applied
// (same pattern as lib/company/owned-organizations.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface ActiveOrganizationContext {
  /** Organizations the profile can act as (owner-scoped in v1). */
  readonly organizations: readonly OwnedOrganization[];
  /** Membership-validated active org id (null = no company yet). */
  readonly activeOrganizationId: string | null;
  /** The active org row, for header display. */
  readonly activeOrganization: OwnedOrganization | null;
  /** True when > 1 membership — the ONLY state that renders a switcher. */
  readonly canSwitch: boolean;
  /** False while migration 20260714210000 is unapplied — the pointer cannot
   *  be persisted yet and switching is honestly unavailable. */
  readonly pointerAvailable: boolean;
}

const EMPTY: ActiveOrganizationContext = {
  organizations: [],
  activeOrganizationId: null,
  activeOrganization: null,
  canSwitch: false,
  pointerAvailable: false,
};

export const getActiveOrganizationContext = cache(
  async function getActiveOrganizationContext(): Promise<ActiveOrganizationContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const owned = await getOwnedOrganizations();
  if (owned.kind !== "ok" || owned.organizations.length === 0) {
    // needs-migration / error / genuinely no orgs — an honest empty context;
    // callers keep their existing single-company fallbacks.
    return EMPTY;
  }

  // Stored pointer — the in-session cookie choice wins, then the DB pointer
  // (feature-detected: 42703 / 42P01 degrade to "no DB pointer" without
  // failing the shell). Both are membership-validated by the pure resolver.
  let dbPointer: string | null = null;
  const { data, error } = await asAny(supabase)
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!error) {
    dbPointer =
      ((data as { active_organization_id?: string | null } | null)
        ?.active_organization_id as string | null) ?? null;
  }
  const sessionPointer = await readSessionWorkspacePointer();
  const storedId =
    sessionPointer === PERSONAL_WORKSPACE_ID
      ? null
      : (sessionPointer ?? dbPointer);

  const activeOrganizationId = resolveActiveOrganizationId(
    owned.organizations,
    storedId,
  );
  const activeOrganization =
    owned.organizations.find((o) => o.id === activeOrganizationId) ?? null;

  return {
    organizations: owned.organizations,
    activeOrganizationId,
    activeOrganization,
    // The session pointer makes switching a real mechanism for everyone.
    canSwitch: shouldOfferOrganizationSwitch(owned.organizations),
    pointerAvailable: true,
  };
  },
);

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

async function readEngagementMemberships(
  supabase: SupabaseClient,
  profileId: string,
): Promise<WorkspaceInfo[]> {
  const { data, error } = await asAny(supabase)
    .from("engagement_contexts")
    .select(
      "organization_id, relationship_slug, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", profileId)
    .eq("status", "active")
    .not("organization_id", "is", null)
    .limit(50);
  if (error) return []; // honest degradation — the personal workspace remains
  const byOrg = new Map<string, WorkspaceInfo>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const orgId = row.organization_id as string | null;
    if (!orgId || byOrg.has(orgId)) continue;
    const org = row.organizations as {
      display_name?: string | null;
      legal_name?: string | null;
      organization_type?: string | null;
    } | null;
    byOrg.set(orgId, {
      id: orgId,
      // An unnamed organization must never render as a bare dash row (owner
      // audit P0.1 "tušti punktai") — empty here, and the chip substitutes a
      // localized fallback label.
      name: org?.display_name?.trim() || org?.legal_name?.trim() || "",
      kind: "organization",
      organizationType: normalizeOrgType(org?.organization_type ?? null),
      relationship: normalizeRelationship(
        (row.relationship_slug as string | null) ?? null,
      ),
      accentIndex: workspaceAccentIndex(orgId),
    });
  }
  return [...byOrg.values()];
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
): Promise<WorkspaceInfo[]> {
  const { data, error } = await asAny(supabase)
    .from("company_memberships")
    .select(
      "organization_id, role, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", profileId)
    .eq("status", "active")
    .limit(50);
  if (error) return []; // honest degradation — table not applied here
  const byOrg = new Map<string, WorkspaceInfo>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const orgId = row.organization_id as string | null;
    if (!orgId || byOrg.has(orgId)) continue;
    const org = row.organizations as {
      display_name?: string | null;
      legal_name?: string | null;
      organization_type?: string | null;
    } | null;
    const role = (row.role as string | null) ?? null;
    byOrg.set(orgId, {
      id: orgId,
      name: org?.display_name?.trim() || org?.legal_name?.trim() || "",
      kind: "organization",
      organizationType: normalizeOrgType(org?.organization_type ?? null),
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
  return [...byOrg.values()];
}

export interface WorkspaceContext {
  /** Personal workspace first, then every org membership (owner precedence). */
  readonly workspaces: readonly WorkspaceInfo[];
  /** PERSONAL_WORKSPACE_ID or a membership-validated org id. */
  readonly activeWorkspaceId: string;
  /** False while migration 20260714210000 is unapplied — switching is then
   *  honestly unavailable and the chip is an indicator only. */
  readonly pointerAvailable: boolean;
}

const EMPTY_WORKSPACE: WorkspaceContext = {
  workspaces: [],
  activeWorkspaceId: PERSONAL_WORKSPACE_ID,
  pointerAvailable: false,
};

export const getWorkspaceContext = cache(async function getWorkspaceContext(
  identity: "person" | "company" | null,
): Promise<WorkspaceContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_WORKSPACE;

  const [owned, engagementWorkspaces, governanceWorkspaces] = await Promise.all([
    getOwnedOrganizations(),
    readEngagementMemberships(supabase, user.id),
    readGovernanceMemberships(supabase, user.id),
  ]);

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
      });
    }
  }
  // Governance memberships BEFORE engagement rows: a person who is both a
  // member and an employee of the same org keeps the governance relationship
  // label; either source alone still lists the workspace.
  for (const w of [...governanceWorkspaces, ...engagementWorkspaces]) {
    if (!seen.has(w.id)) {
      seen.add(w.id);
      orgWorkspaces.push(w);
    }
  }

  // Stored pointer: the in-session choice (server-side cookie, written only
  // by the validated switch actions) wins over the durable DB pointer; both
  // are membership-validated by `resolveActiveWorkspaceId` below. The DB
  // column stays feature-detected (owner-gated migration 20260714210000) —
  // its absence no longer disables switching, because the session pointer
  // always exists as a mechanism (owner audit P0.1).
  let dbPointer: string | null = null;
  const { data, error } = await asAny(supabase)
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!error) {
    dbPointer =
      ((data as { active_organization_id?: string | null } | null)
        ?.active_organization_id as string | null) ?? null;
  }
  const sessionPointer = await readSessionWorkspacePointer();
  const storedId =
    sessionPointer === PERSONAL_WORKSPACE_ID
      ? null
      : (sessionPointer ?? dbPointer);

  const personal: WorkspaceInfo = {
    id: PERSONAL_WORKSPACE_ID,
    name: "",
    kind: "personal",
    accentIndex: 0,
  };

  return {
    workspaces: [personal, ...orgWorkspaces],
    activeWorkspaceId: resolveActiveWorkspaceId(
      identity,
      orgWorkspaces.map((w) => w.id),
      storedId,
    ),
    // Switching is a real mechanism for every session now — the chip renders
    // working switch buttons, never a "not enabled yet" production text.
    pointerAvailable: true,
  };
});
