import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Speed P0 (2026-11-12): every page preloaded 13 font files (about 358 KB).
 * On a slow phone connection they competed with the stylesheet for the first
 * paint. Only the display and body faces, latin + latin-ext, are preloaded;
 * every other face stays in the stylesheet and loads when a page uses it.
 */
describe("font preload budget", () => {
  const layout = readFileSync(join(process.cwd(), "app", "[locale]", "layout.tsx"), "utf8");
  /** The options of one font role, found by its variable name in the layout. */
  const block = (role: "display" | "sans" | "accent" | "mono"): string => {
    const m = new RegExp(`const ${role} = \\w+\\(\\{([\\s\\S]*?)\\}\\);`).exec(layout);
    if (!m) throw new Error(`the ${role} font role is not configured in the locale layout`);
    return m[1];
  };

  it("the mono and accent faces are not preloaded", () => {
    expect(block("mono")).toContain("preload: false");
    expect(block("accent")).toContain("preload: false");
  });

  it("the body face preloads latin and latin-ext only", () => {
    expect(block("sans")).toContain('subsets: ["latin", "latin-ext"]');
    expect(block("sans")).not.toContain("preload: false");
  });

  it("the display face keeps its preload (it carries the first heading)", () => {
    expect(block("display")).toContain('subsets: ["latin", "latin-ext"]');
    expect(block("display")).not.toContain("preload: false");
  });
});
