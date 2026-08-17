"use server";

/**
 * Worker document write path (W4 Slice 2).
 *
 * The `upsert_worker_document` RPC (20260610170000) shipped hardened and
 * audited — and had ZERO callers: the whole certificate/expiry/readiness/CV
 * chain read a table no user could fill. This action is that missing caller.
 *
 * Owner-scoped by the RPC itself (auth.uid() → own worker row); every write
 * lands in the append-only `worker_document_events` audit. No file upload
 * exists yet — the RPC carries facts about a document the worker HOLDS, and
 * the page says so honestly (`uploadNote`). Degrades fail-closed: while the
 * migration is unapplied (production today) the RPC is absent and the action
 * returns `needs_migration` — never a fake success.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_COUNTRIES } from "@/lib/config/documents";

export type WorkerDocumentSaveState =
  | { ok: true }
  | {
      ok: false;
      code:
        | "not_authenticated"
        | "no_worker"
        | "invalid"
        | "needs_migration"
        | "error";
    }
  | null;

const STATUSES = new Set(["missing", "ready", "blocked"]);
/** RPC absent (migration unapplied): undefined function / PostgREST miss /
 *  relation missing. */
const ABSENT_CODES = new Set(["42883", "PGRST202", "42P01", "PGRST205"]);

export async function upsertWorkerDocumentAction(
  _prev: WorkerDocumentSaveState,
  formData: FormData,
): Promise<WorkerDocumentSaveState> {
  const typeSlug = String(formData.get("document_type_slug") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const validFrom = String(formData.get("valid_from") ?? "").trim();
  const validUntil = String(formData.get("valid_until") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt").trim() || "lt";

  // App-side sanity only — the RPC re-validates everything server-side
  // (unknown type, bad status, bad country all raise 22023).
  if (typeSlug === "" || !STATUSES.has(status)) {
    return { ok: false, code: "invalid" };
  }
  if (
    country !== "" &&
    !(DOCUMENT_COUNTRIES as readonly string[]).includes(country)
  ) {
    return { ok: false, code: "invalid" };
  }
  if (note.length > 500) return { ok: false, code: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("upsert_worker_document", {
    p_document_type_slug: typeSlug,
    p_country: country,
    p_status: status,
    p_valid_from: validFrom,
    p_valid_until: validUntil,
    p_note: note,
  });

  if (error) {
    const code = error.code ?? "";
    if (ABSENT_CODES.has(code)) return { ok: false, code: "needs_migration" };
    if (code === "42501") return { ok: false, code: "not_authenticated" };
    if (code === "P0002") return { ok: false, code: "no_worker" };
    if (code === "22023") return { ok: false, code: "invalid" };
    return { ok: false, code: "error" };
  }

  revalidatePath(`/${locale}/dashboard/documents`);
  return { ok: true };
}

export type VerificationRequestState =
  | { ok: true }
  | {
      ok: false;
      code:
        | "not_authenticated"
        | "not_found"
        | "not_ready"
        | "needs_migration"
        | "error";
    };

/**
 * Worker sends their own `ready` document for admin verification
 * (→ `pending`). This is the missing caller of
 * `request_worker_document_verification` (20260613100200) — until now the
 * admin review queue could never be filled by a worker, so the approval
 * chain was broken at its first link. Ownership + the `ready` gate are
 * re-checked inside the RPC; the transition lands in the append-only
 * `worker_document_events` audit.
 */
export async function requestWorkerDocumentVerificationAction(input: {
  documentId: string;
  locale: string;
}): Promise<VerificationRequestState> {
  const documentId = String(input.documentId ?? "").trim();
  const locale = String(input.locale ?? "lt").trim() || "lt";
  // UUID shape check only — ownership is decided by the RPC.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
    return { ok: false, code: "not_found" };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "request_worker_document_verification",
    { p_document_id: documentId },
  );

  if (error) {
    const code = error.code ?? "";
    if (ABSENT_CODES.has(code)) return { ok: false, code: "needs_migration" };
    if (code === "42501") return { ok: false, code: "not_authenticated" };
    if (code === "P0002") return { ok: false, code: "not_found" };
    if (code === "22023") return { ok: false, code: "not_ready" };
    return { ok: false, code: "error" };
  }

  revalidatePath(`/${locale}/dashboard/documents`);
  return { ok: true };
}
