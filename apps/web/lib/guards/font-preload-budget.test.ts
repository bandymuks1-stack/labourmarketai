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
  const block = (name: string): string => {
    const m = new RegExp(`const \\w+ = ${name}\\(\\{([\\s\\S]*?)\\}\\);`).exec(layout);
    if (!m) throw new Error(`${name} is not configured in the locale layout`);
    return m[1];
  };

  it("the mono and accent faces are not preloaded", () => {
    expect(block("JetBrains_Mono")).toContain("preload: false");
    expect(block("Instrument_Serif")).toContain("preload: false");
  });

  it("the body face preloads latin and latin-ext only", () => {
    expect(block("Inter")).toContain('subsets: ["latin", "latin-ext"]');
    expect(block("Inter")).not.toContain("preload: false");
  });

  it("the display face keeps its preload (it carries the first heading)", () => {
    expect(block("Bricolage_Grotesque")).toContain('subsets: ["latin", "latin-ext"]');
    expect(block("Bricolage_Grotesque")).not.toContain("preload: false");
  });
});
