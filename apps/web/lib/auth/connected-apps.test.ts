import { describe, expect, it } from "vitest";

import {
  attachProductPermissions,
  isOauthClientId,
  parseConnectedAppsFeedback,
  presentConnectedApps,
} from "./connected-apps";
import type { OwnProductGrant } from "./oauth-product-grants";

const CHATGPT = "3624f6dc-8607-4271-b387-07f3829e09c0";
const OTHER = "11111111-2222-4333-8444-555555555555";

describe("presentConnectedApps", () => {
  it("shapes GoTrue grants for rendering, newest first", () => {
    const rows = presentConnectedApps([
      {
        client: { id: OTHER, name: "lm-oauth-proof-temp", uri: "not a url", logo_uri: "" },
        scopes: ["openid"],
        granted_at: "2026-08-30T10:00:00Z",
      },
      {
        client: { id: CHATGPT, name: "ChatGPT", uri: "https://chatgpt.com", logo_uri: "https://x/y.png" },
        scopes: ["openid", "email", "profile", "offline_access"],
        granted_at: "2026-09-02T11:49:06Z",
      },
    ]);
    expect(rows.map((r) => r.clientId)).toEqual([CHATGPT, OTHER]);
    expect(rows[0]).toEqual({
      clientId: CHATGPT,
      name: "ChatGPT",
      website: "https://chatgpt.com/",
      scopes: ["openid", "email", "profile", "offline_access"],
      grantedAt: "2026-09-02T11:49:06Z",
    });
    // A non-URL website is dropped rather than rendered as a broken link.
    expect(rows[1].website).toBeNull();
  });

  it("never invents a name, a date or scopes when GoTrue sent none", () => {
    const [row] = presentConnectedApps([
      { client: { id: OTHER, name: "", uri: null }, scopes: null, granted_at: "garbage" },
    ]);
    expect(row.name).toBeNull();
    expect(row.grantedAt).toBeNull();
    expect(row.scopes).toEqual([]);
  });

  it("drops rows without a UUID client id and tolerates null input", () => {
    expect(presentConnectedApps(null)).toEqual([]);
    expect(
      presentConnectedApps([{ client: { id: "not-a-uuid", name: "x" }, scopes: [], granted_at: null }]),
    ).toEqual([]);
  });

  it("strips control characters from a client name and caps its length", () => {
    const [row] = presentConnectedApps([
      { client: { id: OTHER, name: "Evil\u0000App\n" + "x".repeat(200) }, scopes: [], granted_at: null },
    ]);
    expect(row.name).not.toMatch(/[\u0000-\u001f\n]/);
    expect(row.name?.length).toBe(120);
  });
});

describe("isOauthClientId / parseConnectedAppsFeedback", () => {
  it("accepts only a UUID", () => {
    expect(isOauthClientId(CHATGPT)).toBe(true);
    expect(isOauthClientId("ChatGPT")).toBe(false);
    expect(isOauthClientId(null)).toBe(false);
    expect(isOauthClientId(`${CHATGPT}' or 1=1`)).toBe(false);
  });

  it("accepts only the known feedback codes", () => {
    expect(parseConnectedAppsFeedback("revoked")).toBe("revoked");
    expect(parseConnectedAppsFeedback("error")).toBe("error");
    expect(parseConnectedAppsFeedback("<script>")).toBeNull();
    expect(parseConnectedAppsFeedback(undefined)).toBeNull();
  });
});

describe("B3: each connected app with the person's own recorded choice", () => {
  const apps = presentConnectedApps([
    { client: { id: CHATGPT, name: "A" }, scopes: ["openid"], granted_at: "2026-10-01T00:00:00Z" },
    { client: { id: OTHER, name: "B" }, scopes: ["openid"], granted_at: "2026-09-01T00:00:00Z" },
  ]);
  const row = (over: Partial<OwnProductGrant>): OwnProductGrant => ({
    clientId: CHATGPT,
    clientName: "A",
    hasGrant: true,
    scopes: ["read:journal"],
    revoked: false,
    hasActiveConsent: true,
    requestedScope: null,
    updatedAt: null,
    ...over,
  });

  it("a recorded choice is shown as granted; no row is legacy, never 'none'", () => {
    const out = attachProductPermissions(apps, { ok: true, rows: [row({})] });
    expect(out[0].permissions).toEqual({ state: "granted", scopes: ["read:journal"] });
    expect(out[1].permissions).toEqual({ state: "legacy" });
  });

  it("a withdrawn choice is revoked; an empty choice is granted-with-nothing", () => {
    expect(attachProductPermissions(apps, { ok: true, rows: [row({ hasGrant: false, revoked: true, scopes: [] })] })[0].permissions)
      .toEqual({ state: "revoked" });
    expect(attachProductPermissions(apps, { ok: true, rows: [row({ scopes: [] })] })[0].permissions)
      .toEqual({ state: "granted", scopes: [] });
  });

  it("a failed read is 'unknown' for every app — never shown as legacy or as no permissions", () => {
    const out = attachProductPermissions(apps, { ok: false });
    expect(out.map((a) => a.permissions.state)).toEqual(["unknown", "unknown"]);
  });

  it("knows the permissions feedback codes", () => {
    expect(parseConnectedAppsFeedback("permissions_saved")).toBe("permissions_saved");
    expect(parseConnectedAppsFeedback("none_selected")).toBe("none_selected");
  });
});
