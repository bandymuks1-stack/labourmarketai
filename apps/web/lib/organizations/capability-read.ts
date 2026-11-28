import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * What an organization has already declared it does.
 *
 * A READ, deliberately kept out of the `"use server"` action module: every
 * export of such a module becomes a server ACTION, and a page that renders a
 * capability list is not performing an action. Keeping the read here means the
 * company page imports a plain server function, and the action module contains
 * only things a user actually invokes.
 *
 * Runs under the CALLER'S OWN RLS — never the admin client. `organization_roles_select`
 * already fences this to the organization's owner or members, so a caller who
 * cannot see the organization sees no capabilities either, without this module
 * repeating (and risking contradicting) that rule.
 */

// The generated Database type does not know organization_roles until the types
// are regenerated; the table IS applied in production (ledger 20260827064504).
// Same escape hatch, same shape, as every other module that reads a table the
// generated types have not caught up with.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny<T>(c: T): any {
  return c;
}

type OrganizationCapabilitiesState =
  | { kind: "ok"; capabilities: readonly string[] }
  | { kind: "unavailable" };

/** Use when routing depends on whether a capability is absent or unreadable. */
export async function readOrganizationCapabilitiesState(
  organizationId: string,
): Promise<OrganizationCapabilitiesState> {
  if (!organizationId) return { kind: "unavailable" };
  const state = await readOrganizationCapabilitiesOnce(organizationId);
  return state.kind === "ok" ? { kind: "ok", capabilities: [...state.capabilities] } : state;
}

/** Empty on ANY missing state — an absent table, no session or no rows all
 *  read the same honest nothing, never an error surface on a page whose real
 *  subject is something else. */
export async function readOrganizationCapabilities(
  organizationId: string,
): Promise<readonly string[]> {
  const state = await readOrganizationCapabilitiesState(organizationId);
  return state.kind === "ok" ? state.capabilities : [];
}

/**
 * REQUEST-SCOPED (perf 2026-10-22): the organization doors, the company page,
 * the chat starter context and the bridge spine each asked the same
 * organization's capabilities — four identical `organization_roles` round
 * trips in one `/dashboard/company` render. React `cache()` deduplicates
 * within ONE render only; every navigation reads again and a server action
 * (no render) reads itself, so a capability just saved is never answered
 * from an older read.
 */
const readOrganizationCapabilitiesOnce = cache(async function readOrganizationCapabilitiesOnce(
  organizationId: string,
): Promise<OrganizationCapabilitiesState> {
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase)
      .from("organization_roles")
      .select("role_slug")
      .eq("organization_id", organizationId);
    if (error || !Array.isArray(data)) return { kind: "unavailable" };
    return {
      kind: "ok",
      capabilities: data.map((r: { role_slug?: string }) => String(r.role_slug ?? "")).filter(Boolean),
    };
  } catch {
    return { kind: "unavailable" };
  }
});
