import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sitemap route-truth guard (findings F-N3 / F-N4, consolidation train
 * 2026-07-02).
 *
 * Contract:
 *   - `/vision` never sits unconditionally in the sitemap while its page is
 *     flag-gated to noindex — it must ride `isVisionPublic()` so the crawler
 *     signals can't contradict each other.
 *   - `/legal/marketplace-rules` (footer-linked) is listed alongside the
 *     other legal pages.
 */

const APP = join(process.cwd());
const sitemap = readFileSync(join(APP, "app/sitemap.ts"), "utf-8");

describe("sitemap matches route reality", () => {
  it("vision entry is gated by the publication flag, not hardcoded", () => {
    expect(sitemap).toMatch(/isVisionPublic\(\)\s*\?\s*\["\/vision"\]/);
    // No unconditional listing left behind.
    const staticBlock = sitemap.match(
      /STATIC_PATHS: readonly string\[\] = \[([\s\S]*?)\];/,
    )?.[1];
    expect(staticBlock).toBeTruthy();
    expect(staticBlock).not.toContain('"/vision"');
  });

  it("marketplace-rules is listed with the other legal pages", () => {
    expect(sitemap).toContain('"/legal/marketplace-rules"');
  });
});
