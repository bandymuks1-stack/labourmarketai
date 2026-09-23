import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANONICAL_HOME, dashboardChromeMode as modeFor } from "@/lib/config/navigation";

/**
 * LOGO CONTRACT (owner decision 0017, 2026-09-22).
 *
 * Clicking the LabourMarket.ai mark from ANY authenticated route returns to
 * the canonical authenticated home for the current identity/context —
 * `/dashboard`, the conversation. Never the marketing landing, never a
 * role-specific dashboard, never a nested profile, never another dashboard
 * generation.
 *
 * The contract has exactly two authenticated shells that carry a mark, and
 * both are pinned here at the source:
 *   · the ONE top bar (`ConversationHeader`) — the conversation itself and
 *     every contextual workspace (`panel` mode);
 *   · the admin console's full chrome (`dashboard/layout.tsx`).
 * The public marketing header (`SiteNav`) keeps `/` — a visitor is not in
 * the product yet.
 *
 * The browser-level proof (worker / employer / agency: home → each actor's
 * deep routes → logo → home, with the composer intact) is the owner
 * acceptance walk, `scripts/owner-acceptance-walk.mjs` (a script, not a
 * spec — its header says why); `tests/e2e/auth-forged-session-refusal.spec.ts`
 * proves the shell and its logo are served only to a real session. There is
 * no `logo-home` spec — an earlier version of this note pointed at one that
 * was never written. This guard makes a regression fail before a browser is
 * ever started.
 *
 * WHAT THE MARK IS (owner §19, 2026-09-23): the canonical `LmLogo` — the
 * owner's original vector — and never a letter standing in for it. The top
 * bar carried a yellow "L" tile for months after the real mark shipped to
 * the public and auth shells, and the previous version of this guard pinned
 * that letter as "the mark". It is re-anchored here, not deleted: the same
 * Link, the same test id, the same product name — the letter is what went.
 */
const LETTER_TILE = />\s*LM?\s*<\/span>/;
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("the composer stays immediately available on the canonical home", () => {
  /**
   * OWNER CONSTRAINT (2026-09-22): "removing the separate `ask` door is
   * correct only if the composer/conversation remains immediately available
   * from the canonical root."
   *
   * Measured at 375x812 on the first walk of this change: with ŠIANDIEN in
   * the opening slot, the INLINE composer (owner audit §4.1, centred under
   * the greeting) sat at y=1356 in an 812px viewport — the `?ask=1` door
   * removed and nothing put in its place. With an opening context the sticky
   * bottom composer takes over instead, and the inline one is not rendered at
   * all (two composers would be two send buttons for one thread).
   * Re-measured after the fix: y=693 of 812, in viewport.
   */
  it("an opening context hands the composer to the sticky bar, not the inline slot", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/composer=\{\s*openingContext \? undefined : \(/);
    expect(chat).toMatch(/\{opening && !openingContext \? null : \(/);
  });
});

describe("the logo is the way home from every authenticated route", () => {
  it("the ONE top bar renders the mark as a Link to /dashboard (not a dead span)", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    const logo = header.match(
      /<Link\s+href="\/dashboard"\s+data-testid="shell-logo-home"[\s\S]*?<\/Link>/,
    );
    expect(logo, "logo Link with the shared test id").not.toBeNull();
    // The canonical mark and the product name both sit INSIDE that link; the
    // mark is decorative (empty title) because the Link's aria-label names it.
    expect(logo![0]).toMatch(/<LmLogo\s+title=""/);
    expect(logo![0]).toMatch(/\{title\}/);
    expect(header).toMatch(/import \{ LmLogo \} from "@\/components\/ui\/lm-logo"/);
    // The letter tile is gone from the WHOLE header, not only from the Link.
    expect(header).not.toMatch(LETTER_TILE);
  });

  it("negative control: the retired letter tile would fail the header check", () => {
    // The exact line this change removed. If the pattern above ever stops
    // matching it, the header assertion is vacuous.
    const retired =
      '<span className="flex size-6 flex-none items-center justify-center rounded-sm bg-brand-blue text-meta font-bold text-text-on-brand" aria-hidden>L</span>';
    expect(retired).toMatch(LETTER_TILE);
    expect("<span>LM</span>").toMatch(LETTER_TILE);
    // A real word that merely starts with L is not a letter tile.
    expect("<span>LabourMarket</span>").not.toMatch(LETTER_TILE);
  });

  it("the admin console's full chrome links its mark to /dashboard", () => {
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/<Link\s+href="\/dashboard"\s+data-testid="shell-logo-home"/);
    // The mark sits beside the wordmark there too (the auth shell's pattern).
    const logo = layout.match(
      /<Link\s+href="\/dashboard"\s+data-testid="shell-logo-home"[\s\S]*?<\/Link>/,
    );
    expect(logo, "full-chrome logo Link").not.toBeNull();
    expect(logo![0]).toMatch(/<LmLogo\s+title=""/);
    expect(logo![0]).toMatch(/LabourMarket<span/);
  });

  it("no authenticated shell links the mark to the public landing or a role home", () => {
    for (const rel of [
      "components/app/conversation/chat/conversation-header.tsx",
      "app/[locale]/dashboard/layout.tsx",
      "components/app/dashboard-chrome.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/data-testid="shell-logo-home"[^>]*href="\/"/);
      expect(src, rel).not.toMatch(/href="\/dashboard\/(company|start|profile|opportunities)"[^>]*data-testid="shell-logo-home"/);
    }
  });

  it("the public marketing header keeps the mark on / (a visitor is not in the product)", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/href="\/"/);
  });

  it("every authenticated route resolves to ONE home: the chrome's canonical home is /dashboard", () => {
    expect(CANONICAL_HOME).toBe("/dashboard");
    expect(modeFor("/dashboard")).toBe("conversation");
    // Contextual workspaces — the same one top bar, the same way home.
    for (const route of [
      "/dashboard/profile",
      "/dashboard/journal",
      "/dashboard/opportunities",
      "/dashboard/company",
      "/dashboard/company/needs",
      "/dashboard/candidates",
      "/dashboard/projects/abc/operations",
      "/dashboard/people/xyz",
    ]) {
      expect(modeFor(route), route).toBe("panel");
    }
    // The only full-chrome subtree is the internal operator console.
    expect(modeFor("/dashboard/admin")).toBe("full");
    expect(modeFor("/dashboard/admin/users/1")).toBe("full");
    // Negative control: there is no fourth mode and no worker tab bar.
    const chrome = read("components/app/dashboard-chrome.tsx");
    expect(chrome).not.toMatch(/=== "today"|WorkerBottomNav|<BottomNav/);
  });
});
