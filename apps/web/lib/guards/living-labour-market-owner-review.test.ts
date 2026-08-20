import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(__dirname, "..", "..");
const routeRoot = join(webRoot, "app", "[locale]", "living-labour-market");

const readRoute = (file: string) => readFileSync(join(routeRoot, file), "utf8");

describe("living labour market owner-review surface", () => {
  const page = readRoute("page.tsx");
  const client = readRoute("living-labour-market.tsx");
  const canvas = readRoute("living-world-canvas.ts");
  const css = readRoute("living-labour-market.module.css");
  const publicReader = readFileSync(
    join(webRoot, "lib", "market", "living-market-public.ts"),
    "utf8",
  );

  it("is a no-index isolated route backed by the canonical public vacancy projection", () => {
    expect(page).toContain("robots: { index: false, follow: false }");
    expect(page).toContain("readLivingMarketPublicSnapshot");
    expect(publicReader).toContain("readPublicVacancySupplyCounts");
    expect(publicReader).toContain("searchPublicVacancyPreviews");
    expect(publicReader).toContain(
      "vacancy coordinates are deliberately not available",
    );
  });

  it("renders the world from code rather than a shipped hero image or video", () => {
    const implementation = `${client}\n${canvas}\n${css}`;
    expect(client).toContain("<canvas");
    expect(canvas).toContain("shippedRasterAssets: 0");
    expect(canvas).toContain("runtimeDependenciesAdded: 0");
    expect(implementation).not.toMatch(
      /next\/image|<img|<video|\.webm|\.mp4|\.jpe?g|\.png/i,
    );
    expect(implementation).not.toContain("codex-clipboard");
  });

  it("keeps truth labels, reduced motion and UI-free world inspection explicit", () => {
    expect(client).toContain('data-kind="live"');
    expect(client).toContain('data-kind="illustrative"');
    expect(client).toContain("matchMedia");
    expect(client).toContain("worldOnly");
    expect(css).toContain('[data-world-only="true"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
