import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isVisionPublic } from "@/lib/config/vision-publication";

/**
 * /vision IS INTERNAL UNTIL IT IS PUBLISHED (owner P0 2026-11-10).
 *
 * While `VISION_PUBLIC` is false the page carried an "Internal preview — do
 * not share the URL publicly" banner, yet served it to anyone who had the URL.
 * It now renders for a platform superadmin only; everyone else, signed in or
 * not, gets a plain 404 (no login redirect, which would confirm the page
 * exists) and metadata without the page's title or description.
 */
const page = readFileSync(
  join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "vision", "page.tsx"),
  "utf8",
);

describe("/vision while unpublished", () => {
  it("the page answers 404 to anyone but a superadmin", () => {
    expect(page).toMatch(/if \(!publishedPublicly && !\(await isSuperadmin\(\)\)\) notFound\(\);/);
    expect(page).toContain('import { notFound } from "next/navigation";');
    expect(page).not.toMatch(/redirect\(/);
  });

  it("the metadata gives a non-admin no title or description", () => {
    const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default"));
    const gate = meta.indexOf("!(await isSuperadmin())");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(meta.indexOf('t("metaTitle")'));
  });

  it("is still unpublished — flipping it is an owner decision", () => {
    expect(isVisionPublic()).toBe(false);
  });
});
