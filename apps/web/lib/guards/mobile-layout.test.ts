import { existsSync, readFileSync } from "node:fs";
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
  // RE-ANCHORED 2026-10-25 (owner order: one navigation system). The module
  // header these invariants used to pin lived in `dashboard/layout.tsx`; every
  // chrome mode now renders THE ONE header, so the same invariants are pinned
  // on it. The brand rule changed on purpose: the owner's production
  // screenshot showed the old rule's outcome — a logo truncated to "Labour…" —
  // so the brand no longer shrinks at all; the wordmark appears only where it
  // fits whole, and the workspace chip is the element that gives width back.
  describe("dashboard header (components/app/conversation/chat/conversation-header.tsx)", () => {
    const src = read("components/app/conversation/chat/conversation-header.tsx");

    it("header flex tightens gap on a phone and wraps into two rows there", () => {
      expect(src).toMatch(/flex flex-none flex-wrap items-center gap-x-2 gap-y-2[^"]*px-4/);
      expect(src).toMatch(/md:flex-nowrap md:gap-x-3/);
    });

    it("the brand never shrinks or truncates; its wordmark shows only where it fits whole", () => {
      const link = src.match(
        /<Link\s+href="\/dashboard"\s+data-testid="shell-logo-home"[\s\S]*?<\/Link>/,
      );
      expect(link, "the brand Link").not.toBeNull();
      expect(link![0]).toMatch(/className="flex flex-none items-center/);
      expect(link![0]).not.toMatch(/truncate/);
      expect(link![0]).toMatch(/whitespace-nowrap[^`]*"hidden min-\[1800px\]:inline"/);
      expect(link![0]).toMatch(/<LmLogo[^>]*className="[^"]*shrink-0[^"]*"/);
    });

    it("right-side cluster does not shrink (header items stay tappable, the chip truncates instead)", () => {
      expect(src).toMatch(/ml-auto flex flex-none items-center/);
    });

    it("main element keeps safe-area padding at the bottom", () => {
      // No chrome mode carries a fixed bottom bar any more (the phone's
      // destinations live in the header's bottom sheet), but the <main>
      // still clears the iOS home indicator.
      const chrome = read("components/app/dashboard-chrome.tsx");
      expect(chrome).toMatch(/pb-\[calc\(2\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
      expect(chrome).not.toMatch(/<BottomNav\b/);
    });
  });

  // RE-ANCHORED 2026-10-25 (owner order: one navigation system). The phone
  // bottom bar and the role switcher were the operator console's private
  // chrome; both are deleted. Their mobile invariants live on in the ONE
  // header: the phone's destinations open in a safe-area-aware bottom sheet,
  // every control keeps the 44px floor, and the workspace chip is the element
  // that gives width back (never a control squeezed into illegibility).
  describe("phone navigation (the one header's bottom sheet)", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    const sheet = read("components/ui/MobileSheet.tsx");

    it("the destinations open in a mobile-only, safe-area-aware bottom sheet", () => {
      expect(header).toMatch(/<MobileSheet\b/);
      expect(header).toMatch(/data-testid="header-nav-sheet-trigger"/);
      expect(sheet).toContain("pb-[env(safe-area-inset-bottom)]");
      expect(sheet).toContain("md:hidden");
    });

    it("the More menu is capped to the viewport", () => {
      expect(header).toMatch(/w-60 max-w-\[calc\(100vw-2rem\)\]/);
    });

    it("the retired phone bar and role switcher do not come back", () => {
      expect(existsSync(resolve(REPO_ROOT, "components/app/bottom-nav.tsx"))).toBe(false);
      expect(existsSync(resolve(REPO_ROOT, "components/app/role-switcher.tsx"))).toBe(false);
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
