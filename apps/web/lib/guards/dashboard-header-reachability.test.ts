import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE DASHBOARD HEADER'S CONTROLS STAY REACHABLE AT EVERY WIDTH.
 *
 * Measured in a real browser at 768px on /lt/dashboard/activity (mobile
 * sweep, 2026-08-09), the old module header rendered like this:
 *
 *   brand              0px wide   — squeezed out of existence
 *   workspace chip     0px wide
 *   dashboard tabs   492px        — flex-shrink:1 but `min-width:auto`
 *   control cluster  386px at x612..999, `shrink-0`
 *
 * The row measured 999px inside a 768px viewport, and because `html`/`body`
 * carry `overflow-x: hidden` the account-menu trigger — the ONLY logout and
 * report-a-problem entry point — sat off-screen from 768px to ~999px.
 *
 * The 2026-08 fix (`min-w-0 overflow-x-auto` on the tab strip) kept the
 * controls on screen by turning the tabs into a sideways-scrolling strip. The
 * owner's production screenshot of 2026-10-25 (1862px, the operator console)
 * showed what that strip costs: a visible scrollbar with arrow buttons, the
 * workspace chip laid over the first tab, the logo cut to "Labour…".
 *
 * THE INTENT IS UNCHANGED — every control reachable, nothing spilling over
 * the controls — and it is now met by layout instead of scrolling: the ONE
 * header (`conversation-header.tsx`, rendered by every chrome mode) shows the
 * core loop by priority, puts every other destination behind "More", and
 * below `md` moves the destinations into a bottom sheet. Guarding the class
 * strings is deliberate: this repo's guards are source-level and run without
 * a server (`docs/audits/W7_S2_PROFILE_ACCESSIBILITY.md` §6). The browser
 * walk at 390/768/1280/1920 is the PR's screenshot evidence.
 */

const REPO_ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");
const header = read("components/app/conversation/chat/conversation-header.tsx");
const chrome = read("components/app/dashboard-chrome.tsx");

describe("dashboard header reachability", () => {
  it("every chrome mode renders the ONE header (no second header to drift)", () => {
    expect(chrome.match(/<ConversationHeader\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(read("app/[locale]/dashboard/layout.tsx")).not.toMatch(/<DashboardTabs\b/);
  });

  it("no destination strip scrolls sideways — priority + More instead", () => {
    expect(header).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(header).toMatch(/data-testid="header-nav-more"/);
    // The nav is a flex-none block: it can never be squeezed into overlap,
    // and below md it is replaced by the bottom sheet trigger.
    expect(header).toMatch(/"hidden flex-none items-center gap-1", !mobile && "md:mx-auto md:flex"/);
    expect(header).toMatch(/data-testid="header-nav-sheet-trigger"/);
  });

  it("the workspace chip is the one element that gives width back", () => {
    // min-w-0 on its wrapper lets the chip truncate (full name in its
    // tooltip) instead of pushing the controls off-screen.
    expect(header).toMatch(/"order-4 flex min-w-0 flex-1 items-center gap-1\.5"/);
  });

  it("the control cluster is a shrink-0 anchor", () => {
    // Making the cluster shrink would squeeze 44px controls below the touch
    // floor instead of fixing the row.
    expect(header).toMatch(/order-2 ml-auto flex flex-none items-center gap-1/);
  });

  /**
   * Reachable is not the same as tappable. `account-menu.tsx` states the rule
   * in its own comment — "size-11 = the 44px touch-target floor every header
   * control keeps" — and its immediate neighbour, the notification bell,
   * measured 36x36 at 375px. A control cluster is only as good as its
   * smallest member, so the floor is asserted across the cluster, not per file.
   */
  it("every header control in the cluster clears the 44px touch floor", () => {
    const CLUSTER: ReadonlyArray<[string, string]> = [
      ["components/app/account-menu.tsx", "account menu"],
      ["components/app/notification-panel.tsx", "notification bell"],
    ];
    for (const [file, name] of CLUSTER) {
      const src = read(file);
      expect(
        src,
        `${name}: the dashboard header trigger must be size-11 (44px). ` +
          "h-9 w-9 is 36px and leaves one under-sized target in a row of 44px controls.",
      ).toMatch(/\bsize-11\b/);
      expect(src, `${name}: still uses the old 36px h-9 w-9 box`).not.toMatch(
        /\bh-9 w-9\b/,
      );
    }
    // The header's own destinations keep the same floor.
    expect(header).toMatch(/relative flex h-11 flex-none items-center/);
    expect(header).toMatch(/relative flex min-h-11 items-center gap-1\.5 whitespace-nowrap/);
  });
});
