import { describe, expect, it } from "vitest";

import {
  isOauthClientId,
  parseConnectedAppsFeedback,
  presentConnectedApps,
} from "./connected-apps";

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
