import { describe, it, expect } from "vitest";
import {
  DEFAULT_ORG_STORAGE_CAP_BYTES,
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
});
