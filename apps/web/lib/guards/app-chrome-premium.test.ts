import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Core-UX guard (P0 — fix/cc/core-ux-company-identity-unified-roles-v1):
 *
 *  1. The authenticated app-shell logo links to the DASHBOARD, never the
 *     public home ("/"). Clicking the logo inside the app must keep the user
 *     in their workspace, not bounce them to marketing / out of the session.
 *
 *  2. The premium app chrome (header nav, role switcher, account menu,
 *     notification panel, account roles list, onboarding role cards) carries
 *     NO pictographic emoji as icons — professional outline icons only
 *     (lucide-react). Emoji role/action icons read as childish on a premium
 *     B2B surface. Arrows / checkmarks (→ ✓) are allowed UI affordances.
 */
const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

// Pictographic emoji ranges (emoji + misc symbols incl. ⚙ ✅ 🔒), but NOT
// arrows (U+2190–U+21FF) or the check mark U+2713 — those are plain UI glyphs.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{2728}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

const CHROME_FILES = [
  "app/[locale]/dashboard/account/page.tsx",
  "components/app/role-switcher.tsx",
  "components/app/account-menu.tsx",
  "components/app/notification-panel.tsx",
  "components/app/onboarding-wizard.tsx",
  "components/app/role-icon.tsx",
];

describe("app chrome — logo navigation + premium icons", () => {
  it("dashboard app-shell logo links to /dashboard, not public root", () => {
    const layout = read("app/[locale]/dashboard/layout.tsx");
    // The <Link href="/dashboard"> for the logo must exist...
    expect(layout).toMatch(/href="\/dashboard"/);
    // ...and there must be no logo Link straight to the public root.
    expect(layout).not.toMatch(/<Link\s+href="\/"/);
  });

  it("a shared lucide RoleIcon component exists", () => {
    const roleIcon = read("components/app/role-icon.tsx");
    expect(roleIcon).toMatch(/lucide-react/);
    expect(roleIcon).toMatch(/export function RoleIcon/);
  });

  for (const rel of CHROME_FILES) {
    it(`${rel} has no pictographic emoji icons`, () => {
      const src = read(rel);
      const match = src.match(EMOJI);
      expect(match, match ? `found emoji ${JSON.stringify(match[0])}` : "")
        .toBeNull();
    });
  }
});
