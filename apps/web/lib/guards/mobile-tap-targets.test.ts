/**
 * Guard: mobile tap floor (window 6, P0-G, 2026-09-06).
 *
 * Measured on production at 390 px (walk-tap-targets-prod.cjs, build a4bebd9e):
 * 86 primary controls under 40 px — 13x13 checkboxes, 24-32 px chips, 16 px
 * flex links — spread over ~40 files of hand-typed class strings. Geometry
 * cannot be proven without a browser, so this guard pins the SOURCE-LEVEL
 * shape of the fix instead, so the floor cannot be quietly removed:
 *
 *   1. globals.css carries ONE scoped floor rule (button / [role=button] /
 *      a[href] + checkbox/radio labels, ≥ 2.5rem, below `md`).
 *   2. The rule's two anchors exist: `[data-chrome]` on both authenticated
 *      shells and `[data-mobile-sheet]` on the portalled sheet.
 *   3. The shared Button primitive's `sm` size reaches 40 px on phones on its
 *      own (it is also used outside the shell) without fighting `min-h-11`.
 *   4. Checkboxes in the authenticated surfaces are wrapped in a <label> (the
 *      tap area) — ratchet on the count of bare ones.
 *
 * Runtime proof stays with the production walk:
 * docs/launch/pilot-feedback/walks-2026-09-06/walk-tap-targets/walk-tap-targets-prod.cjs
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

describe("Guard: mobile tap floor lives once in globals.css", () => {
  const css = read("app/globals.css");
  const block = css.match(/@media \(max-width: 767\.98px\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  it("a below-md media block scopes the floor to the shell and the sheet", () => {
    expect(block, "the mobile tap-floor block is gone").not.toBe("");
    expect(block).toMatch(/:is\(\[data-chrome\], \[data-mobile-sheet\]\)/);
  });

  it("buttons, role=button and links get a 2.5rem (40px) min-height AND min-width", () => {
    const rule = block.match(/:is\(button, \[role="button"\], a\[href\]\)[\s\S]*?\}/)?.[0] ?? "";
    expect(rule, "control selector missing").not.toBe("");
    expect(rule).toMatch(/min-height:\s*2\.5rem/);
    expect(rule).toMatch(/min-width:\s*2\.5rem/);
    // Text stays centred in blockified flex-child anchors.
    expect(rule).toMatch(/align-content:\s*center/);
    // Prose links and third-party map chrome are exempt by design.
    expect(rule).toMatch(/p \*/);
    expect(rule).toMatch(/\.leaflet-container \*/);
  });

  it("checkbox/radio labels (the real tap area) get the same floor", () => {
    const rule =
      block.match(/label:has\(> input\[type="checkbox"\], > input\[type="radio"\]\)[\s\S]*?\}/)?.[0] ?? "";
    expect(rule, "label selector missing").not.toBe("");
    expect(rule).toMatch(/min-height:\s*2\.5rem/);
  });

  it("the floor is mobile-only (nothing under 767.98px is redefined for desktop)", () => {
    expect(css.match(/@media \(max-width: 767\.98px\)/g)?.length).toBe(1);
  });
});

describe("Guard: the floor's anchors exist", () => {
  it("both authenticated shells carry data-chrome (dashboard-chrome.tsx)", () => {
    const src = read("components/app/dashboard-chrome.tsx");
    expect(src).toMatch(/data-chrome="simple"/);
    expect(src).toMatch(/data-chrome="full"/);
  });

  it("the portalled MobileSheet carries data-mobile-sheet on its dialog root", () => {
    const src = read("components/ui/MobileSheet.tsx");
    expect(src).toMatch(/role="dialog"[\s\S]{0,400}data-mobile-sheet/);
  });
});

describe("Guard: shared Button reaches 40px on phones by itself", () => {
  const src = read("components/ui/Button.tsx");
  const sizes = src.match(/const sizes: Record<Size, string> = \{([\s\S]*?)\};/)?.[1] ?? "";

  it("sm = 36px on desktop (py-2) and 40px below md (max-md:py-2.5), no responsive min-h that could beat min-h-11", () => {
    const sm = sizes.match(/sm: "([^"]+)"/)?.[1] ?? "";
    expect(sm).toContain("py-2 ");
    expect(sm).toContain("max-md:py-2.5");
    expect(sm).not.toMatch(/max-md:min-h/);
  });

  it("md keeps py-3 (44px) and the pill keeps min-h-11", () => {
    expect(sizes.match(/md: "([^"]+)"/)?.[1]).toContain("py-3");
    expect(src.match(/pill: "([^"]+)"/)?.[1]).toContain("min-h-11");
  });
});

describe("Guard: checkboxes in authenticated surfaces are wrapped in a <label>", () => {
  // Baseline 2026-09-06 after the review-toggle fix: 3 left
  // (notification-preferences-section.tsx ×2, timesheet-import-review.tsx) —
  // not on a launch-walked surface. Only go down.
  const BARE_BASELINE = 3;

  it(`bare <input type="checkbox"> (no wrapping <label>, no id) stay ≤ ${BARE_BASELINE}`, () => {
    const files = [
      ...walk(join(APP, "components", "app")),
      ...walk(join(APP, "app", "[locale]", "dashboard")),
    ];
    const bare: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const re = /<input\b[^>]*type="checkbox"[^>]*>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const before = src.slice(0, m.index);
        const wrapped = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
        const bound = /\bid=/.test(m[0]);
        if (!wrapped && !bound) bare.push(f.slice(APP.length + 1).replace(/\\/g, "/") + ":" + before.split("\n").length);
      }
    }
    expect(bare, "a new checkbox without a <label> tap area:\n" + bare.join("\n")).toHaveLength(
      Math.min(bare.length, BARE_BASELINE),
    );
    expect(bare.length).toBeLessThanOrEqual(BARE_BASELINE);
  });

  it("the worker-ops review toggle is a <label>, not a <div>", () => {
    const src = read("components/app/worker-operations-role-form.tsx");
    expect(src).toMatch(/<label className="flex items-center gap-2 text-meta text-text-muted">\s*<input\s+type="checkbox"/);
  });
});
