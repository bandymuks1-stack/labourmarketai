import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY DROPDOWN IN THE AUTHENTICATED HEADER ESCAPES THE HEADER (owner
 * window 11 §25/§27, 2026-09-07).
 *
 * THE DEFECT. The owner opened the language selector on the production
 * dashboard and the options rendered BEHIND the map — and only the first two
 * languages appeared at all, which §27 read as "the product supports only
 * Lithuanian and English". Both observations are the SAME defect: five rows
 * were rendered, and the map card covered the ones past the header's own
 * height.
 *
 * THE CAUSE, measured in a browser on 2026-09-07 (Chromium, 1280×800),
 * reproducing the production geometry — a `backdrop-blur` header holding an
 * `absolute z-50` panel, followed in DOM order by a map card carrying
 * Leaflet's `z-index: 400` pane and `isolation: isolate`:
 *
 *   in-header panel   row1 → BUTTON, row2..row5 → MAIN   (the map wins)
 *   same DOM, panel moved to document.body at fixed z-60
 *                     row1..row5 → themselves            (all reachable)
 *
 * `isolation: isolate` on the map does NOT save the header: `backdrop-filter`
 * makes the HEADER a stacking context too, so the two compete at the root
 * where DOM order decides — and the map comes later. This is stated in
 * `components/ui/anchored-overlay.tsx`, which exists because
 * `NotificationPanel`, `AccountMenu` and `WorkspaceChip` lost this exact
 * fight in production (owner audit P0.3).
 *
 * WHY THE OLD GUARD DID NOT CATCH IT. `premium-design-pass.test.ts` asserts
 * the portal contract over a HAND-WRITTEN list of three components.
 * `LocaleSwitcher` sits in the same header cluster, one JSX line away from
 * two of them, and was simply not on the list. This guard derives the list
 * from the header's own imports instead, so a dropdown added to the header
 * tomorrow is enrolled without anyone remembering to enrol it.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Every shell header a signed-in person can see a map under. */
const HEADERS = [
  "components/app/conversation/chat/conversation-header.tsx",
  "components/app/dashboard-chrome.tsx",
] as const;

/** An import specifier → the file on disk, or null. `@/components/...` and
 *  relative siblings (`./workspace-chip`) are both part of the cluster. */
function resolveComponent(spec: string, fromFile: string): string | null {
  const rel = spec.startsWith("@/")
    ? spec.slice(2)
    : join(fromFile.split(/[\\/]/).slice(0, -1).join("/"), spec).replace(/\\/g, "/");
  for (const candidate of [`${rel}.tsx`, `${rel}.ts`, `${rel}/index.tsx`]) {
    if (existsSync(join(APP, candidate))) return candidate;
  }
  return null;
}

function importedComponents(headerSrc: string): string[] {
  const specs = new Set<string>();
  for (const m of headerSrc.matchAll(/from\s+"(@\/components\/[^"]+|\.\.?\/[^"]+)"/g)) {
    specs.add(m[1]);
  }
  return [...specs];
}

/**
 * Does this file open a panel of its own that hangs off a header control?
 * The three shapes the product actually uses: an ARIA menu, an ARIA-expanded
 * disclosure, or a conditionally rendered absolute panel.
 */
function opensAPopover(src: string): boolean {
  return (
    /aria-haspopup=\{?"menu"/.test(src) ||
    /role="menu"/.test(src) ||
    /aria-expanded=\{open\}/.test(src)
  );
}

describe("dropdowns in the authenticated header escape the header's stacking context", () => {
  const collected = new Map<string, string>();
  for (const header of HEADERS) {
    const src = read(header);
    for (const spec of importedComponents(src)) {
      const file = resolveComponent(spec, header);
      if (!file) continue;
      const body = read(file);
      if (opensAPopover(body)) collected.set(file, body);
    }
  }

  it("the header actually imports popover components (the derivation is not vacuous)", () => {
    // A derived guard that derives an EMPTY set passes forever and proves
    // nothing. Measured 2026-09-07: notification panel, account menu,
    // workspace chip and the locale switcher.
    expect(collected.size).toBeGreaterThanOrEqual(3);
  });

  for (const [file, body] of collected) {
    it(`${file} renders its panel through the ONE overlay portal`, () => {
      // Two legitimate escapes, both defined in `components/ui/anchored-overlay.tsx`:
      // `AnchoredOverlay` for a panel hanging off its trigger (z-60), and
      // `OverlayPortal` for a full-screen dialog (the command search, z-70).
      // Anything else paints inside the header's stacking context and loses.
      expect(
        body,
        `${file} opens a panel inside the header without a body portal — the map will paint over it`,
      ).toMatch(/AnchoredOverlay|OverlayPortal/);
    });
  }

  it("the only in-place locale panel is the one already inside a portal", () => {
    // `LocaleSwitcher` keeps an `inline` escape hatch for the account menu,
    // which renders it INSIDE its own AnchoredOverlay: portalling twice would
    // put the language rows outside the account menu's `panelRef`, and a tap
    // on one would read as an outside click. Exactly one caller may use it.
    const callers = [
      "components/app/account-menu.tsx",
      "components/app/conversation/chat/conversation-header.tsx",
      "components/layouts/site-nav.tsx",
      "components/layouts/site-footer.tsx",
      "components/layouts/mobile-nav-menu.tsx",
    ].filter((f) => existsSync(join(APP, f)));
    const inlineCallers = callers.filter((f) => /<LocaleSwitcher\s+inline\b/.test(read(f)));
    expect(inlineCallers).toEqual(["components/app/account-menu.tsx"]);
  });

  it("the overlay portal still owns the z scale it documents", () => {
    const overlay = read("components/ui/anchored-overlay.tsx");
    expect(overlay).toMatch(/z-\[60\]/);
    expect(overlay).toMatch(/data-overlay-root="anchored"/);
  });
});
