import { describe, expect, it } from "vitest";

import { refusalStatus } from "./api-identity";
import {
  classifyRefusal,
  classifyTokenEndpointFailure,
  parseTokenEndpointError,
  refusalBody,
  serializeAuthEvent,
  wwwAuthenticateChallenge,
} from "./external-client-auth";

/**
 * The external-client auth contract (P0 brief §2): a client must be able to
 * tell RETRY AUTOMATICALLY from RECONNECT REQUIRED from a machine-readable
 * answer, and the resource server must keep api-identity's no-oracle rule
 * while doing so.
 */

const ORIGIN = "https://labourmarket.ai";

describe("resource-server refusals map to a next action, never to an oracle", () => {
  it("a rejected token — expired, revoked, foreign or malformed — is ONE class: refresh then retry", () => {
    const invalid = classifyRefusal("invalid-bearer");
    const malformed = classifyRefusal("malformed-bearer");
    expect(invalid).toEqual(malformed);
    expect(invalid.errorClass).toBe("ACCESS_TOKEN_REJECTED");
    expect(invalid.clientAction).toBe("retry_after_refresh");
    expect(invalid.userMessage).toBe("retry_automatically");
    expect(invalid.status).toBe(401);
  });

  it("no credential at all is 'authenticate', and is not the same class as a rejected one", () => {
    const r = classifyRefusal("no-credentials");
    expect(r.errorClass).toBe("CREDENTIALS_MISSING");
    expect(r.clientAction).toBe("authenticate");
    expect(r.status).toBe(401);
    expect(r.errorClass).not.toBe(classifyRefusal("invalid-bearer").errorClass);
  });

  it("an unreachable auth server is 'retry later' with the credential KEPT — never a reconnect", () => {
    const r = classifyRefusal("identity-unavailable");
    expect(r.errorClass).toBe("AUTH_PROVIDER_UNAVAILABLE");
    expect(r.clientAction).toBe("retry_later");
    expect(r.userMessage).toBe("temporarily_unavailable");
    expect(r.status).toBe(503);
  });

  it("a brake is 'back off', credential kept", () => {
    const r = classifyRefusal("rate-limited");
    expect(r.errorClass).toBe("RATE_LIMITED");
    expect(r.clientAction).toBe("back_off");
    expect(r.status).toBe(429);
  });

  it("status always comes from api-identity's ONE mapping", () => {
    for (const reason of ["no-credentials", "malformed-bearer", "invalid-bearer", "rate-limited", "identity-unavailable"] as const) {
      expect(classifyRefusal(reason).status).toBe(refusalStatus(reason));
    }
  });

  it("the JSON body carries the class and the action, and nothing else", () => {
    const body = refusalBody(classifyRefusal("invalid-bearer"));
    expect(body).toEqual({
      ok: false,
      error: "ACCESS_TOKEN_REJECTED",
      client_action: "retry_after_refresh",
      user_message: "retry_automatically",
    });
  });
});

