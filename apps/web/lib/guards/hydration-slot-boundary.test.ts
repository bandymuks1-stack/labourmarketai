import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * React #418 (2026-10-09): server-authored slots (`children`, `rexora`, the
 * full-mode header/bottom nav) reach DashboardChrome from the RSC payload and
 * can still be LAZY when hydration reaches `<main>`. Directly under a host
 * element, that suspension replays the host claim with an already-advanced
 * hydration cursor and throws #418 intermittently. A non-DOM function
 * component (`SlotBoundary`) between the host element and the slots is the
 * fix; this guard keeps every slot behind it.
 */
const src = readFileSync(join(__dirname, "../../components/app/dashboard-chrome.tsx"), "utf8");

describe("DashboardChrome keeps RSC slots behind a non-DOM boundary", () => {
  it("defines SlotBoundary as a plain pass-through", () => {
    expect(src).toMatch(/function SlotBoundary\(\{ children \}[^)]*\) \{\s*return <>\{children\}<\/>;\s*\}/);
  });

  it("every <main> opens with SlotBoundary, never a bare slot", () => {
    const mains = [...src.matchAll(/<main className="[^"]*">([\s\S]*?)<\/main>/g)].map((m) => m[1].trim());
    expect(mains.length).toBeGreaterThanOrEqual(2);
    for (const body of mains) {
      expect(body.startsWith("<SlotBoundary>")).toBe(true);
      expect(body.endsWith("</SlotBoundary>")).toBe(true);
    }
  });

  it("the full-mode header and bottom-nav slots are wrapped too", () => {
    expect(src).toMatch(/<SlotBoundary>\{fullHeader\}<\/SlotBoundary>/);
    expect(src).toMatch(/<SlotBoundary>\{fullBottomNav\}<\/SlotBoundary>/);
  });
});
