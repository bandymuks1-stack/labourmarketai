/**
 * Per-organization stored-bytes fair-use cap (trial-readiness cost guardrail).
 *
 * Pure decision + one reader. Env: ORG_STORAGE_CAP_BYTES (default 2 GiB,
 * clamped 0..1 TiB; garbage falls back to the default).
 *
 * WHAT IS REAL TODAY: organization-level totals are computable ONLY for
 * organization DOCUMENT FILES (`document_files.byte_size` joined through
 * `org_documents.organization_id`), and the upload runs through a server
 * action, so that path is gated.
 *
 * WHAT IS NOT (needs owner decision / a migration, deliberately not faked):
 * journal photos, customer-request attachments, conversation attachments and
 * CV imports are uploaded browser-direct to storage under per-user RLS and
 * only registered afterwards; their metadata tables carry no organization id
 * and there is no storage-side quota RPC/policy. Capping them honestly needs
 * a quota-checking SECURITY DEFINER RPC or storage policy (migration, owner
 * approval). Their per-file caps (5/5/10/10/25 MB) remain the only bound.
 *
 * FAILURE POLICY: fail-open when the total cannot be read (per-file caps and
 * RLS still apply); warned under a greppable marker.
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

/** Sum of an organization's document-file bytes (all versions), or null. */
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
      console.warn("[storage/org-quota] total unavailable — failing open", {
        message: (error?.message ?? "no data").slice(0, 200),
      });
      return null;
    }
    return data.reduce((sum, r) => sum + (Number(r.byte_size) || 0), 0);
  } catch (err) {
    console.warn("[storage/org-quota] total unavailable — failing open", {
      message: (err instanceof Error ? err.message : "unknown").slice(0, 200),
    });
    return null;
  }
}

/** One call for upload paths: true = refuse. Never throws. */
export async function orgStorageQuotaExceeded(
  db: unknown,
  organizationId: string,
  incomingBytes: number,
  capBytes: number = resolveOrgStorageCapBytes(),
): Promise<boolean> {
  const stored = await readOrgDocumentBytes(db, organizationId);
  if (stored === null) return false;
  return assessOrgStorage(stored, incomingBytes, capBytes) === "quota_exceeded";
}
