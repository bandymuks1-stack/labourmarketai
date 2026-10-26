import { describe, expect, it, vi } from "vitest";

import { READ_PRODUCT_SCOPES } from "@/lib/mcp/scopes";

import {
  chooserNeeded,
  grantProductScopes,
  initialSelection,
  parseOwnGrantRows,
  readOwnProductGrants,
  revokeProductGrant,
  type OwnProductGrant,
} from "./oauth-product-grants";

const X = "11111111-1111-4111-8111-111111111111";

const row = (over: Partial<OwnProductGrant> = {}): OwnProductGrant => ({
  clientId: X,
  clientName: "X",
  hasGrant: true,
  scopes: ["read:journal"],
  revoked: false,
  hasActiveConsent: true,
  requestedScope: "openid email",
  updatedAt: null,
  ...over,
});

describe("parseOwnGrantRows", () => {
  it("maps the function's rows and drops malformed ones", () => {
    const rows = parseOwnGrantRows([
      {
        client_id: X,
        client_name: "Client X",
        scopes: ["messages", "read:profile", "admin:all"],
        has_grant: true,
        has_active_consent: true,
        revoked_at: null,
        requested_scope: "openid",
        updated_at: "2026-10-26T08:00:00Z",
      },
      { client_id: "not-a-uuid", has_grant: true },
      null,
      "x",
    ]);
    expect(rows).toEqual([
      {
        clientId: X,
        clientName: "Client X",
        hasGrant: true,
        scopes: ["read:profile", "messages"],
        revoked: false,
        hasActiveConsent: true,
        requestedScope: "openid",
        updatedAt: "2026-10-26T08:00:00Z",
      },
    ]);
  });

  it("a revoked row carries no scopes", () => {
    const [r] = parseOwnGrantRows([{ client_id: X, scopes: ["messages"], has_grant: false, revoked_at: "2026-10-26T08:00:00Z" }]);
    expect(r).toMatchObject({ hasGrant: false, revoked: true, scopes: [] });
  });

  it("non-array input is no rows", () => {
    expect(parseOwnGrantRows(null)).toEqual([]);
    expect(parseOwnGrantRows({ client_id: X })).toEqual([]);
  });
});

describe("chooserNeeded — the auto-skip rule", () => {
  it("no recorded choice (legacy or never chosen) → chooser", () => {
    expect(chooserNeeded(row({ hasGrant: false, scopes: [] }))).toBe(true);
  });
  it("a withdrawn choice → chooser", () => {
    expect(chooserNeeded(row({ hasGrant: false, revoked: true, scopes: [] }))).toBe(true);
  });
  it("the client asks for a product scope not granted → chooser", () => {
    expect(chooserNeeded(row({ scopes: ["read:journal"], requestedScope: "openid write:journal" }))).toBe(true);
  });
  it("a recorded choice that covers the request → straight through", () => {
    expect(chooserNeeded(row({ scopes: ["write:journal"], requestedScope: "openid read:journal" }))).toBe(false);
    expect(chooserNeeded(row({ scopes: [], requestedScope: "openid email" }))).toBe(false);
  });
});

describe("initialSelection — least privilege", () => {
  it("a new connection starts with NOTHING ticked", () => {
    expect(initialSelection({ activeGrant: null, preset: null, readPreset: READ_PRODUCT_SCOPES })).toEqual([]);
  });
  it("the read preset ticks the four 'see' scopes only when the person asked for it", () => {
    expect(initialSelection({ activeGrant: null, preset: "read", readPreset: READ_PRODUCT_SCOPES })).toEqual([
      "read:profile",
      "read:journal",
      "read:demand",
      "read:organization",
    ]);
  });
  it("the person's own active choice is pre-ticked; a client's request never is", () => {
    expect(initialSelection({ activeGrant: ["messages"], preset: null, readPreset: READ_PRODUCT_SCOPES })).toEqual(["messages"]);
  });
});

describe("RPC wrappers", () => {
  it("read passes both selectors, nulls when absent", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await readOwnProductGrants({ rpc }, { authorizationId: "authz-1" });
    expect(rpc).toHaveBeenCalledWith("read_oauth_product_grant_v1", { p_client_id: null, p_authorization_id: "authz-1" });
    expect(await readOwnProductGrants({ rpc: async () => ({ data: null, error: { code: "42501" } }) })).toEqual({ ok: false });
  });

  it("grant sends the exact arguments and surfaces the error code", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501" } }));
    const r = await grantProductScopes({ rpc }, { clientId: X, scopes: ["messages"], copyVersion: "b3-2026-10", authorizationId: "a" });
    expect(rpc).toHaveBeenCalledWith("grant_oauth_product_scopes_v1", {
      p_client_id: X,
      p_scopes: ["messages"],
      p_copy_version: "b3-2026-10",
      p_authorization_id: "a",
    });
    expect(r).toEqual({ ok: false, code: "42501" });
  });

  it("revoke never throws", async () => {
    const r = await revokeProductGrant(
      {
        rpc: async () => {
          throw new Error("down");
        },
      },
      X,
    );
    expect(r).toEqual({ ok: false, code: null });
  });
});