describe("WWW-Authenticate is the RFC 6750 retry-vs-reconnect hinge", () => {
  it("a rejected token challenges with error=\"invalid_token\" AND the RFC 9728 pointer", () => {
    const h = wwwAuthenticateChallenge(ORIGIN, "ACCESS_TOKEN_REJECTED");
    expect(h).toBe(
      `Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`,
    );
  });

  it("a missing credential challenges WITHOUT an error attribute (RFC 6750 §3.1) but WITH the pointer", () => {
    const h = wwwAuthenticateChallenge(ORIGIN, "CREDENTIALS_MISSING");
    expect(h).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`);
    expect(h).not.toContain("error=");
  });

  it("503 and 429 are not challenges", () => {
    expect(wwwAuthenticateChallenge(ORIGIN, "AUTH_PROVIDER_UNAVAILABLE")).toBeNull();
    expect(wwwAuthenticateChallenge(ORIGIN, "RATE_LIMITED")).toBeNull();
  });
});

describe("token-endpoint failures: only the authorization server can say 'dead grant'", () => {
  it("the 2026-09-02 production failure — invalid_grant 'Refresh Token Not Found' — is REFRESH_REVOKED → reconnect", () => {
    const r = classifyTokenEndpointFailure({
      status: 400,
      error: "invalid_grant",
      errorDescription: "Invalid Refresh Token: Refresh Token Not Found",
    });
    expect(r.errorClass).toBe("REFRESH_REVOKED");
    expect(r.clientAction).toBe("reconnect");
    expect(r.userMessage).toBe("reconnect_required");
  });

  it("Supabase Auth's LEGACY body — no RFC `error` member, only error_code/msg — is classified the same way (measured 2026-09-02)", () => {
    // Exactly what production returned to ChatGPT's reconnect at 09:01:53Z:
    const parsed = parseTokenEndpointError(400, {
      code: 400,
      error_code: "refresh_token_not_found",
      msg: "Invalid Refresh Token: Refresh Token Not Found",
    });
    expect(parsed.rfcShaped).toBe(false);
    const r = classifyTokenEndpointFailure(parsed);
    expect(r.errorClass).toBe("REFRESH_REVOKED");
    expect(r.clientAction).toBe("reconnect");
    expect(r.userMessage).toBe("reconnect_required");
  });

  it("an RFC-shaped body reports rfcShaped=true and classifies identically", () => {
    const parsed = parseTokenEndpointError(400, {
      error: "invalid_grant",
      error_description: "Invalid Refresh Token: Refresh Token Not Found",
    });
    expect(parsed.rfcShaped).toBe(true);
    expect(classifyTokenEndpointFailure(parsed).errorClass).toBe("REFRESH_REVOKED");
  });

  it("legacy client / code-verifier codes fold into their RFC classes", () => {
    expect(classifyTokenEndpointFailure({ status: 400, errorCode: "oauth_client_not_found" }).errorClass).toBe("ACCOUNT_LINK_INVALID");
    expect(classifyTokenEndpointFailure({ status: 400, errorCode: "bad_code_verifier", msg: "invalid" }).errorClass).toBe("REFRESH_FAILED");
    expect(classifyTokenEndpointFailure({ status: 400, errorCode: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" }).errorClass).toBe("REFRESH_REVOKED");
  });

  it("a non-JSON body still yields a usable classification", () => {
    const r = classifyTokenEndpointFailure(parseTokenEndpointError(400, "not json"));
    expect(r.clientAction).toBe("reconnect");
  });

  it("rotation reuse ('Already Used') is also unrecoverable", () => {
    const r = classifyTokenEndpointFailure({ status: 400, error: "invalid_grant", errorDescription: "Invalid Refresh Token: Already Used" });
    expect(r.errorClass).toBe("REFRESH_REVOKED");
    expect(r.clientAction).toBe("reconnect");
  });

  it("an unrecognised invalid_grant is REFRESH_FAILED with ONE more refresh attempt, not a guessed dead grant", () => {
    const r = classifyTokenEndpointFailure({ status: 400, error: "invalid_grant", errorDescription: "something transient" });
    expect(r.errorClass).toBe("REFRESH_FAILED");
    expect(r.clientAction).toBe("retry_after_refresh");
  });

  it("5xx / unreachable is SERVER_AUTH_FAILURE → retry later, credential kept", () => {
    expect(classifyTokenEndpointFailure({ status: 503 }).clientAction).toBe("retry_later");
    expect(classifyTokenEndpointFailure({}).errorClass).toBe("SERVER_AUTH_FAILURE");
  });

  it("client, scope and user-revocation problems all require reconnect", () => {
    expect(classifyTokenEndpointFailure({ status: 401, error: "invalid_client" }).errorClass).toBe("ACCOUNT_LINK_INVALID");
    expect(classifyTokenEndpointFailure({ status: 400, error: "invalid_scope" }).errorClass).toBe("SCOPE_MISSING");
    expect(classifyTokenEndpointFailure({ status: 400, error: "access_denied" }).errorClass).toBe("USER_REVOKED_ACCESS");
    for (const e of ["invalid_client", "invalid_scope", "access_denied"]) {
      expect(classifyTokenEndpointFailure({ status: 400, error: e }).clientAction).toBe("reconnect");
    }
  });
});

describe("observability events never carry credentials or personal data", () => {
  it("serialises class-only events", () => {
    const line = serializeAuthEvent({
      event: "external_client.auth",
      outcome: "refused",
      error_class: "ACCESS_TOKEN_REJECTED",
      status: 401,
      door: "/api/mcp",
    });
    expect(JSON.parse(line)).toMatchObject({ event: "external_client.auth", outcome: "refused" });
    expect(line).not.toMatch(/eyJ/);
  });

  it("refuses an event that smuggles a forbidden key", () => {
    const smuggled = {
      event: "external_client.tool",
      door: "/api/mcp",
      tool: "profile_get",
      ok: true,
      token: "eyJ…",
    } as unknown as Parameters<typeof serializeAuthEvent>[0];
    expect(() => serializeAuthEvent(smuggled)).toThrow(/must not carry "token"/);
  });
});
