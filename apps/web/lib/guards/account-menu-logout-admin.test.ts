/**
 * Source-level guards for fix/account-menu-logout-admin-visibility.
 *
 * Owner P0 — production smoke proved that:
 *   (a) the dashboard header had no visible logout, only a deeply
 *       buried form-button inside /dashboard/account;
 *   (b) the admin badge disappeared after a workspace switch because
 *       `isAdmin` was derived solely from `profiles.active_role` and
 *       `switchActiveRole` overwrote that column.
 *
 * These tests lock the smallest-safe-fix wiring so a future PR cannot:
 *   - remove `<AccountMenu />` from the dashboard header;
 *   - point the logout route anywhere other than the localized login;
 *   - drop the dual-signal admin derivation (active_role OR
 *     profile_roles 'admin' row);
 *   - remove the self-healing profile_roles upsert from
 *     `switchActiveRole`;
 *   - turn the logout route into a profile / data mutation.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: AccountMenu component is wired into the dashboard header", () => {
  const layout = read("app/[locale]/dashboard/layout.tsx");
  const menu = read("components/app/account-menu.tsx");

  it("dashboard layout imports AccountMenu", () => {
    expect(layout).toMatch(
      /import\s*\{\s*AccountMenu\s*\}\s*from\s*["']@\/components\/app\/account-menu["']/,
    );
  });

  it("dashboard layout renders <AccountMenu /> in the header", () => {
    const codeOnly = layout
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).toMatch(/<AccountMenu\s*\/>/);
  });

  it("AccountMenu exposes a sign-out form posting to /{locale}/auth/logout", () => {
    // Form submit (not fetch) so it works without JS and triggers the
    // route handler's NextResponse.redirect cleanly.
    expect(menu).toMatch(/action=\{`\/\$\{locale\}\/auth\/logout`\}/);
    expect(menu).toMatch(/method=["']post["']/);
  });

  it("AccountMenu exposes an account link to /dashboard/account", () => {
    expect(menu).toMatch(/href=["']\/dashboard\/account["']/);
  });

  it("AccountMenu uses the existing i18n keys (not hardcoded strings)", () => {
    expect(menu).toMatch(/t\(\s*["']tabs\.account["']\s*\)/);
    expect(menu).toMatch(/t\(\s*["']account\.logout["']\s*\)/);
  });

  it("AccountMenu carries the data-testids the e2e suite will pin", () => {
    expect(menu).toMatch(/data-testid=["']account-menu-trigger["']/);
    expect(menu).toMatch(/data-testid=["']account-menu-account-link["']/);
    expect(menu).toMatch(/data-testid=["']account-menu-signout["']/);
  });
});

describe("Guard: logout route redirects to the localized login", () => {
  const route = read("app/[locale]/auth/logout/route.ts");

  it("redirect target is `/${locale}/auth/login`, not the locale home", () => {
    // Owner spec: "Sign out clears session and redirects to localized login page."
    expect(route).toMatch(/`\/\$\{locale\}\/auth\/login`/);
    // The old `/${locale}` home redirect MUST be gone — otherwise users
    // hit the marketing page after sign-out and lose the cue to sign
    // back in.
    expect(route).not.toMatch(/new URL\(`\/\$\{locale\}`,/);
  });

  it("logout calls only signOut — no delete / RPC / profile mutation", () => {
    expect(route).toMatch(/supabase\.auth\.signOut\(\)/);
    // Anything that would touch user data is forbidden in logout.
    for (const banned of [
      ".delete(",
      ".rpc(",
      ".upsert(",
      ".insert(",
      "from(\"profiles\")",
      "from('profiles')",
      "deleteUser",
    ]) {
      expect(route, `logout must not contain '${banned}'`).not.toContain(
        banned,
      );
    }
  });
});

describe("Guard: dashboard layout derives admin via the shared helper", () => {
  const layout = read("app/[locale]/dashboard/layout.tsx");

  it("imports deriveIsAdmin from lib/auth/admin-signal", () => {
    expect(layout).toMatch(
      /import\s*\{\s*deriveIsAdmin\s*\}\s*from\s*["']@\/lib\/auth\/admin-signal["']/,
    );
  });

  it("passes profile.active_role + rolesRows into deriveIsAdmin", () => {
    expect(layout).toMatch(
      /deriveIsAdmin\(\s*\{[\s\S]{0,200}activeRole:\s*profile\.active_role[\s\S]{0,200}profileRoles:\s*rolesRows\s*\?\?\s*\[\]/,
    );
  });
});

describe("Guard: superadmin gate reads both signals", () => {
  const superadmin = read("lib/auth/superadmin.ts");

  it("isSuperadmin returns activeRoleAdmin || profileRolesAdmin", () => {
    expect(superadmin).toMatch(/activeRoleAdmin\s*\|\|\s*profileRolesAdmin/);
  });

  it("requireSuperadmin redirects only when NEITHER signal is admin", () => {
    expect(superadmin).toMatch(
      /if\s*\(\s*!\s*activeRoleAdmin\s*&&\s*!\s*profileRolesAdmin\s*\)/,
    );
  });

  it("readAdminSignals queries profile_roles for an admin row", () => {
    expect(superadmin).toMatch(/from\(["']profile_roles["']\)/);
    expect(superadmin).toMatch(/\.eq\(["']role["'],\s*["']admin["']\)/);
  });
});

describe("Guard: switchActiveRole self-heals the admin signal", () => {
  const actions = read("lib/auth/actions.ts");

  it("reads current active_role before overwriting", () => {
    expect(actions).toMatch(
      /from\(["']profiles["']\)[\s\S]{0,200}select\(["']active_role["']\)/,
    );
  });

  it("upserts profile_roles{role:'admin'} when current active_role is 'admin'", () => {
    expect(actions).toMatch(
      /active_role\s*===\s*["']admin["'][\s\S]{0,400}profile_roles[\s\S]{0,200}upsert\([\s\S]{0,300}role:\s*["']admin["']/,
    );
  });

  it("upsert uses ON CONFLICT (profile_id, role) for idempotency", () => {
    expect(actions).toMatch(/onConflict:\s*["']profile_id,role["']/);
  });

  it("does not delete or mutate any other table beyond profiles + profile_roles", () => {
    // Defense in depth: switchActiveRole is a workspace-only change.
    expect(actions).not.toMatch(/from\(["'](?:workers|companies|agencies|customers|profile_skill_claims|journal[_-][a-z]+)["']\)[\s\S]{0,40}\.delete\(/);
  });
});

describe("Guard: admin-grant-superadmin script upserts profile_roles row", () => {
  const script = read("scripts/admin-grant-superadmin.ts");

  it("upserts a profile_roles 'admin' row alongside the active_role update", () => {
    expect(script).toMatch(
      /from\(["']profile_roles["']\)[\s\S]{0,200}\.upsert\(\s*\{[\s\S]{0,200}role:\s*["']admin["']/,
    );
    expect(script).toMatch(/onConflict:\s*["']profile_id,role["']/);
  });

  it("audit line reports the profile_roles upsert flag", () => {
    expect(script).toMatch(/profileRolesAdminUpserted/);
  });
});

describe("Guard: i18n keys for the account menu exist in every locale", () => {
  const LOCALES = [
    "lt",
    "en",
    "de",
    "da",
    "et",
    "lv",
    "no",
    "nl",
    "pl",
    "sv",
  ];

  for (const loc of LOCALES) {
    it(`${loc}.json has auth.dashboard.tabs.account + auth.dashboard.account.logout`, () => {
      const json = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      const auth = (json.auth ?? {}) as Record<string, unknown>;
      const dash = (auth.dashboard ?? {}) as Record<string, unknown>;
      const tabs = (dash.tabs ?? {}) as Record<string, string>;
      const account = (dash.account ?? {}) as Record<string, string>;
      expect(tabs.account, `${loc}.auth.dashboard.tabs.account`).toBeTruthy();
      expect(
        account.logout,
        `${loc}.auth.dashboard.account.logout`,
      ).toBeTruthy();
    });
  }

  it("LT and EN are translated (not [EN] placeholders)", () => {
    const lt = JSON.parse(read("messages/lt.json")) as Record<string, unknown>;
    const en = JSON.parse(read("messages/en.json")) as Record<string, unknown>;
    const ltDash = ((lt.auth as Record<string, unknown>).dashboard ?? {}) as Record<string, Record<string, string>>;
    const enDash = ((en.auth as Record<string, unknown>).dashboard ?? {}) as Record<string, Record<string, string>>;
    expect(ltDash.tabs.account).toBe("Nustatymai");
    expect(ltDash.account.logout).toBe("Atsijungti");
    expect(enDash.tabs.account).toBe("Settings");
    expect(enDash.account.logout).toBe("Sign out");
  });
});
