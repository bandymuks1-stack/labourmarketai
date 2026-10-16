import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSuperadmin } from "@/lib/auth/superadmin";
import { isPrivacyRequestPayload } from "@/lib/privacy/privacy-request-model";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GDPR ERASURE — phase 3 of the admin privacy queue (#856, erasure v2).
 *
 * The executor is the database function `erase_user_account_v2`
 * (migration 20261015200000). This module only:
 *   1. checks the caller is a superadmin and the row is an APPROVED
 *      account-deletion privacy request (a human reviewed it first);
 *   2. rehearses: the function's DEFAULT is a dry run that performs the whole
 *      erasure inside a subtransaction and rolls it back, so the preview is
 *      the real outcome — refusals carry the exact table/column and reason;
 *   3. executes on an explicit typed confirmation: the person's files are
 *      removed through the Storage API first (SQL cannot delete the stored
 *      bytes), then the function runs for real and writes its append-only
 *      receipt.
 * The service-role client is used ONLY for the executor call and the
 * Storage API, after the superadmin check. Nothing is erased implicitly: a
 * page render never runs a rehearsal unless the operator asked for one.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const FUNCTION_MISSING = "PGRST202";
const UNDEFINED_FUNCTION = "42883";
export const ERASURE_CONFIRMATION_WORD = "ERASE";

export interface ErasureStep {
  readonly table: string;
  readonly column: string | null;
  readonly rows: number;
  readonly treatment: string;
}
export interface ErasureRefusal {
  readonly table: string | null;
  readonly column: string | null;
  readonly rows: number | null;
  readonly reason: string;
  readonly objects: readonly { readonly bucket: string; readonly name: string }[];
}

export type ErasureOutcome =
  | { readonly kind: "executable"; readonly plan: readonly ErasureStep[] }
  | { readonly kind: "refused"; readonly refusals: readonly ErasureRefusal[]; readonly plan: readonly ErasureStep[] }
  | { readonly kind: "erased"; readonly plan: readonly ErasureStep[] }
  | { readonly kind: "not-superadmin" }
  | { readonly kind: "not-found" }
  | { readonly kind: "not-deletion-request" }
  | { readonly kind: "not-approved" }
  | { readonly kind: "bad-confirmation" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Pure: the executor's jsonb result → a typed outcome. Unknown shapes fail closed. */
export function readErasureResult(raw: unknown): ErasureOutcome {
  if (!raw || typeof raw !== "object") return { kind: "error" };
  const r = raw as Record<string, unknown>;
  const plan: ErasureStep[] = (Array.isArray(r.plan) ? r.plan : []).flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const s = p as Record<string, unknown>;
    const table = str(s.table);
    const treatment = str(s.treatment);
    return table && treatment ? [{ table, column: str(s.column), rows: num(s.rows) ?? 0, treatment }] : [];
  });
  const refusals: ErasureRefusal[] = (Array.isArray(r.refusals) ? r.refusals : []).flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const s = p as Record<string, unknown>;
    const reason = str(s.reason);
    if (!reason) return [];
    const objects = (Array.isArray(s.objects) ? s.objects : []).flatMap((o) => {
      const x = (o ?? {}) as Record<string, unknown>;
      const bucket = str(x.bucket);
      const name = str(x.name);
      return bucket && name ? [{ bucket, name }] : [];
    });
    return [{ table: str(s.table), column: str(s.column), rows: num(s.rows), reason, objects }];
  });
  if (r.erased === true) return { kind: "erased", plan };
  if (refusals.length > 0 || r.executable !== true) {
    return refusals.length > 0 ? { kind: "refused", refusals, plan } : { kind: "error" };
  }
  return { kind: "executable", plan };
}

type Target =
  | { readonly kind: "ok"; readonly profileId: string; readonly adminId: string; readonly status: string }
  | Exclude<ErasureOutcome, { kind: "executable" | "refused" | "erased" }>;

async function loadTarget(requestId: string): Promise<Target> {
  if (!requestId.trim()) return { kind: "not-found" };
  if (!(await isSuperadmin())) return { kind: "not-superadmin" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-superadmin" };
  const { data, error } = await asAny(supabase)
    .from("customer_requests")
    .select("id, profile_id, status, payload")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return { kind: "error" };
  if (!data) return { kind: "not-found" };
  if (!isPrivacyRequestPayload(data.payload)) return { kind: "not-deletion-request" };
  const type = (data.payload as Record<string, unknown>)?.privacy_request_type;
  if (type !== "account_deletion" || typeof data.profile_id !== "string") {
    return { kind: "not-deletion-request" };
  }
  return { kind: "ok", profileId: data.profile_id, adminId: user.id, status: String(data.status) };
}

async function callExecutor(
  target: { profileId: string; adminId: string },
  requestId: string,
  dryRun: boolean,
): Promise<ErasureOutcome> {
  const admin = createAdminClient();
  const { data, error } = await asAny(admin).rpc("erase_user_account_v2", {
    p_user_id: target.profileId,
    p_request_id: requestId,
    p_executed_by: target.adminId,
    p_dry_run: dryRun,
  });
  if (error) {
    return error.code === FUNCTION_MISSING || error.code === UNDEFINED_FUNCTION
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }
  return readErasureResult(data);
}

/** Rehearsal (dry run) — changes nothing. Allowed while in review or approved. */
export async function rehearseErasure(requestId: string): Promise<ErasureOutcome> {
  const target = await loadTarget(requestId);
  if (target.kind !== "ok") return target;
  return callExecutor(target, requestId, true);
}

/**
 * Execution — only for an APPROVED request and the typed confirmation word.
 * Storage files the rehearsal names are removed first; anything else that
 * refuses stops the run before a single row changes.
 */
export async function executeErasure(requestId: string, confirmation: string): Promise<ErasureOutcome> {
  if (confirmation.trim() !== ERASURE_CONFIRMATION_WORD) return { kind: "bad-confirmation" };
  const target = await loadTarget(requestId);
  if (target.kind !== "ok") return target;
  if (target.status !== "approved") return { kind: "not-approved" };

  let rehearsal = await callExecutor(target, requestId, true);
  if (rehearsal.kind === "refused") {
    const onlyStorage = rehearsal.refusals.every((r) => r.table === "storage.objects");
    if (!onlyStorage) return rehearsal;
    const admin = createAdminClient();
    const byBucket = new Map<string, string[]>();
    for (const r of rehearsal.refusals) {
      for (const o of r.objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
    }
    for (const [bucket, names] of byBucket) {
      const { error } = await admin.storage.from(bucket).remove(names);
      if (error) return { kind: "error" };
    }
    rehearsal = await callExecutor(target, requestId, true);
  }
  if (rehearsal.kind !== "executable") return rehearsal;
  return callExecutor(target, requestId, false);
}
