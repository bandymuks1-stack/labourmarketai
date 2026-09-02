import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: Connected Apps surface (FINAL COMPLETION Train A slice 2, 2026-09-02).
 *
 * The register (docs/launch/FINAL_COMPLETION_REGISTER.md §0 "11 Connected
 * Apps") required a NATIVE surface where a person sees which external
 * applications / assistants hold delegated access — scopes, when authorised —
 * and disconnects them explicitly. Pins the properties that make it honest:
 *
 *   1. data is GoTrue's own grant list (listGrants) — nothing mirrored, no
 *      client special-cased by name (vendor neutrality);
 *   2. the only write is revokeGrant on the caller's own session, behind a
 *      UUID check, with a two-step confirmation (never window.confirm);
 *   3. a read failure renders "unavailable", never an empty list that would
 *      read as "nothing is connected";
 *   4. it is mounted on the account page and reachable by name from the
 *      command registry;
 *   5. the five routed locales carry the copy.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
/** Source with block + line comments removed — assertions about CODE must not
 *  trip on a comment that merely mentions the forbidden thing. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

describe("Guard: Connected Apps — data source and vendor neutrality", () => {
  const section = read("components/app/connected-apps-section.tsx");
  const model = read("lib/auth/connected-apps.ts");

  it("reads GoTrue's grant list on the user's own session", () => {
    expect(section).toMatch(/supabase\.auth\.oauth\.listGrants\(\)/);
    expect(section).toMatch(/presentConnectedApps\(/);
  });

  it("knows no client by name — no ChatGPT/Claude/Gemini branching in the surface or model", () => {
    for (const src of [section, model]) {
      expect(code(src)).not.toMatch(/chatgpt|claude|gemini|openai|anthropic/i);
    }
  });

  it("renders 'unavailable' on a read error instead of an empty list", () => {
    expect(section).toMatch(/const apps = error \? null : presentConnectedApps\(data\)/);
    expect(section).toMatch(/apps === null[\s\S]{0,400}t\("unavailable"\)/);
    expect(section).toMatch(/apps\.length === 0[\s\S]{0,300}t\("empty"\)/);
  });

  it("never invents a 'last used' — only granted_at from GoTrue, with an honest fallback", () => {
    expect(code(section)).not.toMatch(/last[_ ]?used/i);
    expect(section).toMatch(/grantedUnknown/);
  });
});

describe("Guard: Connected Apps — the one write", () => {
  const action = read("lib/auth/connected-apps-actions.ts");
  const button = read("components/app/connected-app-revoke-button.tsx");

  it("revokes through GoTrue on the caller's session, after a UUID check and getUser", () => {
    expect(action).toMatch(/^"use server";/m);
    expect(action).toMatch(/isOauthClientId\(clientId\)/);
    expect(action).toMatch(/supabase\.auth\.getUser\(\)[\s\S]*supabase\.auth\.oauth\.revokeGrant\(\s*\{\s*clientId\s*\}\s*\)/);
  });

  it("logs bounded identifiers only on failure (no client id, no tokens)", () => {
    const logs = action.match(/console\.error\([\s\S]*?\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toMatch(/clientId|token|cookie/);
    }
  });

  it("disconnect is two-step and never window.confirm", () => {
    expect(code(button)).not.toMatch(/window\.confirm|\bconfirm\(/);
    expect(button).toMatch(/setConfirming\(true\)/);
    expect(button).toMatch(/data-testid="connected-app-confirm-yes"/);
    expect(button).toMatch(/name="client_id"/);
  });
});

describe("Guard: Connected Apps — reachability", () => {
  it("is mounted on the account page with the return feedback wired", () => {
    const page = read("app/[locale]/dashboard/account/page.tsx");
    expect(page).toMatch(/<ConnectedAppsSection/);
    expect(page).toMatch(/parseConnectedAppsFeedback\(apps\)/);
  });

  it("has its own command-registry entry pointing at the section", () => {
    const registry = read("lib/navigation/command-registry.ts");
    expect(registry).toMatch(/id:\s*"connected_apps"/);
    expect(registry).toMatch(/route:\s*"\/dashboard\/account#connected-apps"/);
  });

  it("the five routed locales carry the copy", () => {
    const KEYS = [
      "title", "intro", "empty", "unavailable", "unnamed", "grantedAt", "grantedUnknown",
      "scopesLabel", "disconnect", "confirmTitle", "confirmBody", "confirmYes", "cancel",
      "feedbackRevoked", "feedbackError", "note",
    ];
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const cat = JSON.parse(read(`messages/${locale}.json`));
      const ns = cat.auth?.dashboard?.account?.connectedApps ?? {};
      for (const k of KEYS) {
        expect(ns[k], `${locale} connectedApps.${k}`).toBeTruthy();
      }
    }
  });
});
