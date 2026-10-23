import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { oauthClientClaimsOf } from "@/lib/api/api-identity";

import {
  decideScope,
  insufficientScopeResult,
  requiredScopeFor,
  scopeEnforcementModeOf,
  scopeFamilyOf,
  scopeGrantOf,
  scopeSatisfies,
  type ProductScope,
} from "./scopes";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const cap = (id: string, kind: "read" | "draft" | "confirm" | "execute") => ({
  id,
  kind,
  annotations: kind === "read" || kind === "draft" ? READ : WRITE,
});

/** An unsigned JWT-shaped string with these claims (decoding only — verification is the auth server's). */
function tokenWith(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "ES256" })}.${b64(claims)}.c2ln`;
}

describe("the scope a tool needs is derived from its id and kind", () => {
  it("the longest matching prefix decides the domain", () => {
    expect(scopeFamilyOf("company.create-task")).toBe("organization");
    expect(scopeFamilyOf("company.contact-worker.prepare")).toBe("messages");
    expect(scopeFamilyOf("company.confirm-need.confirm")).toBe("demand");
    expect(scopeFamilyOf("worker.add-language")).toBe("profile");
    expect(scopeFamilyOf("worker.activation_queue.get")).toBe("demand");
    expect(scopeFamilyOf("nothing_known.get")).toBeNull();
  });

  it("reads need read:X; drafts, confirms and executes need write:X", () => {
    expect(requiredScopeFor(cap("journal.list", "read"))).toBe("read:journal");
    expect(requiredScopeFor(cap("journal.create_draft", "draft"))).toBe("write:journal");
    expect(requiredScopeFor(cap("journal.confirm", "confirm"))).toBe("write:journal");
    expect(requiredScopeFor(cap("context.switch", "execute"))).toBe("write:profile");
  });

  it("a read kind whose readOnlyHint disagrees is treated as a write (fail toward the stricter scope)", () => {
    expect(requiredScopeFor({ id: "journal.list", kind: "read", annotations: WRITE })).toBe("write:journal");
  });

  it("messages and marketplace are whole scopes", () => {
    expect(requiredScopeFor(cap("conversation.list", "read"))).toBe("messages");
    expect(requiredScopeFor(cap("message.send_confirm", "confirm"))).toBe("messages");
    expect(requiredScopeFor(cap("marketplace_listing.discover", "read"))).toBe("marketplace");
    expect(requiredScopeFor(cap("contract.delete_confirm", "confirm"))).toBe("marketplace");
  });

  it("an unknown domain has no scope (the guard forbids it; the door fails closed)", () => {
    expect(requiredScopeFor(cap("teleport.now", "execute"))).toBeNull();
  });
});

describe("which scopes satisfy which", () => {
  const set = (...s: ProductScope[]) => new Set<ProductScope>(s);
  it("write:X includes read:X, never the other way and never another domain", () => {
    expect(scopeSatisfies(set("write:journal"), "read:journal")).toBe(true);
    expect(scopeSatisfies(set("read:journal"), "write:journal")).toBe(false);
    expect(scopeSatisfies(set("write:journal"), "read:profile")).toBe(false);
    expect(scopeSatisfies(set("messages"), "messages")).toBe(true);
    expect(scopeSatisfies(set("marketplace"), "messages")).toBe(false);
  });
});

describe("the grant a caller holds", () => {
  it("no OAuth client = the person's own session", () => {
    expect(scopeGrantOf(undefined)).toEqual({ kind: "first_party" });
  });
  it("OIDC scopes alone are unscoped (Supabase Auth today); unknown names are ignored", () => {
    expect(scopeGrantOf({ clientId: "c", scopeClaim: ["openid", "email", "admin:all"] })).toEqual({
      kind: "oauth_unscoped",
      clientId: "c",
    });
    expect(scopeGrantOf({ clientId: "c", scopeClaim: null })).toEqual({ kind: "oauth_unscoped", clientId: "c" });
  });
  it("product scopes make a scoped grant", () => {
    const g = scopeGrantOf({ clientId: "c", scopeClaim: ["openid", "read:profile", "messages"] });
    expect(g.kind).toBe("oauth_scoped");
    expect(g.kind === "oauth_scoped" && [...g.scopes]).toEqual(["read:profile", "messages"]);
  });
});

describe("the verified token's OAuth claims", () => {
  it("a first-party Supabase session token has no client_id → no OAuth client", () => {
    expect(oauthClientClaimsOf(tokenWith({ sub: "u", role: "authenticated" }))).toBeUndefined();
  });
  it("an OAuth token: client_id, and the space-separated scope claim split", () => {
    expect(oauthClientClaimsOf(tokenWith({ sub: "u", client_id: "abc", scope: "openid  read:journal" }))).toEqual({
      clientId: "abc",
      scopeClaim: ["openid", "read:journal"],
    });
    expect(oauthClientClaimsOf(tokenWith({ client_id: "abc" }))).toEqual({ clientId: "abc", scopeClaim: null });
    expect(oauthClientClaimsOf(tokenWith({ client_id: "abc", scope: ["messages"] }))).toEqual({
      clientId: "abc",
      scopeClaim: ["messages"],
    });
  });
  it("garbage decodes to 'not an OAuth client', never a throw", () => {
    expect(oauthClientClaimsOf("x.!!!.y")).toBeUndefined();
    expect(oauthClientClaimsOf("only-one-part")).toBeUndefined();
    expect(oauthClientClaimsOf(tokenWith({ client_id: 42 }))).toBeUndefined();
    expect(oauthClientClaimsOf(tokenWith({ client_id: "" }))).toBeUndefined();
  });
});

describe("the flag", () => {
  it("parses off | log | enforce; anything else is off", () => {
    expect(scopeEnforcementModeOf("log")).toBe("log");
    expect(scopeEnforcementModeOf("enforce")).toBe("enforce");
    expect(scopeEnforcementModeOf("off")).toBe("off");
    expect(scopeEnforcementModeOf(undefined)).toBe("off");
    expect(scopeEnforcementModeOf("ENFORCE")).toBe("off");
  });

  const write = cap("journal.confirm", "confirm");
  const readOnly = scopeGrantOf({ clientId: "c", scopeClaim: ["read:journal"] });
  const unscoped = scopeGrantOf({ clientId: "c", scopeClaim: [] });

  it("off decides nothing, for anyone", () => {
    expect(decideScope("off", readOnly, write)).toEqual({ outcome: "allow" });
    expect(decideScope("off", unscoped, write)).toEqual({ outcome: "allow" });
  });
  it("log marks would_refuse; enforce marks refuse — same requirement, same grant", () => {
    expect(decideScope("log", readOnly, write)).toEqual({
      outcome: "would_refuse",
      requiredScope: "write:journal",
      grantKind: "oauth_scoped",
      clientId: "c",
    });
    expect(decideScope("enforce", readOnly, write)).toMatchObject({ outcome: "refuse", requiredScope: "write:journal" });
    expect(decideScope("enforce", unscoped, cap("journal.list", "read"))).toMatchObject({
      outcome: "refuse",
      grantKind: "oauth_unscoped",
    });
  });
  it("the person's own session is allowed in every mode", () => {
    for (const m of ["off", "log", "enforce"] as const) {
      expect(decideScope(m, { kind: "first_party" }, write)).toEqual({ outcome: "allow" });
    }
  });
  it("an unmapped tool is never satisfiable under enforce (fail closed)", () => {
    const all = scopeGrantOf({ clientId: "c", scopeClaim: ["write:profile", "write:journal", "write:demand", "write:organization", "messages", "marketplace"] });
    expect(decideScope("enforce", all, cap("teleport.now", "execute"))).toMatchObject({ outcome: "refuse", requiredScope: null });
  });
  it("the refusal names the missing scope and what the client holds — and says nothing ran", () => {
    const body = insufficientScopeResult("journal.confirm", "write:journal", readOnly);
    expect(body).toMatchObject({ ok: false, code: "insufficient_scope", requiredScope: "write:journal", grantedScopes: ["read:journal"] });
    expect(body.message).toMatch(/NOTHING was read or written/);
  });
});
