import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Feature reachability guard — UTILITY-ONLY account menu (IA cleanup).
 *
 * Owner decision: the name/account dropdown must carry only account UTILITIES —
 * Admin (gated) + Account + Logout. Product areas were REMOVED from the dropdown
 * so they are not hidden in the user-name menu. This guard pins the corrected
 * logic and confirms the product routes stay reachable from their PRODUCT
 * context (no dead routes):
 *   - skills        → the Profile surface (#candidate-skills),
 *   - projects      → project-operations-board (identity-actions died with the
 *                     second dashboard — W3 Package 4),
 *   - instructions  → attention-instructions / project-operations-board,
 *   - bookings      → no primary-IA home yet → documented RED (needs-IA) in
 *                     docs/owner-input/contact-message-demand-cleanup-p0-audit.md;
 *                     the route stays valid (no dead link), just not surfaced.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const menu = read("components/app/account-menu.tsx");

describe("the account dropdown is utility-only (no hidden product exits)", () => {
  it("does NOT expose product links in the user-name menu", () => {
    for (const t of [
      "account-menu-skills-link",
      "account-menu-projects-link",
      "account-menu-instructions-link",
      "account-menu-bookings-link",
    ]) {
      expect(menu, `dropdown must not carry ${t}`).not.toMatch(new RegExp(t));
    }
    expect(menu).not.toMatch(/href:\s*"\/dashboard\/projects"/);
    expect(menu).not.toMatch(/href:\s*"\/dashboard\/bookings"/);
    expect(menu).not.toMatch(/href:\s*"\/dashboard\/instructions"/);
  });

  it("no competing player-card link (Mano CV owns that identity)", () => {
    expect(menu).not.toMatch(/\/dashboard\/player-card/);
  });

  it("keeps only account utilities: Admin (gated) + Account + Logout", () => {
    expect(menu).toMatch(/account-menu-admin-link/);
    expect(menu).toMatch(/isAdmin/);
    expect(menu).toMatch(/\/dashboard\/admin/);
    expect(menu).toMatch(/href="\/dashboard\/account"/);
    expect(menu).toMatch(/action=\{`\/\$\{locale\}\/auth\/logout`\}/);
  });
});

describe("product routes stay reachable from their product context (no dead route)", () => {
  it("projects is reachable from a product surface (ops board)", () => {
    // W3 Package 4 deleted identity-actions with the second dashboard; the
    // ops board is the surviving product-context door to projects.
    const ops = read("components/app/project-operations-board.tsx");
    expect(
      ops.includes("/dashboard/projects"),
      "projects must stay reachable from a product surface",
    ).toBe(true);
  });

  it("instructions is reachable from a product surface (attention / ops board)", () => {
    const ai = read("components/app/attention-instructions.tsx");
    const ops = read("components/app/project-operations-board.tsx");
    expect(
      ai.includes("/dashboard/instructions") ||
        ops.includes("/dashboard/instructions"),
      "instructions must stay reachable from a product surface",
    ).toBe(true);
  });

  it("skills lives on the Profile surface (#candidate-skills anchor)", () => {
    const profile = read("app/[locale]/dashboard/profile/page.tsx");
    expect(profile).toMatch(/candidate-skills/);
  });
});
