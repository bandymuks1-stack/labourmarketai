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
      // so the BottomNav cannot occlude content on iOS.
      expect(src).toMatch(/pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
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

    it("admin badge label is mobile-hidden (icon-only on phones, full text on >=sm)", () => {
      // "Admin režimas" / "Admin mode" copy doubles the badge width on
      // mobile and pushes the role switcher off-screen. Hide the label
      // text, keep the icon + aria-label.
      expect(src).toMatch(/hidden font-mono[^"]*sm:inline/);
      // aria-label remains so screen readers still announce the link.
      expect(src).toContain('aria-label={tSwitcher("adminPanelLink")}');
    });

    it("role trigger label is mobile-hidden (icon + chevron only on phones)", () => {
      // Verified by counting occurrences of the mobile-hide class on a span
      // inside the role button (admin badge above is the first hit; the
      // role trigger label is the second).
      const matches = src.match(/hidden font-mono[^"]*sm:inline/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("admin badge + role trigger are shrink-0 (header truncates brand, not these)", () => {
      // Both badge + trigger must use `shrink-0` so the flex container
      // cannot compress them into illegibility on a tight header.
      const shrinkHits = src.match(/inline-flex shrink-0/g) ?? [];
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

    it("dropdown menu is capped to the viewport on mobile", () => {
      expect(src).toMatch(
        /absolute right-0[^"]*w-56[^"]*max-w-\[calc\(100vw-1\.5rem\)\]/,
      );
    });
  });

  describe("language feedback widget (apps/web/components/app/language-feedback-widget.tsx)", () => {
    const src = read("components/app/language-feedback-widget.tsx");

    it("floating report button clears the bottom nav at all widths where the nav is visible", () => {
      // The BottomNav is `md:hidden`, so the button must clear it on every
      // width below `md`. It must also include the iOS safe-area inset so it
      // never sits on the home indicator.
      expect(src).toContain(
        "bottom-[calc(5rem+env(safe-area-inset-bottom))]",
      );
      // IA cleanup v2 (#11): reduced to a low-profile button; desktop offset
      // tightened to md:bottom-4.
      expect(src).toMatch(/md:bottom-4/);
    });

    it("modal container fits a 360px viewport (max-w-md + p-4 backdrop)", () => {
      // p-4 outer padding keeps 16px gutters on each side; max-w-md
      // caps the modal at 28rem on larger viewports.
      expect(src).toContain("max-w-md");
      expect(src).toContain('className="fixed inset-0 z-50 flex items-end');
    });

    it("floating report button is a small fixed-size icon (can't be pushed off-screen, #11)", () => {
      // IA cleanup v2: the always-on wide pill (which followed every page and
      // covered content) is now a compact, fixed 9×9 icon-only button — a fixed
      // size inherently can't overflow regardless of locale string length, and
      // it sits at reduced opacity until hovered so it never competes with
      // page content.
      expect(src).toMatch(/h-9 w-9/);
      expect(src).toMatch(/opacity-60/);
    });
  });
});
