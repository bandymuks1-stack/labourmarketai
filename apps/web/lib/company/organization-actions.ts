"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/company/active-organization";
import { switchActiveWorkspaceCore } from "@/lib/company/workspace-switch-core";
import {
  PERSONAL_WORKSPACE_ID,
  encodeWorkspacePointerCookie,
  type WorkspaceActingRole,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";
import { followWorkspaceRoleCore } from "@/lib/auth/active-role-core";
import type { DomainCaller } from "@/lib/domain/caller";

/**
 * Switch the ACTIVE organization for the current profile (Company
 * Architecture Completion, Sprint v2 §5). Server-side only — the pointer is
 * `profiles.active_organization_id` (owner-gated migration 20260714210000),
 * never localStorage.
 *
 * Defense-in-depth ordering:
 *   1. app-level membership check (owned organizations, RLS-scoped);
 *   2. DB-level validation trigger (validate_active_organization) rejects
 *      any non-membership value even if this action is bypassed.
 *
 * Honest degradation: while the migration is unapplied the UPDATE fails with
 * 42703 → returns { ok: false, code: "needs-migration" }; the caller keeps
 * the single-company behaviour (no fake switch).
 */

// The feature-detection codes (42703 / PGRST204 — see the PROD_QA 2026-08-06
// note) and the pointer UPDATE itself moved into the shared domain core
// (lib/company/workspace-switch-core.ts, G4): these actions own only the
// session cookie + revalidation on top of it.

export type SwitchOrganizationResult =
  | { ok: true }
  | {
      ok: false;
      code: "not-authenticated" | "not-member" | "needs-migration" | "error";
    };

/** The session cookie's attributes — identical for every pointer value, so a
 *  choice survives navigation and reload the same way in both directions. */
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
} as const;

type CommitResult =
  | {
      ok: true;
      /** The membership row the core validated (null for personal). */
      workspace: WorkspaceInfo | null;
    }
  | Extract<SwitchOrganizationResult, { ok: false }>;

/**
 * Point the session at an ORGANIZATION: membership core first, cookie second.
 * The ONE implementation behind `switchActiveOrganization` and
 * `switchWorkspaceAction` — no revalidation here, the caller owns exactly one.
 */
async function commitOrganizationPointer(
  caller: DomainCaller,
  organizationId: string,
): Promise<CommitResult> {
  // G4: membership validation + the durable pointer write are THE shared
  // domain core (same list the workspace chip renders — owned + governance
  // + engagement memberships). A foreign org id never reaches the DB or the
  // cookie; the DB trigger stays as the second layer underneath.
  const core = await switchActiveWorkspaceCore(caller, organizationId);
  if (!core.ok && core.code === "not-member") {
    return { ok: false, code: "not-member" };
  }
  if (!core.ok && core.code === "error") {
    return { ok: false, code: "error" };
  }

  // core.ok — or `needs-migration` (the durable pointer column is not
  // applied yet), which is NOT a failure for a browser session: the
  // SERVER-SIDE session pointer below makes the switch real today (owner
  // audit P0.1) — an httpOnly cookie, set only after membership validation,
  // read back server-side on every request, and bound to THIS user so the
  // next person on a shared browser never inherits it.
  const jar = await cookies();
  jar.set(
    ACTIVE_WORKSPACE_COOKIE,
    encodeWorkspacePointerCookie(caller.userId, organizationId),
    COOKIE_OPTIONS,
  );
  return { ok: true, workspace: core.workspace ?? null };
}

/**
 * Point the session at the PERSONAL workspace: cookie first (the switch is
 * real immediately, migration or not), then the durable pointer clear through
 * the SAME core the organization switch uses.
 */
