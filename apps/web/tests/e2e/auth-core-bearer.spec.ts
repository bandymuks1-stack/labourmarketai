/**
 * AUTH-CORE API BOUNDARY — the negative controls, against the real stack.
 *
 * The boundary's whole claim is one sentence: **a bearer caller can never do
 * more than the same person's web session.** That claim is only worth
 * something if the refusals are observed, so every test below is a REFUSAL
 * except the two that prove the door opens at all — and each refusal is paired
 * with the positive case that would fail if the refusal were vacuous.
 *
 * Nothing here is mocked. Real GoTrue, real JWTs, real PostgREST, real RLS.
 *
 *   A  no credentials                        → 401
 *   B  malformed Authorization header        → 401
 *   C  well-formed token, forged signature   → 401   (≈ another project's key)
 *   D  correctly signed but EXPIRED          → 401
 *   E  user A reads user B's worker skills   → 403   (ownsWorker + RLS)
 *   F  user A WRITES user B's worker skills  → 403   and the rows are unchanged
 *   G  valid token, own resource             → 200, the caller's own rows
 *   H  bearer authority == cookie authority  → the same call, both transports
 *   I  a bad token WITH a valid session cookie → 401, not the cookie identity
 *
 * D exists separately from C because "expired" and "forged" are different
 * failures and a boundary can easily catch one while missing the other. It is
 * the only reason the local stack's JWT secret is forwarded into the run.
 *
 * I EXISTS BECAUSE THE OTHER EIGHT CANNOT SEE THE WORST BUG. A–H are all sent
 * without cookies, so a boundary that quietly fell back to the cookie session
 * on a bad token would answer 401 to every one of them and the file would be
 * green. Measured, by building exactly that fallback: A–H and the cookie
 * regression all still passed, and I was the ONLY failure.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { makeDocx } from "../../lib/cv/__fixtures__/cv-fixtures";
import { FIXTURE_PROFILES, fixtureWorkerId } from "./fixture-ids";
import { HAS_LOCAL_STACK } from "./market-map-db-state";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const JWT_SECRET = process.env.E2E_LOCAL_JWT_SECRET ?? "";
const STORAGE_STATE = join(__dirname, ".storage-state.json");

test.describe("auth-core bearer boundary", () => {
  test.skip(
    !HAS_LOCAL_STACK || !SUPABASE_URL || !ANON_KEY,
    "Needs the local Supabase stack (pnpm e2e:local).",
  );

  // Each RUN is its own rate-limit client. The boundary's failure limiter is
  // keyed on the forwarded client key; without this, the deliberate failures
  // of consecutive local runs pool in one shared bucket and a later run's
  // controls start answering 429 for reasons that have nothing to do with the
  // control. (That pooling is also how the all-attempts limiter defect was
  // caught, so this line is a control-isolation fix, not a cover-up: the
  // failure-only semantics are pinned by lib/api/api-identity.test.ts.)
  test.use({
    extraHTTPHeaders: { "x-forwarded-for": `e2e-run-${Date.now()}` },
  });

  const WORKER = { email: "dev.worker@local.test", password: "password" };
  const COMPANY = { email: "dev.company@local.test", password: "password" };

  /** A REAL access token for a fixture user, straight from local GoTrue. */
  async function accessToken(
    request: APIRequestContext,
    who: { email: string; password: string },
  ): Promise<string> {
    const res = await request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
        data: { email: who.email, password: who.password },
      },
    );
    expect(res.status(), `sign-in failed for ${who.email}`).toBe(200);
    const body = (await res.json()) as { access_token?: string };
    expect(body.access_token, `no access_token for ${who.email}`).toBeTruthy();
    return body.access_token as string;
  }

  const b64url = (buf: Buffer | string): string =>
    Buffer.from(buf).toString("base64url");

  /** Sign a JWT with the LOCAL stack's own secret — so the signature is real
   *  and only the claim under test (here, `exp`) is wrong. */
  function signLocalJwt(claims: Record<string, unknown>): string {
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify(claims));
    const sig = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    return `${header}.${payload}.${sig}`;
  }

  /**
   * The same header and payload, signed with a key that is not this project's
   * — i.e. a token minted by somebody else's Supabase project.
   *
   * The obvious version of this (flip the last character of the signature) is
   * WRONG and flaked on the first run: a 32-byte HMAC is 43 base64url
   * characters, and the final character carries only two significant bits, so
   * several distinct characters decode to the identical signature. The token
   * stayed valid and the test reported a security hole that was not there.
   * Re-signing removes the ambiguity entirely.
   */
  function forgeSignature(token: string): string {
    const [h, p] = token.split(".");
    const sig = createHmac("sha256", `${JWT_SECRET || "x"}-not-this-project`)
      .update(`${h}.${p}`)
      .digest("base64url");
    return `${h}.${p}.${sig}`;
  }

  function skillsUrl(workerId: string): string {
    return `/api/workers/${workerId}/skills`;
  }

  // ── A / B / C / D — the door stays shut ────────────────────────────────

  test("A — no credentials at all is refused", async ({ request }) => {
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const res = await request.get(skillsUrl(workerId));
    expect(res.status()).toBe(401);
  });

  test("B — a malformed Authorization header is refused, never treated as anonymous-then-cookie", async ({
    request,
  }) => {
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    for (const header of [
      "Bearer",
      "Bearer not-a-jwt",
      "Bearer aaa.bbb",
      "Basic dXNlcjpwYXNzd29yZA==",
      // The forms that #1336 was measured to serve as the COOKIE identity —
      // each collapses to "absent" under a two-state parser and each must be
      // "malformed" under this one (repro 2026-08-29, 8/8 fell through).
      "Bearer Bearer aaa.bbb.ccc",
      "Bearer aaa.bbb.ccc,Bearer ddd.eee.fff",
      "Bearer aaa.bbb ccc",
      "Bearer aaa.bbb\tccc",
      "aaa.bbb.ccc",
      "Bearer ",
    ]) {
      const res = await request.get(skillsUrl(workerId), {
        headers: { Authorization: header },
      });
      expect(res.status(), `"${header}" should be refused`).toBe(401);
    }
  });

  test("C — a well-formed token with a forged signature is refused", async ({
    request,
  }) => {
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const real = await accessToken(request, WORKER);

    // Control: the UNTAMPERED token works, so the refusal below is about the
    // signature and not about the URL, the worker or the fixture state.
    const ok = await request.get(skillsUrl(workerId), {
      headers: { Authorization: `Bearer ${real}` },
    });
    expect(ok.status(), "the real token must work first").toBe(200);

    const res = await request.get(skillsUrl(workerId), {
      headers: { Authorization: `Bearer ${forgeSignature(real)}` },
    });
    expect(res.status()).toBe(401);
  });

  test("D — a correctly signed but EXPIRED token is refused", async ({
    request,
  }) => {
    test.skip(
      JWT_SECRET.length === 0,
      "E2E_LOCAL_JWT_SECRET not forwarded — expiry cannot be tested on its own.",
    );
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const real = await accessToken(request, WORKER);
    const claims = JSON.parse(
      Buffer.from(real.split(".")[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    const nowSec = Math.floor(Date.now() / 1000);
    const expired = signLocalJwt({ ...claims, iat: nowSec - 7200, exp: nowSec - 3600 });

    // Control: the SAME claims with a future exp, signed the same way, are
    // accepted — so the refusal is about `exp` and not about our signing.
    const stillValid = signLocalJwt({ ...claims, iat: nowSec, exp: nowSec + 3600 });
    const ok = await request.get(skillsUrl(workerId), {
      headers: { Authorization: `Bearer ${stillValid}` },
    });
    expect(
      ok.status(),
      "a self-signed token with a FUTURE exp must be accepted, or this test proves nothing about exp",
    ).toBe(200);

    const res = await request.get(skillsUrl(workerId), {
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status()).toBe(401);
  });

  test("D2 — the service-role key can never become a user", async ({
    request,
  }) => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    test.skip(
      serviceKey.length === 0,
      "SUPABASE_SERVICE_ROLE_KEY not forwarded by the local runner.",
    );
    // A correctly signed, unexpired credential for THIS project — but it
    // carries `role: service_role` and no user. If the boundary ever answered
    // anything but a refusal here, an infrastructure credential would have
    // walked through the user door. (The C control already proved a real
    // user token works against this same URL, so a 401 here is about the
    // credential's KIND, not a broken endpoint.)
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const res = await request.get(skillsUrl(workerId), {
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    expect(res.status()).toBe(401);
  });

  // ── E / F — a valid token is not a skeleton key ────────────────────────

  test("E — user A cannot READ user B's skills, even with a perfectly valid token", async ({
    request,
  }) => {
    const workerA = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const tokenB = await accessToken(request, COMPANY);

    // Control: B's token is genuinely valid — it authenticates fine.
    const whoami = await request.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` },
    });
    expect(whoami.status(), "B's token must be valid for this to mean anything").toBe(200);

    const res = await request.get(skillsUrl(workerA), {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(
      res.status(),
      "authentication is not authorization — ownsWorker still decides",
    ).toBe(403);
  });

  test("F — user A cannot WRITE user B's skills, and B's rows are untouched", async ({
    request,
  }) => {
    const workerA = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const tokenA = await accessToken(request, WORKER);
    const tokenB = await accessToken(request, COMPANY);

    const before = await request.get(skillsUrl(workerA), {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(before.status()).toBe(200);
    const beforeBody = (await before.json()) as { skills: unknown[] };

    const attack = await request.post(skillsUrl(workerA), {
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      data: { skillIds: [] },
    });
    expect(attack.status(), "a foreign write must be refused").toBe(403);

    // The refusal has to be REAL, not a 403 after a partial write.
    const after = await request.get(skillsUrl(workerA), {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const afterBody = (await after.json()) as { skills: unknown[] };
    expect(
      afterBody.skills.length,
      "the refused write must not have changed anything",
    ).toBe(beforeBody.skills.length);
  });

  // ── G / H — the door opens, and to exactly the same room ───────────────

  test("G — a valid token reaches the caller's OWN canonical data", async ({
    request,
  }) => {
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const token = await accessToken(request, WORKER);

    const res = await request.get(skillsUrl(workerId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean; skills: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
  });

  test("H — the bearer transport grants exactly the cookie transport's authority", async ({
    request,
    browser,
  }) => {
    test.skip(
      !existsSync(STORAGE_STATE),
      `${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts (the cookie half needs a real session).`,
    );
    const workerA = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const workerB = await fixtureWorkerId(FIXTURE_PROFILES.company);

    // The cookie session belongs to the SAME person as the bearer token.
    const cookieCtx = await browser.newContext({ storageState: STORAGE_STATE });
    const cookieReq = cookieCtx.request;
    const token = await accessToken(request, WORKER);
    const bearer = { Authorization: `Bearer ${token}` };

    try {
      const own = {
        cookie: (await cookieReq.get(skillsUrl(workerA))).status(),
        bearer: (await request.get(skillsUrl(workerA), { headers: bearer })).status(),
      };
      const foreign = {
        cookie: (await cookieReq.get(skillsUrl(workerB))).status(),
        bearer: (await request.get(skillsUrl(workerB), { headers: bearer })).status(),
      };

      expect(own.bearer, "own resource: same answer on both transports").toBe(own.cookie);
      expect(
        foreign.bearer,
        "foreign resource: same REFUSAL on both transports — bearer must never widen authority",
      ).toBe(foreign.cookie);
      // And the two answers must genuinely differ, or the equality above is
      // satisfied by a route that refuses (or allows) everything.
      expect(own.cookie).not.toBe(foreign.cookie);
    } finally {
      await cookieCtx.close();
    }
  });

  /**
   * THE control for "never falls back".
   *
   * A, B, C and D are all sent WITHOUT cookies, so a boundary that quietly
   * fell through to the cookie session on a bad token would still answer 401
   * to every one of them and every test would stay green. This is the only
   * case that separates "refused the token" from "ignored the token": a REAL
   * session cookie and a forged bearer, together. The cookie alone reaches
   * 200 (the last test proves it); adding a bad token must take that away, not
   * be ignored.
   */
  test("I — a bad token is refused even when a valid session cookie is present", async ({
    request,
    browser,
  }) => {
    test.skip(
      !existsSync(STORAGE_STATE),
      `${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
    );
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const ctx = await browser.newContext({ storageState: STORAGE_STATE });
    try {
      // Control: this exact context, with no Authorization header, is allowed.
      expect(
        (await ctx.request.get(skillsUrl(workerId))).status(),
        "the cookie session must be valid, or the refusal below proves nothing",
      ).toBe(200);

      const forged = forgeSignature(await accessToken(request, WORKER));
      const res = await ctx.request.get(skillsUrl(workerId), {
        headers: { Authorization: `Bearer ${forged}` },
      });
      expect(
        res.status(),
        "a caller who presented a token must be judged on that token — serving them the cookie identity instead is how a client ends up acting as somebody it did not name",
      ).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  // ── The other shared routes, over the same transport ───────────────────

  /**
   * `/api/cv/extract` is a multipart POST, not a JSON GET — a different code
   * path through the boundary, and the one a mobile client hits first.
   */
  test("the CV import route is reachable over bearer, and closed without it", async ({
    request,
  }) => {
    const token = await accessToken(request, WORKER);
    const docx = Buffer.from(
      makeDocx(["Jonas Petraitis", "2019-2023 UAB Testas, stogdengys"].join("\n")),
    );
    const file = {
      name: "cv.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    };

    const anon = await request.post("/api/cv/extract", { multipart: { file } });
    expect(anon.status(), "no credentials → refused").toBe(401);

    const res = await request.post("/api/cv/extract", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean; text: string; format: string };
    expect(body.ok).toBe(true);
    expect(body.format).toBe("docx");
    expect(body.text).toContain("UAB Testas");
  });

  /**
   * The document door is the most authorization-heavy read in `app/api`. A
   * valid token must NOT turn it into an existence oracle: a file the caller
   * may not see and a file that does not exist must answer the same way.
   */
  test("the document door gives a bearer caller no existence oracle", async ({
    request,
  }) => {
    const token = await accessToken(request, WORKER);
    const nowhere = "00000000-0000-4000-8000-000000000000";

    const anon = await request.get(`/api/documents/file/${nowhere}`);
    expect(anon.status(), "no credentials → refused").toBe(401);

    const res = await request.get(`/api/documents/file/${nowhere}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(
      res.status(),
      "authenticated but unauthorized/absent must be one indistinguishable 404",
    ).toBe(404);
  });

  // ── The web client must not regress ────────────────────────────────────

  test("the cookie path is unchanged — a real session still reaches the same route", async ({
    browser,
  }) => {
    test.skip(
      !existsSync(STORAGE_STATE),
      `${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
    );
    const workerId = await fixtureWorkerId(FIXTURE_PROFILES.worker);
    const ctx = await browser.newContext({ storageState: STORAGE_STATE });
    try {
      const res = await ctx.request.get(skillsUrl(workerId));
      expect(res.status(), "the browser transport must survive the boundary").toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
