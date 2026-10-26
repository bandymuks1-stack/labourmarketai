import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decideScope,
  grantCovers,
  insufficientScopeResult,
  normalizeProductScopes,
  permissionCheckUnavailableResult,
  requestedProductScopes,
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

describe("the grant a caller holds comes from the person's recorded choice (B3), never the token", () => {
  it("no OAuth client = the person's own session, whatever is recorded", () => {
    expect(scopeGrantOf(undefined, null)).toEqual({ kind: "first_party" });
    expect(scopeGrantOf(null, { state: "granted", scopes: ["messages"] })).toEqual({ kind: "first_party" });
  });
  it("no recorded choice (a consent from before B3) is unscoped — the only flag-governed state", () => {
    expect(scopeGrantOf("c", { state: "none" })).toEqual({ kind: "oauth_unscoped", clientId: "c" });
  });
  it("a recorded choice is scoped to exactly those scopes", () => {
    const g = scopeGrantOf("c", { state: "granted", scopes: ["read:profile", "messages"] });
    expect(g.kind).toBe("oauth_scoped");
    expect(g.kind === "oauth_scoped" && [...g.scopes]).toEqual(["read:profile", "messages"]);
  });
  it("an EMPTY recorded choice is scoped to nothing, never unscoped", () => {
    const g = scopeGrantOf("c", { state: "granted", scopes: [] });
    expect(g).toEqual({ kind: "oauth_scoped", clientId: "c", scopes: new Set() });
  });
  it("revoked, unavailable or a missing read fail closed: scoped to nothing", () => {
    for (const pg of [{ state: "revoked" } as const, { state: "unavailable" } as const, null, undefined]) {
      expect(scopeGrantOf("c", pg)).toEqual({ kind: "oauth_scoped", clientId: "c", scopes: new Set() });
    }
  });
});

describe("the person's choice: normalising, requests, coverage", () => {
  it("untrusted form values become known scopes in consent order, deduplicated", () => {
    expect(normalizeProductScopes(["messages", "read:profile", "admin:all", 7, null, "messages"])).toEqual([
      "read:profile",
      "messages",
    ]);
  });
  it("a raw OAuth scope string yields only the product scopes it names", () => {
    expect(requestedProductScopes("openid email read:journal  billing")).toEqual(["read:journal"]);
    expect(requestedProductScopes(null)).toEqual([]);
  });
  it("write:X covers a request for read:X; nothing covers another domain", () => {
    expect(grantCovers(["write:journal"], ["read:journal"])).toBe(true);
    expect(grantCovers(["read:journal"], ["write:journal"])).toBe(false);
    expect(grantCovers(["read:journal"], [])).toBe(true);
  });
  it("an unreadable grant answers 'try again', says nothing ran", () => {
    expect(permissionCheckUnavailableResult("journal.list")).toMatchObject({ ok: false, code: "permission_check_unavailable" });
    expect(permissionCheckUnavailableResult("journal.list").message).toMatch(/NOTHING was read or written/);
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
  const readOnly = scopeGrantOf("c", { state: "granted", scopes: ["read:journal"] });
  const unscoped = scopeGrantOf("c", { state: "none" });

  it("off decides nothing for unscoped tokens", () => {
    expect(decideScope("off", unscoped, write)).toEqual({ outcome: "allow" });
  });
  it("a SCOPED grant is held to its scopes in every mode — the flag can never widen it (B2)", () => {
    for (const m of ["off", "log", "enforce"] as const) {
      expect(decideScope(m, readOnly, write)).toEqual({
        outcome: "refuse",
        requiredScope: "write:journal",
        grantKind: "oauth_scoped",
        clientId: "c",
      });
      expect(decideScope(m, readOnly, cap("journal.list", "read"))).toEqual({ outcome: "allow" });
    }
  });
  it("log marks would_refuse; enforce marks refuse — for unscoped tokens", () => {
    expect(decideScope("log", unscoped, write)).toMatchObject({ outcome: "would_refuse", grantKind: "oauth_unscoped" });
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
    const all = scopeGrantOf("c", { state: "granted", scopes: ["write:profile", "write:journal", "write:demand", "write:organization", "messages", "marketplace"] });
    expect(decideScope("enforce", all, cap("teleport.now", "execute"))).toMatchObject({ outcome: "refuse", requiredScope: null });
  });
  it("the refusal names the missing scope and what the client holds — and says nothing ran", () => {
    const body = insufficientScopeResult("journal.confirm", "write:journal", readOnly);
    expect(body).toMatchObject({ ok: false, code: "insufficient_scope", requiredScope: "write:journal", grantedScopes: ["read:journal"] });
    expect(body.message).toMatch(/NOTHING was read or written/);
    expect(body.message).toMatch(/Connected apps → Change permissions/);
  });
});
