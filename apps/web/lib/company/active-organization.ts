import "server-only";

import { cache } from "react";
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

  // Stored pointer — feature-detected: 42703 (column not applied yet) and
  // 42P01 both degrade to "no pointer" without failing the shell.
  let storedId: string | null = null;
  let pointerAvailable = false;
  const { data, error } = await asAny(supabase)
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!error) {
    pointerAvailable = true;
    storedId =
      ((data as { active_organization_id?: string | null } | null)
        ?.active_organization_id as string | null) ?? null;
  } else if (
    error.code !== UNDEFINED_COLUMN_CODE &&
    error.code !== RELATION_NOT_FOUND_CODE
  ) {
    // Unexpected read failure — degrade like "no pointer" (first org wins);
    // never break the authenticated shell over a display pointer.
    pointerAvailable = false;
  }

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
    canSwitch:
      pointerAvailable && shouldOfferOrganizationSwitch(owned.organizations),
    pointerAvailable,
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
      name:
        org?.display_name?.trim() || org?.legal_name?.trim() || "—",
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

  const [owned, engagementWorkspaces] = await Promise.all([
    getOwnedOrganizations(),
    readEngagementMemberships(supabase, user.id),
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
  for (const w of engagementWorkspaces) {
    if (!seen.has(w.id)) {
      seen.add(w.id);
      orgWorkspaces.push(w);
    }
  }

  // Stored pointer — same feature detection as the active-organization read.
  let storedId: string | null = null;
  let pointerAvailable = false;
  const { data, error } = await asAny(supabase)
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!error) {
    pointerAvailable = true;
    storedId =
      ((data as { active_organization_id?: string | null } | null)
        ?.active_organization_id as string | null) ?? null;
  }

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
    pointerAvailable,
  };
});
