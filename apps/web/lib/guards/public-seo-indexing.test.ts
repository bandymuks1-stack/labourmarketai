import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEO_AUDIT_FILES,
  auditPublicSeoIndexing,
} from "@/lib/seo/seo-indexing-audit";

/**
 * CI guard (has teeth — runs under `pnpm -F web test`) for the public
 * SEO indexing foundation. Locks the apex-canonical / www→apex /
 * robots / sitemap / brand / no-fake-claims invariants. See
 * lib/seo/seo-indexing-audit.ts for the checks and
 * docs/audit/public-seo-indexing-foundation-v1.md for the rationale.
 */
const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string | null {
  try {
    return readFileSync(join(APP_ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

describe("public SEO indexing foundation guard", () => {
  it("all audited SEO files exist", () => {
    for (const rel of SEO_AUDIT_FILES) {
      expect(read(rel), `${rel} missing`).not.toBeNull();
    }
  });

  it("passes the public SEO indexing audit (no violations)", () => {
    const { violations } = auditPublicSeoIndexing(read);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
