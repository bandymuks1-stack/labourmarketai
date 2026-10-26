/**
 * Source-level guards for fix/cc/admin-role-switcher-display.
 *
 * Owner production smoke proved that after a Path-A activation the
 * header role switcher rendered DARBUOTOJAS — admin fell through the
 * `ROLES.has(...)` filter in `dashboard/layout.tsx` and the switcher
 * silently used the user's first user-facing role. This PR resolves
 * that by surfacing an explicit `isAdmin` flag at the AuthProvider
 * level and rendering a distinct admin badge OUTSIDE the workspace
 * switcher dropdown.
 *
 * These tests lock the wiring so a future PR cannot accidentally
 * drop the admin badge (e.g. by removing `isAdmin` from the layout
 * server fetch).
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: AuthProvider exposes isAdmin", () => {
  const ctx = read("lib/auth/context.tsx");

  it("isAdmin is part of AuthState type", () => {
    expect(ctx).toMatch(/isAdmin:\s*boolean/);
  });

  it("isAdmin propagates from initial to context value", () => {
    // The provider's useMemo must include initial.isAdmin both in the
    // memoized object AND in the deps array.
    expect(ctx).toMatch(/isAdmin:\s*initial\.isAdmin/);
    const deps = ctx.match(/\[\s*initial\.user[\s\S]+?\]/);
    expect(deps?.[0] ?? "").toMatch(/initial\.isAdmin/);
  });
});

describe("Guard: dashboard layout derives isAdmin from a DUAL signal", () => {
  const layout = read("app/[locale]/dashboard/layout.tsx");

  // Updated for fix/account-menu-logout-admin-visibility: permission
  // and workspace are independent dimensions. The single-source check
  // `profile.active_role === 'admin'` was a bug — `switchActiveRole`
  // overwrites active_role and the admin badge vanished. The new
  // helper `deriveIsAdmin` checks both `active_role === 'admin'` AND
  // `profile_roles` for a row tagged `admin`, so admin persists
  // across workspace switches.
  it("imports the deriveIsAdmin helper from lib/auth/admin-signal", () => {
    expect(layout).toMatch(
      /import\s*\{\s*deriveIsAdmin\s*\}\s*from\s*["']@\/lib\/auth\/admin-signal["']/,
    );
  });

  it("calls deriveIsAdmin with both profile.active_role and rolesRows", () => {
    expect(layout).toMatch(
      /deriveIsAdmin\(\s*\{[\s\S]{0,200}activeRole:\s*profile\??\.active_role\s*(\?\?\s*null)?[\s\S]{0,200}profileRoles:\s*rolesRows\s*\?\?\s*\[\]/,
    );
  });

  it("passes isAdmin to AuthProvider initial state", () => {
    const codeOnly = layout
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).toMatch(
      /<AuthProvider[\s\S]*?initial=\{\{[\s\S]*?isAdmin[\s\S]*?\}\}/,
    );
  });
});

// RE-ANCHORED 2026-10-25 (owner order: ONE navigation system). The role
// switcher carried the admin-mode badge; it was retired as a SECOND workspace
// selector and its file is deleted. The intent survives on the surfaces that
// replaced it: admin is a permission dimension read from useAuth(), shown ONLY
// to admins, leading to /dashboard/admin, never labelled as a user role — and
// the elevated mode is announced on every admin page by the context banner.
describe("Guard: the admin entry is a separate, admin-only destination", () => {
  const header = read("components/app/conversation/chat/conversation-header.tsx");
  const nav = read("lib/config/navigation.ts");
  const banner = read("components/app/admin-context-banner.tsx");

  it("reads isAdmin (and the hide-admin preference) from the auth context", () => {
    expect(header).toMatch(/const isAdmin = Boolean\(auth\?\.isAdmin && !auth\?\.adminUiHidden\)/);
    expect(header).toMatch(/getHeaderOverflowNavItems\(\{ isAdmin \}\)/);
  });

  it("the admin destination joins the nav ONLY for admins and links to /dashboard/admin", () => {
    expect(nav).toMatch(/return isAdmin \? \[\.\.\.extras, ADMIN_NAV_ITEM\] : extras;/);
    expect(nav).toMatch(/href: "\/dashboard\/admin"/);
  });

  it("the admin label is its own key, NOT a user-facing role label", () => {
    expect(nav).toMatch(/tabLabelKey: "auth\.dashboard\.tabs\.admin"/);
  });

  it("every admin page announces the elevated mode with a way back", () => {
    expect(banner).toMatch(/data-testid="admin-context-banner"/);
    expect(banner).toMatch(/data-testid="admin-context-exit"/);
    expect(existsSync(join(APP_ROOT, "components/app/role-switcher.tsx"))).toBe(false);
  });
});

describe("Guard: i18n provides the new role-switcher admin keys (LT + EN)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json roleSwitcher.adminMode + adminPanelLink`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const auth = json.auth as Record<string, unknown>;
      const switcher = auth.roleSwitcher as Record<string, string>;
      expect(switcher.adminMode).toBeTruthy();
      expect(switcher.adminPanelLink).toBeTruthy();

      // The label must NOT use any of the user-facing labour-market
      // role names — the whole point of this PR is that admin reads
      // as a distinct concept.
      const lower = switcher.adminMode.toLowerCase();
      for (const userRole of [
        "darbuotoj",
        "įmonė",
        "imone",
        "agentūr",
        "agentur",
        "pirkėj",
        "pirkej",
        "worker",
        "company",
        "agency",
        "customer",
      ]) {
        expect(
          lower,
          `${locale}.auth.roleSwitcher.adminMode must not be a user-facing role label (matched ${userRole})`,
        ).not.toContain(userRole);
      }
    });
  }
});
