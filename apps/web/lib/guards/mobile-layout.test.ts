import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mobile UX P0 invariants (pinned after the mega-sprint v2 mobile-fix PR).
 *
 * These are source-level checks — they assert the literal Tailwind classes
 * we rely on for mobile correctness, so a future refactor cannot silently
 * remove the safety nets that prevent horizontal overflow / bottom-nav
 * occlusion / off-screen dropdowns on a 360px viewport.
 *
 * Rationale: jsdom does not run Tailwind, so a render-and-measure test
 * would not catch overflow regressions. We pin the strings instead.
 */

const REPO_ROOT = resolve(__dirname, "../..");
function read(p: string): string {
  return readFileSync(resolve(REPO_ROOT, p), "utf8");
}

describe("mobile layout invariants", () => {
  describe("dashboard header (apps/web/app/[locale]/dashboard/layout.tsx)", () => {
    const src = read("app/[locale]/dashboard/layout.tsx");

    it("header inner flex tightens gap and padding on mobile", () => {
      // Header inner flex must NOT use the desktop gap/padding on mobile —
      // 360px viewport breaks if we keep gap-6 + px-6.
      expect(src).toMatch(/gap-3[^"]*md:gap-6/);
      expect(src).toMatch(/px-3[^"]*sm:px-12/);
    });

    it("brand link can shrink + truncate so it never pushes the cluster off-screen", () => {
      expect(src).toMatch(/min-w-0[^"]*shrink[^"]*truncate/);
    });

    it("right-side cluster does not shrink (header items stay tappable, brand truncates instead)", () => {
      expect(src).toMatch(/ml-auto[^"]*flex[^"]*shrink-0/);
    });

    it("main element clears the fixed bottom nav with safe-area padding", () => {
      // The dashboard <main> must include env(safe-area-inset-bottom) in pb
      // so the BottomNav cannot occlude content on iOS. The <main> lives in the
      // chrome selector (which picks the per-route shell); its safe-area padding
      // is asserted there.
      const chrome = read("components/app/dashboard-chrome.tsx");
      expect(chrome).toMatch(/pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
    });
  });

  describe("bottom nav (apps/web/components/app/bottom-nav.tsx)", () => {
    const src = read("components/app/bottom-nav.tsx");

    it("is full-width fixed bottom + safe-area aware + mobile-only", () => {
      expect(src).toContain("fixed inset-x-0 bottom-0");
      expect(src).toContain("pb-[env(safe-area-inset-bottom)]");
      expect(src).toContain("md:hidden");
    });
  });

  describe("role switcher (apps/web/components/app/role-switcher.tsx)", () => {
    const src = read("components/app/role-switcher.tsx");

    it("admin badge is icon-only with tooltip + accessible label (production UX repair v2, F5)", () => {
      // The old "ADMIN REŽIMAS" text pill shouted a state the icon already
      // carries. The badge is now a fixed-size icon button at EVERY
      // viewport; the words live in title (tooltip) + aria-label.
      expect(src).toMatch(/h-9 w-9 shrink-0 items-center justify-center/);
      expect(src).toContain('aria-label={tSwitcher("adminPanelLink")}');
      expect(src).toContain('title={tSwitcher("adminMode")}');
    });

    it("role trigger label is mobile-hidden (icon + chevron only on phones)", () => {
      // F5: the workspace label is a short human word (never an uppercase
      // mono pill) and still hides on phones — icon + chevron only.
      // §12 design pass: the hand-rolled `text-[13px]` became the ROLE token
      // `text-basis` — the product's own scale, one place sizes are decided.
      expect(src).toMatch(/hidden text-basis[^"]*sm:inline/);
      expect(src).not.toMatch(/hidden font-mono[^"]*uppercase[^"]*sm:inline/);
    });

    it("admin badge + role trigger are shrink-0 (header truncates brand, not these)", () => {
      // Both badge + trigger must use `shrink-0` so the flex container
      // cannot compress them into illegibility on a tight header.
      const shrinkHits = src.match(/shrink-0/g) ?? [];
      expect(shrinkHits.length).toBeGreaterThanOrEqual(2);
    });

    it("dropdown menu is capped to the viewport on mobile", () => {
      // w-72 (288px) anchored right-0 overflows a 360px viewport without
      // a viewport-relative cap. The cap keeps a 24px right gutter.
      expect(src).toMatch(
        /absolute right-0[^"]*w-72[^"]*max-w-\[calc\(100vw-1\.5rem\)\]/,
      );
    });
  });

  describe("account menu (apps/web/components/app/account-menu.tsx)", () => {
    const src = read("components/app/account-menu.tsx");

    it("dropdown menu is capped to the viewport on mobile (via the portal root)", () => {
      // The menu renders through AnchoredOverlay (owner audit P0.3 — one
      // portal root) with fixed positioning clamped to an 8px gutter; the
      // panel itself keeps the viewport cap.
      expect(src).toMatch(/AnchoredOverlay/);
      expect(src).toMatch(/w-56[^"]*max-w-\[calc\(100vw-1\.5rem\)\]/);
    });
  });

  describe("language feedback reporting", () => {
    const src = read("components/app/language-feedback-widget.tsx");
    const menu = read("components/app/account-menu.tsx");

    it("modal container fits a 360px viewport (max-w-md + p-4 backdrop)", () => {
      // p-4 outer padding keeps 16px gutters on each side; max-w-md
      // caps the modal at 28rem on larger viewports.
      expect(src).toContain("max-w-md");
      expect(src).toContain('className="fixed inset-0 z-50 flex items-end');
    });

    /**
     * THIS BLOCK HAS PINNED THE DEFECT TWICE, IN OPPOSITE DIRECTIONS.
     *
     * First it asserted `h-9 w-9` + `opacity-60` + an `aria-label`-only label,
     * certifying a control no phone user could see. That was replaced by a
     * labelled 44px pill — which was findable, and covered three calendar cells
     * at 412px, because it still floated.
     *
     * Both rounds pinned the GEOMETRY OF A FLOATING BUTTON, so both could only
     * ever trade discoverability against obstruction. What is pinned now is the
     * pair of properties the product actually needs, which a floating control
     * could not hold at once:
     *   - the trigger is reachable from a predictable place on every route, and
     *   - it is not fixed-position, so it covers nothing.
     */
    it("the report trigger is a labelled menu item, not a floating overlay", () => {
      // Nothing floats: the resting trigger is gone from the widget entirely.
      expect(src).not.toMatch(/className="fixed right-3/);
      // The modal is still allowed to be fixed — it is a dialog, not a resting
      // control — so this asserts the absence of the FAB, not of `fixed`.
      expect(src).toMatch(/FEEDBACK_OPEN_EVENT/);

      // The trigger is a real, labelled menu item. Read the BUTTON's own
      // markup: a class or key named in a comment must neither satisfy nor
      // break an assertion about what actually renders.
      // NOT `<button[^>]*…`: the element's own onClick contains `=>`, so a
      // negated-`>` class stops inside the arrow function and never reaches the
      // testid. Bounded lazy any-character matching is what actually spans a
      // JSX element with handlers in it.
      const trigger =
        /<button[\s\S]{0,400}?data-testid="language-feedback-open"[\s\S]{0,600}?<\/button>/.exec(
          menu,
        )?.[0] ?? "";
      expect(trigger).not.toBe("");
      // Visible text, not a hover-only title/aria affordance.
      expect(trigger).toMatch(/\{tFeedback\("menuLabel"\)\}/);
      // No resting transparency — a touch device never leaves the resting state.
      expect(trigger).not.toMatch(/(^|\s)opacity-\d+/);
      // It opens the modal the layout mounts, rather than navigating away.
      expect(trigger).toMatch(/FEEDBACK_OPEN_EVENT/);
    });

    it("the account-menu trigger itself meets the 44px touch floor", () => {
      // The menu items are `py-2` text rows inside a dropdown; the control a
      // thumb has to hit FIRST is the avatar trigger, which is the one with a
      // fixed size. `size-11` = 44px.
      expect(menu).toMatch(/inline-flex size-11 items-center justify-center/);
    });
  });

  describe("calendar toolbar (apps/web/app/[locale]/dashboard/planning/page.tsx)", () => {
    const src = read("app/[locale]/dashboard/planning/page.tsx");

    it("every toolbar control meets the 44px touch minimum", () => {
      // An external tester measured these at 36px (`min-h-9`). ONE shared
      // CHIP_BASE covers the view switcher, prev/today/next, the source filters
      // and the date-picker submit — so the whole toolbar was under the floor
      // on the one surface built entirely out of small tap targets.
      const chipBase = /const CHIP_BASE =\s*\n?\s*"([^"]*)"/.exec(src)?.[1] ?? "";
      expect(chipBase).not.toBe("");
      expect(chipBase).toContain("min-h-[2.75rem]");
      expect(chipBase).not.toMatch(/min-h-9\b/);
      // The native date input sits in the same row and is tapped just as often.
      expect(src).toMatch(/type="date"[\s\S]{0,200}min-h-\[2\.75rem\]/);
    });
  });
});
