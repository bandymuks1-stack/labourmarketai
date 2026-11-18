import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A WORKSPACE SWITCH COMMITS AT ONCE (audit 2026-10-21, production walk run
 * 39486997781: the chip stayed on "Switching…" for 30 s).
 *
 * The switch runs in a transition; the action revalidates the layout. React
 * keeps an already-shown Suspense boundary's old content until the new one
 * resolves, so the whole switch waited for the slowest streamed read (the
 * bell's badges, the page). Boundaries keyed by the workspace are NEW after a
 * switch and may show their fallback, so the shell and the chip commit as soon
 * as the layout's own reads finish.
 */
const app = resolve(__dirname, "..", "..");
const layout = readFileSync(resolve(app, "app/[locale]/dashboard/layout.tsx"), "utf8");
const button = readFileSync(resolve(app, "components/app/organization/open-workspace-button.tsx"), "utf8");
const spine = readFileSync(resolve(app, "lib/notifications/spine.ts"), "utf8");

describe("a workspace switch does not wait for the slowest read", () => {
  it("the bell's boundary is keyed by the workspace", () => {
    expect(layout).toMatch(/<Suspense key=\{workspace\.activeWorkspaceId\} fallback=\{null\}>\s*<SpineStream/);
  });
  it("the page is wrapped in a workspace-keyed boundary with the section skeleton", () => {
    expect(layout).toMatch(/<Suspense key=\{workspace\.activeWorkspaceId\} fallback=\{<DashboardSectionLoading \/>\}>\s*\{children\}\s*<\/Suspense>/);
  });
  it("opening a workspace renders once (no second router.refresh in the same transition)", () => {
    expect(button).not.toMatch(/router\.refresh\(\)/);
  });
  it("the bell's cache key is the RESOLVED workspace, not the raw cookie", () => {
    const fn = spine.slice(spine.indexOf("async function badgeViewerKey"), spine.indexOf("/** 2026-10-19 perf"));
    expect(fn).toMatch(/const ws = await getWorkspaceContext\(\);/);
    expect(fn).not.toMatch(/ACTIVE_WORKSPACE_COOKIE/);
  });
});
