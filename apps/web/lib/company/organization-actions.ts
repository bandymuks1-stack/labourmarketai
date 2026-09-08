"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/company/active-organization";
import { switchActiveWorkspaceCore } from "@/lib/company/workspace-switch-core";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";

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

export async function switchActiveOrganization(
  organizationId: string,
): Promise<SwitchOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };

  // G4: membership validation + the durable pointer write are THE shared
  // domain core (same list the workspace chip renders — owned + governance
  // + engagement memberships). A foreign org id never reaches the DB or the
  // cookie; the DB trigger stays as the second layer underneath.
  const core = await switchActiveWorkspaceCore(
    { supabase, userId: user.id },
    organizationId,
  );
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
  // read back server-side on every request.
  const jar = await cookies();
  jar.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

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
  jar.set(ACTIVE_WORKSPACE_COOKIE, PERSONAL_WORKSPACE_ID, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  // G4: the durable pointer clear goes through the SAME core the org switch
  // uses (the personal sentinel maps to a NULL pointer there). An absent
  // column is not a failure for a browser session — the cookie above is the
  // real mechanism, exactly as before the extraction.
  const core = await switchActiveWorkspaceCore(
    { supabase, userId: user.id },
    PERSONAL_WORKSPACE_ID,
  );
  if (!core.ok && core.code !== "needs-migration") {
    return { ok: false, code: "error" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
