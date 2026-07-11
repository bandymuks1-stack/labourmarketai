import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  deriveDocumentStatus,
  listMyDocuments,
  type DocumentsListResult,
} from "@/lib/documents/readiness";
import {
  DOC_CENTRE_VERIFICATION_READ_LIMIT,
  deriveDocumentAttention,
  summarizeOrgDocsAggregates,
  type CentreDocumentRow,
  type DocumentAttention,
  type DocumentVerificationState,
  type OrgDocsSummary,
} from "@/lib/documents/document-centre-model";

/**
 * Document & work-proof centre — server composition (control room PR H,
 * gap map §8).
 *
 * ONE discoverable centre over the axes that ALREADY exist — composition
 * only. No data moves, no second store, no new table, no bucket, no upload:
 *
 *   - Worker documents ride the EXISTING read layer `listMyDocuments()`
 *     (lib/documents/readiness.ts) with its own disabled / needs-migration /
 *     no-worker degradation. Statuses stay that lib's derivation
 *     (valid_until 30-day window; expired → missing).
 *   - The verification axis (20260613100200) is read separately and
 *     DEGRADES INDEPENDENTLY: in an environment where the column is not
 *     applied the select fails and every row carries `verification: null` —
 *     the page then shows no verification claim at all.
 *   - Work-proof counts are caller-scoped HEAD counts on the same journal
 *     tables lib/journal/project-gallery.ts already reads (journal_entries,
 *     journal_entry_photos) — the worker's own rows under the worker's own
 *     RLS. Errors degrade to null ("counts unavailable"), never a fake zero.
 *   - Org callers get ONLY what the applied s6 consent aggregate provides:
 *     `agency_pool_docs_readiness()` (ledger s6_worker_docs_consent) —
 *     category COUNTS of consented pool workers. Not an agency owner or
 *     RPC unavailable → an honest note; NEVER a new privileged read (no
 *     admin client anywhere in this layer).
 *
 * Read-only: no insert/update/delete/upsert, no storage access, and the only
 * RPC is the already-applied consent-gated aggregate above.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type DocumentInventory =
  | {
      readonly kind: "ok";
      readonly documents: readonly CentreDocumentRow[];
      /** Active document type slugs (filter chips validate against these). */
      readonly typeSlugs: readonly string[];
      /** False → the verification column is not readable here; every row
       *  carries verification: null and the page claims nothing. */
      readonly verificationAvailable: boolean;
      readonly attention: DocumentAttention;
      /** The raw readiness result — the page keeps rendering the existing
       *  country-readiness section from it unchanged (no duplicate read). */
      readonly readiness: Extract<DocumentsListResult, { kind: "ok" }>;
    }
  | { readonly kind: "disabled" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "no-worker" }
  | { readonly kind: "error" };

export type WorkProofSummary = {
  /** Own journal entries (head count) — null when not readable. */
  readonly journalEntryCount: number | null;
  /** Own uploaded journal photos (head count) — null when not readable. */
  readonly journalPhotoCount: number | null;
};

export type WorkerDocumentCentre = {
  readonly inventory: DocumentInventory;
  readonly workProof: WorkProofSummary;
};

const NO_COUNTS: WorkProofSummary = {
  journalEntryCount: null,
  journalPhotoCount: null,
};

/** The caller's own worker id (same `workers` lookup readiness.ts performs);
 *  null when signed out or no worker profile exists. */
async function getOwnWorkerId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return (worker?.id as string | undefined) ?? null;
}

/** Verification states per document id. null = the axis is not readable in
 *  this environment (column not applied / read failed) — degrade, don't guess. */
