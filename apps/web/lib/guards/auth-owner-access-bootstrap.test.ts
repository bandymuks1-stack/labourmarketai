import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Auth owner-access bootstrap guard (P0). First-login must not require manual DB
 * insertion: completeOnboarding ensures the caller's OWN profile shell exists
 * before the complete_onboarding RPC, so a Google OAuth user whose handle_new_user
 * trigger did not fire can still finish onboarding (no /onboarding loop). No
 * email allowlist gates login.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const actions = read("lib/auth/actions.ts");
const middleware = read("middleware.ts");
const callback = read("app/[locale]/auth/callback/route.ts");
const schema = readFileSync(join(ROOT, "..", "..", "supabase", "migrations", "0001_initial_schema.sql"), "utf8");

describe("first-login profile bootstrap", () => {
  it("completeOnboarding ensures the caller's own profile shell (own id, idempotent)", () => {
    expect(actions).toMatch(/\.from\("profiles"\)[\s\S]*?\.upsert\(/);
    expect(actions).toMatch(/id:\s*user\.id/);
    expect(actions).toMatch(/onConflict:\s*"id"/);
    expect(actions).toMatch(/ignoreDuplicates:\s*true/);
  });
  it("the profile shell is ensured BEFORE the complete_onboarding RPC", () => {
    const upsertAt = actions.indexOf('.from("profiles")');
    const rpcAt = actions.indexOf('rpc("complete_onboarding"');
    expect(upsertAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(-1);
    expect(upsertAt).toBeLessThan(rpcAt);
  });
  it("profiles_insert RLS allows a user to insert their own row (code-only fix is valid)", () => {
    expect(schema).toMatch(/create policy profiles_insert on public\.profiles for insert\s*\n\s*with check \(id = auth\.uid\(\)/);
  });
});

describe("no email allowlist / domain gate blocks login", () => {
  it("middleware gates only by auth + onboarding, not by email/domain allowlist", () => {
    expect(middleware).not.toMatch(/allowlist|allowed_?emails?|whitelist|@gmail|email\s*===|endsWith\(["']@/i);
  });
  it("callback does not reject users by email/domain", () => {
    expect(callback).not.toMatch(/allowlist|allowed_?emails?|whitelist|forbidden|@gmail/i);
  });
});