/**
 * Admin-visibility guard.
 *
 * Non-admin users must NEVER see admin-only links / cards / buttons in
 * the normal user-facing UI. Direct-URL access being redirected by
 * `requireSuperadmin` is necessary but not sufficient — admins surfaces
 * must be INVISIBLE to non-admins.
 *
 * Strategy: scan every user-facing component / page outside the admin
 * tree for hard-coded `/dashboard/admin*` links. Any reference MUST be
 * either:
 *   1. inside the admin tree itself (`app/[locale]/dashboard/admin/**`), or
 *   2. inside a component whose surrounding JSX gates the link behind
 *      an `isAdmin` / `isSuperadmin` / `is_admin()` signal.
 *
 * The test allowlists components by exact path AND only when the file
 * contains the gating signal. Any new leak fails the test with a clear
 * message pointing at the file.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = process.cwd();

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo")
        continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

/** Files where rendering an admin link IS legitimate because the
 *  surrounding code gates on an admin signal (verified by the test
 *  itself — the file must still contain the gating signal). */
const ADMIN_GATED_FILES = new Set<string>([
  // RoleSwitcher renders the /dashboard/admin admin-mode badge ONLY
  // when `isAdmin` from the auth context is true.
  join(APP_ROOT, "components", "app", "role-switcher.tsx"),
]);

describe("admin visibility — non-admin UI never renders /dashboard/admin links", () => {
  const APP_DIR = join(APP_ROOT, "app");
  const COMPONENTS_DIR = join(APP_ROOT, "components");
  const ADMIN_TREE_PREFIX = join(APP_DIR, "[locale]", "dashboard", "admin") + "\\";
  // Normalize path separator for matching (Windows uses \, posix uses /).
  function inAdminTree(p: string): boolean {
    const norm = p.replace(/\\/g, "/");
    return norm.includes("/app/[locale]/dashboard/admin/");
  }

  const SCAN_GLOB = (p: string) =>
    /\.(tsx?|jsx?)$/i.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx");

  const candidates = [
    ...walk(APP_DIR, SCAN_GLOB),
    ...walk(COMPONENTS_DIR, SCAN_GLOB),
  ];

  it("ADMIN_TREE_PREFIX existence sanity check", () => {
    // Just make sure the path math finds at least one admin-tree file
    // — protects against accidentally pointing the prefix at nothing.
    expect(candidates.some(inAdminTree)).toBe(true);
    expect(ADMIN_TREE_PREFIX.length).toBeGreaterThan(0);
  });

  // Strip whole-line // and block comments so doctrine notes that
  // mention `/dashboard/admin/...` in a comment don't false-positive
  // as a rendered link. Cheap and safe — we only need to inspect
  // actual code.
  function stripComments(src: string): string {
    const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
    return noBlock
      .split("\n")
      .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
      .join("\n");
  }

  it("no UI file outside the admin tree renders /dashboard/admin links without an isAdmin gate", () => {
    const violations: string[] = [];
    for (const f of candidates) {
      if (inAdminTree(f)) continue;
      const src = stripComments(readFileSync(f, "utf-8"));
      if (!/\/dashboard\/admin\b/.test(src)) continue;
      if (ADMIN_GATED_FILES.has(f)) {
        // Verify the allowlisted file STILL contains the gating signal.
        // If a future edit strips the `isAdmin` check from
        // role-switcher.tsx, this test catches that too.
        if (!/\bisAdmin\b/.test(src)) {
          violations.push(
            `Allowlisted file ${f.replace(APP_ROOT, ".")} no longer contains an \`isAdmin\` gate — re-verify the admin-mode badge is still gated.`,
          );
        }
        continue;
      }
      violations.push(
        `${f.replace(APP_ROOT, ".")} renders a /dashboard/admin link but is not in the admin tree or allowlist. Gate the link with isAdmin, or add it to ADMIN_GATED_FILES with explicit rationale.`,
      );
    }
    if (violations.length > 0) {
      throw new Error(
        `\n  ${violations.join("\n  ")}\n\nIf any of these is intentional, add the file path to ADMIN_GATED_FILES in admin-visibility.test.ts with a comment explaining why.`,
      );
    }
  });

  it("no UI file outside the admin tree renders the literal label 'admin' in a Link/Button/nav that could be visible to non-admins", () => {
    // Conservative — we don't grep for the word "admin" everywhere
    // (would false-positive on comments, type names, etc). Instead we
    // check for the most common LT/EN label shapes inside JSX text.
    const FORBIDDEN_LABELS = [
      /<[A-Z][a-zA-Z]*[^>]{0,200}>\s*Admin\s*</,
      /<[A-Z][a-zA-Z]*[^>]{0,200}>\s*Adminas\s*</,
      /<[A-Z][a-zA-Z]*[^>]{0,200}>\s*Administratorius\s*</,
    ];
    const violations: string[] = [];
    for (const f of candidates) {
      if (inAdminTree(f)) continue;
      if (ADMIN_GATED_FILES.has(f)) continue;
      const src = readFileSync(f, "utf-8");
      for (const re of FORBIDDEN_LABELS) {
        if (re.test(src)) {
          violations.push(
            `${f.replace(APP_ROOT, ".")} renders an admin-label literal: ${re}`,
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

describe("admin visibility — every admin page enforces requireSuperadmin server-side", () => {
  const APP_DIR = join(APP_ROOT, "app");

  it("each /dashboard/admin/**/page.tsx calls requireSuperadmin(locale)", () => {
    const adminPages = walk(APP_DIR, (p) => {
      const norm = p.replace(/\\/g, "/");
      return (
        norm.includes("/app/[locale]/dashboard/admin/") &&
        norm.endsWith("/page.tsx")
      );
    });
    expect(adminPages.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const f of adminPages) {
      const src = readFileSync(f, "utf-8");
      if (!/requireSuperadmin\(\s*locale\s*\)/.test(src)) {
        violations.push(f.replace(APP_ROOT, "."));
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
