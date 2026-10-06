/**
 * Per-organization stored-bytes fair-use cap (trial-readiness cost guardrail).
 *
 * Env: ORG_STORAGE_CAP_BYTES (default 2 GiB, clamped 0..1 TiB; garbage falls
 * back to the default).
 *
 * WHAT COUNTS (only what the schema can PROVE belongs to an organization):
 *   1. organization document files  document_files(scope='organization')
 *        -> org_documents.organization_id          (byte_size)
 *   2. journal entry photos         journal_entry_photos
 *        -> journal_entries.engagement_context_id
 *        -> engagement_contexts.organization_id    (file_size_bytes,
 *           upload_status = 'uploaded'; a context with NULL organization is
 *           PERSONAL and is never attributed to any org)
 *   Both are summed server-side by `org_storage_used_bytes_v1` (migration
 *   20261006100000), which also authorizes the caller (org member / admin).
 *
 * SCHEMA GAP (deliberately NOT counted, no provable organization relation):
 *   customer-request attachments (customers.profile_id only), conversation
 *   attachments (conversations have participants, no organization), profile
 *   avatars (profiles.avatar_url), worker-scope documents (worker_documents),
 *   CV imports (no storage at all). Their per-file caps remain the only bound.
 *
 * ENFORCEMENT: document uploads go through a server action (hard gate).
 * Journal photos upload browser-direct under per-user storage RLS, so the
 * check there is a client pre-check against the same RPC (fair-use guard, not
 * a tamper-proof one; a hard gate would need register_journal_entry_photo to
 * call the usage RPC — see the migration header).
 *
 * FAILURE POLICY: if neither the RPC nor the documents-only fallback can be
 * read, fail OPEN (per-file caps and RLS still apply), warned under the
 * greppable marker "[storage/org-quota]".
 */
export const DEFAULT_ORG_STORAGE_CAP_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_CAP = 1024 ** 4;

export function resolveOrgStorageCapBytes(
  raw: string | number | undefined = process.env.ORG_STORAGE_CAP_BYTES,
): number {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_ORG_STORAGE_CAP_BYTES;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ORG_STORAGE_CAP_BYTES;
  return Math.min(MAX_CAP, Math.max(0, Math.floor(n)));
}

export type OrgStorageAssessment = "ok" | "quota_exceeded";

/** The new object is refused when it would push the org OVER the cap. */
export function assessOrgStorage(
  storedBytes: number,
  incomingBytes: number,
  capBytes: number,
): OrgStorageAssessment {
  return storedBytes + incomingBytes > capBytes ? "quota_exceeded" : "ok";
}

interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}

interface DocFilesQuery {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): PromiseLike<{
        data: Array<{ byte_size: number | string | null }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
}

function warn(message: string | undefined): void {
  console.warn("[storage/org-quota] total unavailable", {
    message: (message ?? "unknown").slice(0, 200),
  });
}

/** Documents-only sum (the pre-RPC behaviour); used when the RPC is absent. */
export async function readOrgDocumentBytes(
  db: unknown,
  organizationId: string,
): Promise<number | null> {
  try {
    const { data, error } = await (db as DocFilesQuery)
      .from("document_files")
      .select("byte_size, org_documents!inner(organization_id)")
      .eq("org_documents.organization_id", organizationId);
    if (error || !data) {
      warn(error?.message ?? "no data");
      return null;
    }
    return data.reduce((sum, r) => sum + (Number(r.byte_size) || 0), 0);
  } catch (err) {
    warn(err instanceof Error ? err.message : undefined);
    return null;
  }
}

/**
 * Canonical total: `org_storage_used_bytes_v1(org)` (documents + journal
 * photos). Degrades to the documents-only sum when the RPC is not deployed
 * yet, then to null (caller fails open). Never throws.
 */
export async function readOrgStorageUsedBytes(
  db: unknown,
  organizationId: string,
): Promise<number | null> {
  try {
    const { data, error } = await (db as RpcClient).rpc(
      "org_storage_used_bytes_v1",
      { p_organization_id: organizationId },
    );
    if (!error && data !== null && data !== undefined) {
      const n = Number(data);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    console.warn(
      "[storage/org-quota] usage RPC unavailable — documents-only fallback",
      { code: error?.code, message: (error?.message ?? "no data").slice(0, 200) },
    );
  } catch (err) {
    console.warn(
      "[storage/org-quota] usage RPC threw — documents-only fallback",
      { message: (err instanceof Error ? err.message : "unknown").slice(0, 200) },
    );
  }
  return readOrgDocumentBytes(db, organizationId);
}

/** One call for upload paths: true = refuse. Never throws. */
export async function orgStorageQuotaExceeded(
  db: unknown,
  organizationId: string,
  incomingBytes: number,
  capBytes: number = resolveOrgStorageCapBytes(),
): Promise<boolean> {
  const stored = await readOrgStorageUsedBytes(db, organizationId);
  if (stored === null) return false;
  return assessOrgStorage(stored, incomingBytes, capBytes) === "quota_exceeded";
}

/**
 * The organization a journal entry's photo is attributable to, or null when
 * the entry is personal (engagement context without organization), not the
 * caller's, or the RPC is unavailable. Never throws.
 */
export async function resolveJournalEntryOrganizationId(
  db: unknown,
  entryId: string,
): Promise<string | null> {
  try {
    const { data, error } = await (db as RpcClient).rpc(
      "org_storage_journal_entry_org_v1",
      { p_entry_id: entryId },
    );
    if (error) {
      console.warn("[storage/org-quota] journal org lookup unavailable", {
        code: error.code,
        message: (error.message ?? "").slice(0, 200),
      });
      return null;
    }
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Journal-photo pre-check: true = refuse. Personal entries (no organization)
 * are never counted against any organization, so they are never refused here.
 */
export async function journalPhotoQuotaExceeded(
  db: unknown,
  entryId: string,
  incomingBytes: number,
  capBytes: number = resolveOrgStorageCapBytes(),
): Promise<boolean> {
  const orgId = await resolveJournalEntryOrganizationId(db, entryId);
  if (!orgId) return false;
  return orgStorageQuotaExceeded(db, orgId, incomingBytes, capBytes);
}
