import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMissingRpcCode, isMissingTableCode } from "@/lib/agency/clients-model";
import type {
  IdentityEventKind,
  IdentityResolutionEventDraft,
  StrongMatchKind,
} from "./identity-resolution";

/**
 * Identity-resolution server surface (Labour Market OS P7) — thin, ADMIN-ONLY
 * wrappers around the append-only audit ledger from DRAFT migration
 * 20260713210000_multi_source_talent_v1 (human-gated, NOT applied yet).
 *
 * What exists in v1:
 *   - listIdentityResolutionEvents(): reads the audit ledger. RLS is
 *     admin-only SELECT — a non-admin caller simply sees zero rows.
 *   - recordIdentityResolutionEvent(): writes ONE audit event via the RPC
 *     (server-side is_admin() check; merge_confirmed additionally requires
 *     the human decider, enforced by RPC + table CHECK).
 *
 * What does NOT exist in v1 (honest, documented follow-up — NO fake UI):
 *   - an admin duplicate-review page. The pure detection contract
 *     (lib/identity/identity-resolution.ts) is ready and fully tested; the
 *     admin surface that feeds it candidate rows the admin can already read
 *     is a separate slice. Until then nothing on any screen pretends
 *     duplicate review is available.
 *   - ANY auto-merge path: AUTO_MERGE_ENABLED = false (v1 policy — a human
 *     confirms every merge).
 *
 * Privacy: this module returns event rows (ids + closed enums + bounded
 * text) — never another profile's contact data.
 */

// Not in the generated Database type until the draft is applied — cast at
// the boundary, same pattern as the other draft-backed services.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface IdentityResolutionEventRow {
  readonly id: string;
  readonly kind: IdentityEventKind;
  readonly primaryProfileId: string;
  readonly duplicateProfileId: string;
  readonly matchedOn: StrongMatchKind | "human_decision";
  readonly legalBasis: string | null;
  readonly decidedBy: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
}

export type IdentityEventsRead =
  | { kind: "ok"; events: IdentityResolutionEventRow[] }
  | { kind: "needs-migration" }
  | { kind: "error" };

/** Read the append-only audit ledger (admin-only via RLS; capped window). */
export async function listIdentityResolutionEvents(): Promise<IdentityEventsRead> {
  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase)
      .from("identity_resolution_events")
      .select(
        "id, kind, primary_profile_id, duplicate_profile_id, matched_on, legal_basis, decided_by, notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isMissingTableCode(error.code)) return { kind: "needs-migration" };
      console.error("[identity-resolution] read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      events: (data ?? []).map(
        (r: Record<string, unknown>): IdentityResolutionEventRow => ({
          id: r.id as string,
          kind: r.kind as IdentityEventKind,
          primaryProfileId: r.primary_profile_id as string,
          duplicateProfileId: r.duplicate_profile_id as string,
          matchedOn: r.matched_on as StrongMatchKind | "human_decision",
          legalBasis: (r.legal_basis as string | null) ?? null,
          decidedBy: (r.decided_by as string | null) ?? null,
          notes: (r.notes as string | null) ?? null,
          createdAt: r.created_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}

export type RecordIdentityEventResult =
  | { ok: true; id: string }
  | { ok: false; code: "needs_migration" | "not_authorized" | "invalid" | "error" };

/**
 * Record ONE audit event built by the pure builders in
 * lib/identity/identity-resolution.ts. Append-only: there is no update or
 * delete counterpart, by design (and the table trigger blocks both).
 */
export async function recordIdentityResolutionEvent(
  draft: IdentityResolutionEventDraft,
): Promise<RecordIdentityEventResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "record_identity_resolution_event_v1",
    {
      p_kind: draft.kind,
      p_primary_profile_id: draft.primaryProfileId,
      p_duplicate_profile_id: draft.duplicateProfileId,
      p_matched_on: draft.matchedOn,
      p_legal_basis: draft.legalBasis,
      p_notes: draft.notes,
    },
  );
  if (error) {
    if (isMissingRpcCode(error.code) || isMissingTableCode(error.code)) {
      return { ok: false, code: "needs_migration" };
    }
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    if (error.code === "22023") return { ok: false, code: "invalid" };
    console.error("[identity-resolution] record failed:", error.code);
    return { ok: false, code: "error" };
  }
  return { ok: true, id: String(data) };
}
