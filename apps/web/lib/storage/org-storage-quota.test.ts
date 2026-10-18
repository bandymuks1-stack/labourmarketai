import { describe, it, expect } from "vitest";
import {
  DEFAULT_ORG_STORAGE_CAP_BYTES,
  journalPhotoQuotaExceeded,
  readOrgStorageUsedBytes,
  resolveJournalEntryOrganizationId,
  assessOrgStorage,
  orgStorageQuotaExceeded,
  readOrgDocumentBytes,
  resolveOrgStorageCapBytes,
} from "./org-storage-quota";

function db(res: { data: unknown; error: { message?: string } | null }, seen: string[] = []) {
  return {
    from: (t: string) => ({
      select: (c: string) => ({
        eq: async (col: string, v: string) => {
          seen.push(`${t}|${c}|${col}|${v}`);
          return res;
        },
      }),
    }),
  };
}

describe("org storage quota", () => {
  it("default 2 GiB, env parsed, garbage falls back", () => {
    expect(DEFAULT_ORG_STORAGE_CAP_BYTES).toBe(2147483648);
    expect(resolveOrgStorageCapBytes(undefined)).toBe(2147483648);
    expect(resolveOrgStorageCapBytes("1000")).toBe(1000);
    expect(resolveOrgStorageCapBytes("nope")).toBe(2147483648);
  });
  it("refuses only when stored + incoming exceeds the cap", () => {
    expect(assessOrgStorage(90, 10, 100)).toBe("ok");
    expect(assessOrgStorage(91, 10, 100)).toBe("quota_exceeded");
  });
  it("sums document_files bytes scoped to the org", async () => {
    const seen: string[] = [];
    const total = await readOrgDocumentBytes(
      db({ data: [{ byte_size: 100 }, { byte_size: "50" }], error: null }, seen),
      "org-1",
    );
    expect(total).toBe(150);
    expect(seen[0]).toContain("document_files");
    expect(seen[0]).toContain("org-1");
  });
  it("blocks when over, allows when under, fails open when unreadable", async () => {
    const full = db({ data: [{ byte_size: 95 }], error: null });
    expect(await orgStorageQuotaExceeded(full, "o", 10, 100)).toBe(true);
    expect(await orgStorageQuotaExceeded(full, "o", 5, 100)).toBe(false);
    const broken = db({ data: null, error: { message: "relation missing" } });
    expect(await orgStorageQuotaExceeded(broken, "o", 10, 100)).toBe(false);
  });

  describe("usage RPC (documents + journal photos)", () => {
    const rpcDb = (
      byFn: Record<string, { data: unknown; error: { message?: string; code?: string } | null }>,
      calls: string[] = [],
    ) => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push(`${fn}|${JSON.stringify(args)}`);
        return byFn[fn] ?? { data: null, error: { code: "42883", message: "missing" } };
      },
      from: () => ({
        select: () => ({ eq: async () => ({ data: [{ byte_size: 7 }], error: null }) }),
      }),
    });

    it("uses org_storage_used_bytes_v1 as the canonical total", async () => {
      const calls: string[] = [];
      const d = rpcDb({ org_storage_used_bytes_v1: { data: "1234", error: null } }, calls);
      expect(await readOrgStorageUsedBytes(d, "org-1")).toBe(1234);
      expect(calls[0]).toContain('"p_organization_id":"org-1"');
    });
    it("degrades to the documents-only sum when the RPC is absent", async () => {
      expect(await readOrgStorageUsedBytes(rpcDb({}), "org-1")).toBe(7);
    });
    it("refuses when RPC total + incoming exceeds the cap", async () => {
      const d = rpcDb({ org_storage_used_bytes_v1: { data: 95, error: null } });
      expect(await orgStorageQuotaExceeded(d, "o", 10, 100)).toBe(true);
      expect(await orgStorageQuotaExceeded(d, "o", 5, 100)).toBe(false);
    });
    it("journal photo: personal entry (no org) is never refused", async () => {
      const d = rpcDb({
        org_storage_journal_entry_org_v1: { data: null, error: null },
        org_storage_used_bytes_v1: { data: 10 ** 12, error: null },
      });
      expect(await resolveJournalEntryOrganizationId(d, "e1")).toBeNull();
      expect(await journalPhotoQuotaExceeded(d, "e1", 5, 100)).toBe(false);
    });
    it("journal photo: org entry is counted against the org total", async () => {
      const d = rpcDb({
        org_storage_journal_entry_org_v1: { data: "org-9", error: null },
        org_storage_used_bytes_v1: { data: 98, error: null },
      });
      expect(await journalPhotoQuotaExceeded(d, "e1", 5, 100)).toBe(true);
      expect(await journalPhotoQuotaExceeded(d, "e1", 2, 100)).toBe(false);
    });
    it("journal photo: entry-org RPC absent fails open", async () => {
      expect(await journalPhotoQuotaExceeded(rpcDb({}), "e1", 5, 0)).toBe(false);
    });
  });
});