async function readVerificationByDocument(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ReadonlyMap<string, DocumentVerificationState> | null> {
  try {
    const { data, error } = await asAny(supabase)
      .from("worker_documents")
      .select("id, verification")
      .eq("worker_id", workerId)
      .limit(DOC_CENTRE_VERIFICATION_READ_LIMIT);
    if (error) return null; // 42703 column absent, or any other failure
    const map = new Map<string, DocumentVerificationState>();
    for (const row of (data ?? []) as { id: string; verification: string }[]) {
      if (
        row.verification === "unverified" ||
        row.verification === "pending" ||
        row.verification === "verified" ||
        row.verification === "rejected"
      ) {
        map.set(row.id, row.verification);
      }
    }
    return map;
  } catch {
    return null;
  }
}

/** Caller-scoped work-proof HEAD counts on the same tables the project
 *  gallery lib already reads — own rows only (worker_id = own worker). */
async function readOwnJournalProofCounts(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkProofSummary> {
  try {
    const [entriesRes, photosRes] = await Promise.all([
      asAny(supabase)
        .from("journal_entries")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", workerId)
        .is("deleted_at", null),
      asAny(supabase)
        .from("journal_entry_photos")
        .select("id, journal_entries!inner(worker_id, deleted_at)", {
          count: "exact",
          head: true,
        })
        .eq("journal_entries.worker_id", workerId)
        .is("journal_entries.deleted_at", null)
        .eq("upload_status", "uploaded"),
    ]);
    return {
      journalEntryCount:
        !entriesRes.error && typeof entriesRes.count === "number"
          ? entriesRes.count
          : null,
      journalPhotoCount:
        !photosRes.error && typeof photosRes.count === "number"
          ? photosRes.count
          : null,
    };
  } catch {
    return NO_COUNTS;
  }
}

/** Compose the worker view. Every source degrades independently. */
export async function getWorkerDocumentCentre(): Promise<WorkerDocumentCentre> {
  const supabase = await createClient();
  const [readiness, workerId] = await Promise.all([
    listMyDocuments(),
    getOwnWorkerId(supabase),
  ]);

  const workProof = workerId
    ? await readOwnJournalProofCounts(supabase, workerId)
    : NO_COUNTS;

  if (readiness.kind !== "ok") {
    return {
      inventory:
        readiness.kind === "error" ? { kind: "error" } : { kind: readiness.kind },
      workProof,
    };
  }

  const verification =
    workerId !== null
      ? await readVerificationByDocument(supabase, workerId)
      : null;

  const now = new Date();
  const documents: CentreDocumentRow[] = readiness.documents.map((d) => ({
    id: d.id,
    documentTypeSlug: d.documentTypeSlug,
    country: d.country,
    validUntil: d.validUntil,
    derivedStatus: deriveDocumentStatus(d, now),
    // A row missing from the (bounded) verification read carries null —
    // "no claim" — never a defaulted state.
    verification: verification?.get(d.id) ?? null,
  }));

  return {
    inventory: {
      kind: "ok",
      documents,
      typeSlugs: readiness.typeSlugs,
      verificationAvailable: verification !== null,
      attention: deriveDocumentAttention(documents),
      readiness,
    },
    workProof,
  };
}

export type OrgDocumentCentre =
  | { readonly kind: "ok"; readonly summary: OrgDocsSummary }
  /** RPC not applied / failed — the honest managers note renders instead. */
  | { readonly kind: "unavailable" };

/**
 * Org caller view — ONLY the applied consent-gated aggregate RPC
 * (`agency_pool_docs_readiness`, s6): category counts of consented pool
 * workers. A non-agency org owner gets an empty set from the RPC itself
 * (its own gate) → summary with 0 workers → the page's honest note.
 */
export async function getOrgDocumentCentre(): Promise<OrgDocumentCentre> {
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc(
      "agency_pool_docs_readiness",
    );
    if (error || !Array.isArray(data)) return { kind: "unavailable" };
    const rows = (data as {
      worker_id: string;
      docs_total: number;
      docs_valid: number;
      docs_expiring: number;
      docs_attention: number;
    }[]).map((r) => ({
      workerId: r.worker_id,
      docsTotal: r.docs_total ?? 0,
      docsValid: r.docs_valid ?? 0,
      docsExpiring: r.docs_expiring ?? 0,
      docsAttention: r.docs_attention ?? 0,
    }));
    return { kind: "ok", summary: summarizeOrgDocsAggregates(rows) };
  } catch {
    return { kind: "unavailable" };
  }
}