async function commitPersonalPointer(caller: DomainCaller): Promise<CommitResult> {
  // Session pointer first — this returns the session to the personal
  // workspace immediately, migration or not (owner audit P0.1).
  //
  // D-20: it is SET to the personal sentinel, not deleted. Deleting it left no
  // record that a choice had been made, so the next request could not tell
  // "chose personal" from "never chose" — and for a company identity with
  // exactly one organization the single-org default handed the person straight
  // back to that organization. The employer could not stay in their own
  // personal space at all. Same cookie attributes as the organization pointer,
  // so the choice survives navigation and reload identically in both
  // directions.
  const jar = await cookies();
  jar.set(
    ACTIVE_WORKSPACE_COOKIE,
    encodeWorkspacePointerCookie(caller.userId, PERSONAL_WORKSPACE_ID),
    COOKIE_OPTIONS,
  );

  // G4: the durable pointer clear goes through the SAME core the org switch
  // uses (the personal sentinel maps to a NULL pointer there). An absent
  // column is not a failure for a browser session — the cookie above is the
  // real mechanism, exactly as before the extraction.
  const core = await switchActiveWorkspaceCore(caller, PERSONAL_WORKSPACE_ID);
  if (!core.ok && core.code !== "needs-migration") {
    return { ok: false, code: "error" };
  }
  return { ok: true, workspace: null };
}

export async function switchActiveOrganization(
  organizationId: string,
): Promise<SwitchOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };

  // The ONE org-pointer commit (membership core, then the cookie). This
  // action does not move the acting identity; the workspace switch does
  // (`switchWorkspaceAction`), and the client routes every switch there.
  const result = await commitOrganizationPointer({ supabase, userId: user.id }, organizationId);
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Switch back to the PERSONAL workspace (real-user workflow rebuild W1) —
 * clears the active-organization pointer. Same honest degradation contract as
 * switchActiveOrganization: while the owner-gated migration is unapplied the
 * UPDATE fails with 42703 → { ok: false, code: "needs-migration" } and
 * nothing is faked client-side.
 */
export async function clearActiveOrganization(): Promise<SwitchOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };

  const result = await commitPersonalPointer({ supabase, userId: user.id });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true };
}

export type SwitchWorkspaceResult =
  | {
      ok: true;
      /** The role the person now acts as there; null = no held role fits and
       *  the previous one was kept. */
      actingRole: WorkspaceActingRole | null;
      /** False when the pointer moved but the acting identity could not be
       *  written. The workspace IS switched (the chat's identity is derived
       *  from the workspace, not from this write), so this is not a failed
       *  switch — it is reported, never hidden. */
      identityFollowed: boolean;
    }
  | {
      ok: false;
      code: "not-authenticated" | "not-member" | "needs-migration" | "error";
    };

/**
 * THE workspace switch — ONE server call (owner program 2026-09-23).
 *
 * The chip used to run it as two or three client-driven server actions: the
 * pointer action, then (if the person held another role) `switchActiveRole`,
 * then `router.refresh()` — each action revalidating the whole layout, so the
 * org→personal path rendered /dashboard three times, and a throw in the second
 * action left the pointer moved with nothing on screen saying so. Now:
 *
 *   1. membership core + durable pointer, then the session cookie
 *      (the existing order — nothing is written for a non-member);
 *   2. the acting identity follows the person's RELATIONSHIP to the target
 *      workspace (`followWorkspaceRoleCore`, decision d3) — through the same
 *      role core `switchActiveRole` runs, never a direct profiles write here;
 *   3. ONE layout revalidation.
 */
export async function switchWorkspaceAction(workspaceId: string): Promise<SwitchWorkspaceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };
  const caller: DomainCaller = { supabase, userId: user.id };

  const committed =
    workspaceId === PERSONAL_WORKSPACE_ID
      ? await commitPersonalPointer(caller)
      : await commitOrganizationPointer(caller, workspaceId);
  if (!committed.ok) return committed;

  // `committed.workspace` is the row the membership core just accepted (the
  // same list the chip renders), so the relationship that decides the
  // identity is the verified one — never a client claim, never a second read.
  const followed = await followWorkspaceRoleCore(caller, committed.workspace);
  if (!followed.ok) {
    console.error("[switchWorkspaceAction] identity did not follow the workspace", {
      code: followed.code,
    });
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    actingRole: followed.ok ? followed.role : null,
    identityFollowed: followed.ok,
  };
}
