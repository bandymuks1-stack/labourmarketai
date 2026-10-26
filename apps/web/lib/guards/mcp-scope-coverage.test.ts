import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { exposedCapabilities } from "@/lib/capabilities/registry";
import { activeLocales } from "@/lib/i18n/config";
import {
  BILLING_SHAPED_ID,
  CONSENT_SCOPE_MESSAGE_KEYS,
  OIDC_SCOPES,
  PRODUCT_SCOPES,
  SCOPE_DOMAIN_PREFIXES,
  consentScopeMessageKey,
  requiredScopeFor,
} from "@/lib/mcp/scopes";

/**
 * EVERY MCP TOOL HAS A PERMISSION SCOPE (lib/mcp/scopes.ts).
 *
 * The scope is derived from the capability's id (domain) and kind (read or
 * write), so a new tool in a known domain is scoped automatically. A new
 * DOMAIN fails here until it is placed in `SCOPE_DOMAIN_PREFIXES` — the
 * reviewed decision of which permission an external client needs to use it.
 * Under MCP_SCOPE_ENFORCEMENT=enforce an unscoped tool would be refused to
 * every OAuth client (fail closed); this guard makes that a CI failure instead
 * of a production surprise.
 */

const tools = exposedCapabilities();
const APP_ROOT = join(__dirname, "..", "..");

describe("the scope model covers the whole MCP toolset", () => {
  it("the registry is the real one (229+ exposed tools)", () => {
    expect(tools.length).toBeGreaterThanOrEqual(229);
  });

  it("every exposed tool has exactly one scope", () => {
    const unscoped = tools.filter((c) => requiredScopeFor(c) === null).map((c) => c.id);
    expect(unscoped, "add the domain to SCOPE_DOMAIN_PREFIXES in lib/mcp/scopes.ts").toEqual([]);
  });

  it("a read never needs a write scope, and a write never passes on a read scope", () => {
    for (const c of tools) {
      const scope = requiredScopeFor(c)!;
      if (c.kind === "read" && c.annotations.readOnlyHint) expect(scope.startsWith("write:"), c.id).toBe(false);
      if (c.kind !== "read") expect(scope.startsWith("read:"), c.id).toBe(false);
    }
  });

  it("every product scope opens at least one tool, and every domain prefix is used (no dead entries)", () => {
    const used = new Set(tools.map((c) => requiredScopeFor(c)));
    expect(PRODUCT_SCOPES.filter((s) => !used.has(s))).toEqual([]);
    const deadPrefixes = Object.keys(SCOPE_DOMAIN_PREFIXES).filter(
      (p) => !tools.some((c) => c.id === p || c.id.startsWith(`${p}.`)),
    );
    expect(deadPrefixes).toEqual([]);
  });

  it("billing: none — no tool can move money, and no scope could grant it", () => {
    expect(tools.filter((c) => BILLING_SHAPED_ID.test(c.id)).map((c) => c.id)).toEqual([]);
    expect(PRODUCT_SCOPES.filter((s) => /billing|payment/.test(s))).toEqual([]);
  });
});

describe("the consent screen explains every scope in plain words, in every active locale", () => {
  it("every product and OIDC scope has a message key; billing is named as unavailable", () => {
    for (const s of [...PRODUCT_SCOPES, ...OIDC_SCOPES]) expect(consentScopeMessageKey(s), s).not.toBeNull();
    expect(consentScopeMessageKey("billing")).toBe("billingNone");
    expect(consentScopeMessageKey("billing:write")).toBe("billingNone");
    expect(consentScopeMessageKey("something:else")).toBeNull();
  });

  it("all keys exist and are non-empty in lt, en, ru, de, pl, nl", () => {
    expect([...activeLocales].sort()).toEqual(["de", "en", "lt", "nl", "pl", "ru"]);
    for (const locale of activeLocales) {
      const messages = JSON.parse(readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"));
      const block = messages.oauthConsent as Record<string, unknown> & { scope: Record<string, string> };
      for (const key of CONSENT_SCOPE_MESSAGE_KEYS) {
        expect(typeof block.scope?.[key] === "string" && block.scope[key].trim().length > 0, `${locale}: scope.${key}`).toBe(true);
      }
      // B3/B4b: the chooser and its honest reach note. The four #2707
      // sentences about unscoped grants are gone: every new connection now
      // records a choice, so "these permissions do not limit the app" would
      // be false.
      for (const key of [
        "scopeUnknown",
        "chooseLegend",
        "chooseHint",
        "choosePresetRead",
        "chooseRequested",
        "errorNoneSelected",
        "returningUnchosen",
        "returningMore",
        "returningSave",
        "returningDisconnect",
        "outcomeDisconnected",
        "outcomeSavedReconnect",
        "errorSaveFailed",
        "reachNote",
        "identityScopesLabel",
      ]) {
        expect(typeof block[key] === "string" && (block[key] as string).trim().length > 0, `${locale}: ${key}`).toBe(true);
      }
      for (const gone of ["noProductScopes", "noProductScopesEnforced", "scopesNotEnforced", "importantChangesConfirm"]) {
        expect(block[gone], `${locale}: ${gone} must stay removed`).toBeUndefined();
      }
    }
  });
});

describe("one dispatch point", () => {
  it("only the MCP door decides scopes — no second enforcement path", () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      // Directory entries carry their own type: no stat-then-read race (CodeQL js/file-system-race).
      for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        const entry = dirent.name;
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (dirent.isDirectory()) walk(full);
        else if (dirent.isFile() && /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) && /decideScope\(/.test(readFileSync(full, "utf8"))) {
          callers.push(relative(APP_ROOT, full).split("\\").join("/"));
        }
      }
    };
    walk(join(APP_ROOT, "app"));
    walk(join(APP_ROOT, "lib"));
    expect(callers.sort()).toEqual(["app/api/mcp/route.ts", "lib/mcp/scopes.ts"]);
  });
});
