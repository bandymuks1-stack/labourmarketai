import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Always-on Sample affordance guard (platform doctrine §7 — no unlabeled fake
 * data). The `Placeholder` component must, in production (marker env off),
 * still render a visible `sample` affordance for fabricated values, and only
 * render clean once a value is promoted to real data (status === "replaced").
 *
 * Source-scan: the component is an async server component (uses next-intl
 * server `getLocale`), so we assert the honest-rendering structure at the
 * source level rather than rendering it headless.
 */
const WEB = resolve(__dirname, "..", "..");
const SRC = readFileSync(join(WEB, "components/ui/Placeholder.tsx"), "utf8");

describe("Placeholder always-on Sample affordance", () => {
  it("branches on real (replaced) vs fabricated data", () => {
    expect(SRC).toMatch(/entry\.status\s*===\s*["']replaced["']/);
  });

  it("renders a visible sample affordance for fabricated values", () => {
    expect(SRC).toContain("data-sample");
    expect(SRC).toMatch(/>\s*sample\s*</i);
  });

  it("does not have a production path that returns content with no status check", () => {
    // The old unconditional clean return (`if (!showMarker) return <span...>content</span>`)
    // must be gone — clean render is now gated behind isReplaced.
    expect(SRC).toMatch(/if\s*\(\s*isReplaced\s*\)/);
  });
});
