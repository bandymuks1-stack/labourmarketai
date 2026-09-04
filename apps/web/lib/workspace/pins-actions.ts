"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import {
  PIN_CAP,
  isPinnableRef,
  pinKindFor,
  sanitizePinLabel,
} from "@/lib/workspace/pins-model";

/**
 * MY SPACE — PIN · UNPIN · REORDER (owner contract 2026-09-04 §4C).
 *
 * Plain table writes under the owner's own RLS (no definer function). The
 * workspace is resolved SERVER-SIDE from the active context — never from the
 * client. A reference must be one the conversation can resolve
 * (`isPinnableRef`); anything else is refused, so a pin can never become a
 * dead chip. The cap (PIN_CAP) is enforced here before the insert; the DB
 * enforces uniqueness per (profile, workspace, ref).
 */
export type PinActionResult =
  | { readonly ok: true; readonly outcome: "pinned" | "already" | "unpinned" | "reordered" }
  | { readonly ok: false; readonly code: "not_authed" | "invalid" | "cap" | "unavailable" | "error" };

const MISSING = new Set(["42P01", "PGRST205", "42703"]);

async function scope(): Promise<{ userId: string; organizationId: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let organizationId: string | null = null;
  try {
    // The ACTIVE organization (membership-validated, request-cached — the
    // same resolver the dashboard uses); null = the personal space.
    const ctx = await getActiveOrganizationContext();
    organizationId = ctx.activeOrganizationId ?? null;
  } catch {
    organizationId = null;
  }
  return { userId: user.id, organizationId };
}

export async function pinAction(input: { ref: string; label?: string | null }): Promise<PinActionResult> {
  const ref = typeof input?.ref === "string" ? input.ref.trim() : "";
  const kind = pinKindFor(ref);
  if (!kind) return { ok: false, code: "invalid" };
  const s = await scope();
  if (!s) return { ok: false, code: "not_authed" };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  let countQ = sb.from("workspace_pins").select("ref", { count: "exact", head: true }).eq("profile_id", s.userId);
  countQ = s.organizationId ? countQ.eq("organization_id", s.organizationId) : countQ.is("organization_id", null);
  const counted = await countQ;
  if (counted.error) return { ok: false, code: MISSING.has(counted.error.code) ? "unavailable" : "error" };
  if ((counted.count ?? 0) >= PIN_CAP) return { ok: false, code: "cap" };
  const { error } = await sb.from("workspace_pins").insert({
    profile_id: s.userId,
    organization_id: s.organizationId,
    kind,
    ref,
    label: sanitizePinLabel(input?.label),
    position: counted.count ?? 0,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, outcome: "already" };
    return { ok: false, code: MISSING.has(error.code) ? "unavailable" : "error" };
  }
  return { ok: true, outcome: "pinned" };
}

export async function unpinAction(input: { ref: string }): Promise<PinActionResult> {
  const ref = typeof input?.ref === "string" ? input.ref.trim() : "";
  if (!isPinnableRef(ref)) return { ok: false, code: "invalid" };
  const s = await scope();
  if (!s) return { ok: false, code: "not_authed" };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from("workspace_pins").delete().eq("profile_id", s.userId).eq("ref", ref);
  q = s.organizationId ? q.eq("organization_id", s.organizationId) : q.is("organization_id", null);
  const { error } = await q;
  if (error) return { ok: false, code: MISSING.has(error.code) ? "unavailable" : "error" };
  return { ok: true, outcome: "unpinned" };
}

export async function reorderPinsAction(input: { refs: string[] }): Promise<PinActionResult> {
  const refs = Array.isArray(input?.refs) ? input.refs.filter((r) => typeof r === "string" && isPinnableRef(r)).slice(0, PIN_CAP) : [];
  if (refs.length === 0) return { ok: false, code: "invalid" };
  const s = await scope();
  if (!s) return { ok: false, code: "not_authed" };
  const supabase = await createClient();
  for (let i = 0; i < refs.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("workspace_pins")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("profile_id", s.userId)
      .eq("ref", refs[i]);
    q = s.organizationId ? q.eq("organization_id", s.organizationId) : q.is("organization_id", null);
    const { error } = await q;
    if (error) return { ok: false, code: MISSING.has(error.code) ? "unavailable" : "error" };
  }
  return { ok: true, outcome: "reordered" };
}
