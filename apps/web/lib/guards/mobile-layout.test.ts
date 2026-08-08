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

  describe("language feedback widget (apps/web/components/app/language-feedback-widget.tsx)", () => {
    const src = read("components/app/language-feedback-widget.tsx");

    it("floating report button clears the bottom nav at all widths where the nav is visible", () => {
      // The BottomNav is `md:hidden`, so the button must clear it on every
      // width below `md`. It must also include the iOS safe-area inset so it
      // never sits on the home indicator.
      //
      // The offset is now read from `--feedback-fab-bottom` so a surface that
      // owns the bottom of the viewport (the conversation composer) can push
      // the button clear of its own controls instead of being overlapped by
      // it. The DEFAULTS below are unchanged, which is what this test pins:
      // every page that does not set the variable keeps exactly the previous
      // geometry.
      expect(src).toContain("calc(5rem+env(safe-area-inset-bottom))");
      expect(src).toMatch(/bottom-\[var\(--feedback-fab-bottom,/);
      // IA cleanup v2 (#11): reduced to a low-profile button; desktop offset
      // tightened to 1rem (previously the literal `md:bottom-4`).
      expect(src).toMatch(/md:bottom-\[var\(--feedback-fab-bottom,1rem\)\]/);
    });

    it("modal container fits a 360px viewport (max-w-md + p-4 backdrop)", () => {
      // p-4 outer padding keeps 16px gutters on each side; max-w-md
      // caps the modal at 28rem on larger viewports.
      expect(src).toContain("max-w-md");
      expect(src).toContain('className="fixed inset-0 z-50 flex items-end');
    });

    it("floating report button is findable and tappable on a phone", () => {
      // THIS ASSERTION USED TO PIN THE DEFECT. IA cleanup v2 (#11) shrank the
      // control to `h-9 w-9` at `opacity-60` with its label only in `title` /
      // `aria-label`, and this test certified exactly that. Both reveals are
      // HOVER-only, which a touch device does not have — so on mobile the
      // reporting button was an unlabelled, 60%-opaque 36px glyph. The owner
      // could not find it, and neither could an external tester. A guard that
      // pins cosmetic values cannot notice that.
      //
      // What actually matters, and what is pinned now:
      //   - at least the 44px minimum touch target;
      //   - a label rendered as TEXT, not only as a hover affordance;
      //   - no permanent transparency that hides it on a touch device.
      // Read the TRIGGER's own className, not the whole file — a prose
      // mention of a utility class in a comment must never satisfy or break
      // an assertion about what the button actually renders.
      const trigger = /className="(fixed right-3[^"]*)"/.exec(src)?.[1] ?? "";
      expect(trigger).not.toBe("");
      expect(trigger).toContain("min-h-[2.75rem]");
      // No resting transparency: `hover:opacity-*` would be fine, a permanent
      // `opacity-*` is not — a touch device never leaves the resting state.
      expect(trigger).not.toMatch(/(^|\s)opacity-\d+/);
      // The label is real text, not a hover-only title/aria affordance.
      expect(src).toMatch(
        /<span className="whitespace-nowrap">\{t\("openLabel"\)\}<\/span>/,
      );
      // The cleanup's real intent still holds: it stays a corner pill, never a
      // full-width bar that covers content.
      expect(trigger).toContain("fixed right-3");
    });
  });
});
