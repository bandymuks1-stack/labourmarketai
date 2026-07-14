import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — MANUAL IMPORT SANDBOX isolation (Manual Import Sandbox v1).
 *
 * Pins the sandbox's hard guarantees:
 *  (a) the whole sandbox chain (engine, parsers, action, page, form) has
 *      NO persistence path: no supabase import, no insert/upsert/update/
 *      delete call, no service-role client — a sandbox that could write
 *      would not be a sandbox;
 *  (b) the server action re-checks BOTH gates inside itself (superadmin +
 *      sandbox flag) — server actions are endpoints, the page gate alone
 *      is not enough;
 *  (c) no live acquisition: no fetch(, no http(s):// URL literal anywhere
 *      in the sandbox chain — owner-supplied local files only;
 *  (d) the results shell renders the unconditional "no data was imported"
 *      banner testid, and the engine result type pins `persisted: false`
 *      as a literal.
 *
 * Pure source assertions. Runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const SANDBOX_FILES = [
  "lib/intelligence/manual-import-sandbox.ts",
  "lib/intelligence/manual-import-parsers.ts",
  "app/[locale]/dashboard/admin/import-sandbox/actions.ts",
  "app/[locale]/dashboard/admin/import-sandbox/page.tsx",
  "components/intelligence/manual-import-sandbox-form.tsx",
] as const;

describe("(a) no persistence path anywhere in the sandbox chain", () => {
  for (const file of SANDBOX_FILES) {
    it(`${file}: no supabase import, no mutation call, no service-role`, () => {
      const src = code(read(file));
      expect(src).not.toMatch(/["']@\/lib\/supabase\//);
      expect(src).not.toMatch(/["']@supabase\//);
      expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
      expect(src).not.toMatch(/service[-_]?role/i);
    });
  }
});

describe("(b) the server action re-checks both gates inside itself", () => {
  it("actions.ts calls isSuperadmin() and the sandbox flag check", () => {
    const src = read("app/[locale]/dashboard/admin/import-sandbox/actions.ts");
    expect(src).toMatch(/isSuperadmin\s*\(\s*\)/);
    expect(src).toMatch(/INTELLIGENCE_SANDBOX_ENABLED/);
    // Refusal (not redirect) semantics — an endpoint answers, honestly.
    expect(src).toMatch(/not_authorized/);
    expect(src).toMatch(/sandbox_disabled/);
  });

  it("the page checks the same flag and renders a disabled state", () => {
    const src = read("app/[locale]/dashboard/admin/import-sandbox/page.tsx");
    expect(src).toMatch(/INTELLIGENCE_SANDBOX_ENABLED/);
    expect(src).toMatch(/requireSuperadmin/);
    expect(src).toMatch(/sandbox-disabled/);
  });
});

describe("(c) no live acquisition — local files only", () => {
  for (const file of SANDBOX_FILES) {
    it(`${file}: no fetch(, no URL literal, no XMLHttpRequest`, () => {
      const src = code(read(file));
      expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|node:https?\b/);
      expect(src).not.toMatch(/https?:\/\//);
    });
  }
});

describe('(d) the "no data was imported" banner is structural', () => {
  it("the form shell renders the unconditional banner testid", () => {
    const src = read("components/intelligence/manual-import-sandbox-form.tsx");
    expect(src).toContain('data-testid="sandbox-no-data-imported"');
  });

  it("the engine pins persisted as the LITERAL false", () => {
    const src = read("lib/intelligence/manual-import-sandbox.ts");
    expect(src).toMatch(/readonly persisted:\s*false;/);
    expect(src).toMatch(/persisted:\s*false as const/);
  });
});
