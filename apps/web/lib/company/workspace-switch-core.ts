import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listWorkspaceMemberships } from "@/lib/company/active-organization";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import type { DomainCaller } from "@/lib/domain/caller";

/**
 * THE workspace-switch DOMAIN core (G4 bridge, slice E) — membership
 * validation + the durable pointer write, and NOTHING session-shaped.
 *
 * The web server actions (`lib/company/organization-actions.ts`) wrap this
 * with the httpOnly session-cookie pointer and layout revalidation; a bearer
 * client (MCP, mobile) gets only the durable DB pointer — and when the
 * owner-gated pointer migration (20260714210000) is unapplied on the target
 * environment, a bearer switch is HONESTLY refused as `needs-migration`
 * rather than pretended (the cookie mechanism that makes the web switch real
 * anyway does not exist for a bearer caller).
 *
 * Defense-in-depth is unchanged: the app-level membership check here (the
 * SAME `listWorkspaceMemberships` list the workspace chip renders) runs
 * first, and the DB-level validation trigger (validate_active_organization)
 * still rejects any non-membership value underneath it.
 */

const UNDEFINED_COLUMN_CODE = "42703";
// PostgREST reports an unknown column in an UPDATE payload as its OWN
// schema-cache miss code, NOT Postgres 42703 (see organization-actions.ts,
// PROD_QA 2026-08-06).
const SCHEMA_CACHE_MISS_CODE = "PGRST204";
const NOT_MEMBER_CODE = "42501";
const isAbsentColumn = (code: string | undefined): boolean =>
  code === UNDEFINED_COLUMN_CODE || code === SCHEMA_CACHE_MISS_CODE;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type WorkspaceSwitchCoreResult =
  | { ok: true; workspaceId: string }
  | { ok: false; code: "not-member" | "needs-migration" | "error" };

export async function switchActiveWorkspaceCore(
  caller: DomainCaller,
  workspaceId: string,
): Promise<WorkspaceSwitchCoreResult> {
  if (workspaceId !== PERSONAL_WORKSPACE_ID) {
    // A foreign workspace id never reaches the DB write — the membership
    // list is the caller's own (RLS-scoped reads underneath).
    const memberships = await listWorkspaceMemberships(caller);
    const isMember = memberships.some(
      (w) => w.kind === "organization" && w.id === workspaceId,
    );
    if (!isMember) return { ok: false, code: "not-member" };
  }

  const target = workspaceId === PERSONAL_WORKSPACE_ID ? null : workspaceId;
  const { error } = await asAny(caller.supabase)
    .from("profiles")
    .update({ active_organization_id: target })
    .eq("id", caller.userId);
  if (error) {
    if (isAbsentColumn(error.code)) return { ok: false, code: "needs-migration" };
    if (error.code === NOT_MEMBER_CODE) {
      // The DB trigger disagrees with the app-level check — trust the DB.
      return { ok: false, code: "not-member" };
    }
    console.error("[switchActiveWorkspaceCore] update failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, code: "error" };
  }
  return { ok: true, workspaceId };
}
