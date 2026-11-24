import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDashboardPath } from "@/lib/auth/role-gated-routes";

/**
 * F10 (owner P0 2026-11-15, production browser audit): "Open in the workspace"
 * on /for-workers and /for-companies took a signed-out visitor to the sign-in
 * page with no word of why. A workspace stage now opens sign-up that returns to
 * the same place, beside the note the public menus already print for signed-in
 * destinations. A public stage keeps its own link. No new copy (decision 0032).
 */
const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const section = read("components/marketing/work-lifecycle-section.tsx");
const graph = read("components/marketing/work-lifecycle-graph.tsx");

describe("public workspace links for a signed-out visitor (F10)", () => {
  it("every workspace stage has a sign-up link that returns to it; public stages have none", () => {
    expect(section).toMatch(/isDashboardPath\(href\.split\("\?"\)\[0\]\) \? `\/auth\/signup\?next=\$\{encodeURIComponent\(href\)\}` : undefined/);
    expect(section).toMatch(/guestHref: guestHref\(d\.href\)/);
    const hrefs = [...section.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(10);
    // The one public stage stays public; everything else is in the workspace.
    expect(hrefs.filter((h) => !isDashboardPath(h.split("?")[0]))).toEqual(["/company-need"]);
  });

  it("the graph uses the guest link and names the button Sign up while signed out", () => {
    expect(graph).toMatch(/useSignedInHint\(\)/);
    expect(graph).toMatch(/href=\{!signedIn && current\.guestHref \? current\.guestHref : current\.href\}/);
    // Owner 2026-11-24: the button itself says "Sign up" for a signed-out
    // visitor (the menus' own string, not new copy); no second note under it.
    expect(graph).toMatch(/\{!signedIn && current\.guestHref && accountLabel \? accountLabel : openLabel\} →/);
    expect(graph).not.toContain('data-testid="lifecycle-account-note"');
    expect(section).toMatch(/accountLabel=\{tNav\("signUp"\)\}/);
    expect(section).not.toMatch(/tNav\("account"\)/);
  });
});
