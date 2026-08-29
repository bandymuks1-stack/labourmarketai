import { describe, expect, it } from "vitest";

import { bearerToken, refusalStatus } from "./api-identity";

/**
 * Header parsing is where an auth bypass hides.
 *
 * A permissive regex here does not look like a security bug — it looks like
 * tolerance. So the accepted shape is pinned from BOTH sides: what must be
 * read as a credential, and what must not be read as one at all.
 *
 * Nothing here reaches a network or a database; these are the pure parts, kept
 * pure precisely so they can be tested exhaustively.
 */
const h = (value?: string): Headers =>
  new Headers(value === undefined ? {} : { authorization: value });

describe("bearerToken accepts exactly one well-formed credential", () => {
  it("reads a plain bearer token", () => {
    expect(bearerToken(h("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme, per RFC 6750", () => {
    expect(bearerToken(h("bearer abc.def.ghi"))).toBe("abc.def.ghi");
    expect(bearerToken(h("BEARER abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("tolerates surrounding whitespace and extra spaces after the scheme", () => {
    expect(bearerToken(h("  Bearer   abc.def.ghi  "))).toBe("abc.def.ghi");
  });

  it("accepts the base64url + padding alphabet a real JWT uses", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhLWIifQ.-_sig123=";
    expect(bearerToken(h(jwt.padStart(jwt.length + 7, " ").replace(/^ +/, "Bearer "))))
      .toBe(jwt);
  });
});

describe("bearerToken refuses everything else", () => {
  it("no header at all", () => {
    expect(bearerToken(h())).toBeNull();
  });

  it("an empty header", () => {
    expect(bearerToken(h(""))).toBeNull();
  });

  it("a scheme with no token", () => {
    expect(bearerToken(h("Bearer"))).toBeNull();
    expect(bearerToken(h("Bearer   "))).toBeNull();
  });

  it("a different scheme — Basic is not a bearer token", () => {
    expect(bearerToken(h("Basic dXNlcjpwYXNz"))).toBeNull();
  });

  it("a bare token with no scheme", () => {
    expect(bearerToken(h("abc.def.ghi"))).toBeNull();
  });

  it("two credentials in one header", () => {
    // Accepting the first of several would let a caller smuggle a second
    // identity past anything that logs or inspects only one.
    expect(bearerToken(h("Bearer abc.def.ghi, Bearer zzz.yyy.xxx"))).toBeNull();
  });

  it("a doubled scheme", () => {
    expect(bearerToken(h("Bearer Bearer abc.def.ghi"))).toBeNull();
  });

  it("whitespace inside the token", () => {
    expect(bearerToken(h("Bearer abc def"))).toBeNull();
  });

  it("characters outside the token alphabet", () => {
    expect(bearerToken(h("Bearer abc;def"))).toBeNull();
    expect(bearerToken(h("Bearer <script>"))).toBeNull();
    expect(bearerToken(h("Bearer abc\tdef"))).toBeNull();
  });

  it("a newline never reaches the parser — the platform refuses it first", () => {
    // The classic header-injection primitive. `Headers` rejects it at
    // construction, so this is asserted as the platform guarantee it is
    // rather than credited to the regex below it.
    expect(() => h("Bearer abc\ndef")).toThrow();
  });
});

describe("a refusal never reads as an anonymous request", () => {
  it("unknown callers get 401", () => {
    expect(refusalStatus("no_credentials")).toBe(401);
    expect(refusalStatus("invalid_token")).toBe(401);
  });

  it("a known caller with no profile gets 403, not 401", () => {
    // 401 would invite the client to retry with credentials it already sent.
    expect(refusalStatus("no_profile")).toBe(403);
  });

  it("an identity we could not establish is 503, not 401 or 403", () => {
    // The #1314 rule: a read that did not answer is not a fact about the
    // caller. Reporting it as 401/403 would assert something never determined.
    expect(refusalStatus("identity_unavailable")).toBe(503);
  });
});
