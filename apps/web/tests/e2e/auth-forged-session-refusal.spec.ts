/**
 * FORGED SESSION, FRESH `exp` — REFUSED BEFORE ANYTHING RENDERS (owner §27).
 *
 * NEEDS THE LOCAL STACK. LOCAL INTEGRATION ONLY: this is not in the CI
 * Playwright subset (.github/workflows/e2e-smoke.yml has no Supabase). The
 * refusal under test is GoTrue rejecting a signature, so it needs a real
 * GoTrue, and the forged cookie is built from a real, locally minted session:
 *
 *   (repo root) npx supabase start && npx supabase db reset && pnpm db:fixtures:local
 *   (apps/web)  E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx scripts/e2e-mint-session.ts
 *   (apps/web)  pnpm e2e:local tests/e2e/auth-forged-session-refusal.spec.ts
 *
 * Status codes and bytes are what it measures, so prefer the local PRODUCTION
 * build (`next build`, `next start -p 3100`, then run with E2E_NO_SERVER=1):
 * every #1841 / #1843 figure was taken on that build.
 *
 * WHAT IT PROVES. `middleware.ts` reads the session cookie's `exp` WITHOUT
 * verifying the signature and, when it is fresh, returns without validating
 * anything — the P0 fast path. A cookie whose access token was re-signed with
 * somebody else's key but carries a fresh `exp` is therefore waved through by
 * the middleware (`Server-Timing: …jwt-fresh` on the response proves which
 * path it took). Each REQUIRES_AUTH tree must then refuse it itself, with a
 * verified `getUser()` in a frame above its `loading.tsx`:
 *
 *   /lt/dashboard, /lt/dashboard/company, /lt/onboarding, /lt/cv
 *     → a real 3xx to /lt/auth/login; no shell or skeleton bytes; none of
 *       the identity the forged token names.
 *   `RSC: 1` to /lt/dashboard/company
 *     → no page data: the refusal travels in the flight stream, and neither
 *       the identity nor the authenticated shell's state does.
 *
 * Every refusal is paired with the untampered session reaching the same shell
 * and carrying exactly those bytes, so a refusal cannot pass by refusing
 * everything. Negative control for whoever runs it: on 98472da01 (the commit
 * before #1843 added `cv/layout.tsx`) the /lt/cv case must FAIL — measured
 * then as HTTP 200, 21 125 bytes, `cv-loading` streamed.
 *
 * The structural half of the same invariant — a verified getter above every
 * boundary, for every prefix the middleware lists — is pinned without a stack
 * by lib/guards/suspense-boundary-gates.test.ts.
 */
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  combineChunks,
  createChunks,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";

import { forgeSignature } from "./jwt-forge";
import { HAS_LOCAL_STACK } from "./market-map-db-state";

const STORAGE_STATE = join(__dirname, ".storage-state.json");

/** One document per REQUIRES_AUTH tree, plus a role-gated page inside the
 *  dashboard (the #1841 case). */
const PROTECTED_DOCUMENTS = [
  "/lt/dashboard",
  "/lt/dashboard/company",
  "/lt/onboarding",
  "/lt/cv",
] as const;

/** Bytes that exist only once a protected tree started rendering: the
 *  authenticated shell's logo link and each tree's loading skeleton. */
const RENDER_MARKERS = [
  "shell-logo-home",
  "dashboard-section-loading",
  "onboarding-loading",
  "cv-loading",
] as const;

/** A key of the dashboard layout's `AuthProvider` state. It is serialized only
 *  when that layout rendered for a verified user. */
const AUTH_SHELL_STATE = "workspacePointerAvailable";

const LOGIN_PATH = "/lt/auth/login";
/** `TOKEN_FRESH_MARGIN_S` in middleware.ts — below it the fast path is skipped. */
const FAST_PATH_MARGIN_S = 120;
/** Unambiguously past that margin. */
const FRESH_FOR_S = 3600;
/** `@supabase/ssr`'s cookie encoding prefix. */
const BASE64_PREFIX = "base64-";

type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
};
type Cookie = { name: string; value: string };
type Forgery = {
  /** `sb-<ref>-auth-token` — the name the minted session was stored under. */
  key: string;
  /** The forged session, chunked exactly as `@supabase/ssr` writes it. */
  cookies: Cookie[];
  /** Who the forged token claims to be — bytes a refusal must never carry. */
  identity: { id: string; email: string | null };
  forgedExp: number;
};

/** The session cookie as `@supabase/ssr` stores it, decoded with the library's
 *  own chunk and base64url codec — the code the server reads it with. */
async function decodeSessionCookie(key: string, jar: Map<string, string>): Promise<Session> {
  const raw = await combineChunks(key, (name) => jar.get(name));
  if (!raw?.startsWith(BASE64_PREFIX)) {
    throw new Error(`${key} is not in the @supabase/ssr "base64-" cookie format`);
  }
  return JSON.parse(stringFromBase64URL(raw.slice(BASE64_PREFIX.length))) as Session;
}

/** The same token with `iat`/`exp` moved to now — the signature is replaced
 *  by `forgeSignature` afterwards, so only the claims survive. */
function withFreshExp(token: string, nowS: number): string {
  const [header, payload] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  const fresh = Buffer.from(
    JSON.stringify({ ...claims, iat: nowS, exp: nowS + FRESH_FOR_S }),
  ).toString("base64url");
  return `${header}.${fresh}.`;
}

async function buildForgery(): Promise<Forgery> {
  const state = JSON.parse(readFileSync(STORAGE_STATE, "utf8")) as { cookies: Cookie[] };
  const jar = new Map(state.cookies.map((c) => [c.name, c.value]));
  const key = [...jar.keys()]
    .map((name) => name.replace(/\.\d+$/, ""))
    .find((name) => /^sb-.+-auth-token$/.test(name));
  if (!key) {
    throw new Error(
      `${STORAGE_STATE} holds no sb-*-auth-token cookie — re-run scripts/e2e-mint-session.ts`,
    );
  }
  const session = await decodeSessionCookie(key, jar);
  const id = session.user?.id;
  if (!id) throw new Error("the minted session carries no user id");

  const nowS = Math.floor(Date.now() / 1000);
  const forged: Session = {
    ...session,
    // Real claims (the real `sub` and `session_id`), a fresh `exp`, and a
    // signature from a key that is not this project's.
    access_token: forgeSignature(withFreshExp(session.access_token, nowS)),
    // A GENUINE refresh token would let any refresh path mint a real session
    // out of this cookie, and the run would then measure rotation instead of
    // verification. A forger does not hold one either.
    refresh_token: "forged-refresh-token",
    // auth-js decides whether to refresh from `expires_at`, not from the JWT;
    // keep the two consistent so the server-side client goes straight to
    // `getUser()` with the forged token.
    expires_at: nowS + FRESH_FOR_S,
    expires_in: FRESH_FOR_S,
  };
  const value = BASE64_PREFIX + stringToBase64URL(JSON.stringify(forged));
  return {
    key,
    cookies: createChunks(key, value),
    identity: { id, email: session.user?.email ?? null },
    forgedExp: nowS + FRESH_FOR_S,
  };
}

let forgery: Promise<Forgery> | null = null;
const getForgery = (): Promise<Forgery> => (forgery ??= buildForgery());

type Probe = { status: number; location: string; serverTiming: string; body: string };

/** One request in its own context, never following a redirect — the status
 *  and the bytes of the FIRST answer are the whole point. */
async function probe(
  context: BrowserContext,
  path: string,
  headers: Record<string, string> = {},
): Promise<Probe> {
  try {
    let res = await context.request.get(path, { headers, maxRedirects: 0 });
    // A build that validates RSC request headers answers a bare `RSC: 1` with
    // a 307 to the SAME path plus `_rsc=`. That redirect is about the
    // request's shape, not about who is asking, so follow it exactly once.
    const loc = res.headers()["location"];
    if (headers.RSC && loc && new URL(loc, "http://x").pathname === path) {
      res = await context.request.get(loc, { headers, maxRedirects: 0 });
    }
    return {
      status: res.status(),
      location: res.headers()["location"] ?? "",
      serverTiming: res.headers()["server-timing"] ?? "",
      body: await res.text(),
    };
  } finally {
    await context.close();
  }
}

const genuineContext = (browser: Browser): Promise<BrowserContext> =>
  browser.newContext({ storageState: STORAGE_STATE });

async function forgedContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  expect(baseURL, "the forged cookie is scoped to the configured baseURL").toBeTruthy();
  const { cookies } = await getForgery();
  const context = await browser.newContext();
  await context.addCookies(cookies.map((c) => ({ ...c, url: baseURL! })));
  return context;
}

test.describe("a forged session cookie with a fresh exp is refused before render (owner §27)", () => {
  test.skip(!HAS_LOCAL_STACK, "Needs the local Supabase stack (pnpm e2e:local).");
  test.skip(
    !existsSync(STORAGE_STATE),
    `${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
  );

  test("control — the untampered minted session reaches the authenticated shell", async ({
    browser,
  }) => {
    const { identity } = await getForgery();
    const res = await probe(await genuineContext(browser), "/lt/dashboard");
    expect(
      res.status,
      "the minted session must open /lt/dashboard (mint an ONBOARDED fixture user, e.g. dev.worker@local.test), or the refusals below prove nothing",
    ).toBe(200);
    // The exact bytes every refusal below must NOT carry — present here, so
    // their absence there is a measurement and not a typo.
    expect(res.body).toContain(identity.id);
    expect(res.body).toContain("shell-logo-home");
    expect(res.body).toContain(AUTH_SHELL_STATE);
  });

  test("precondition — the forged cookie is one the middleware's fast path admits", async () => {
    const { key, cookies, forgedExp } = await getForgery();
    // Read it back the way middleware.ts does: join, strip `base64-`, parse,
    // decode the payload — and never look at the signature.
    const session = await decodeSessionCookie(key, new Map(cookies.map((c) => [c.name, c.value])));
    const { exp } = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"),
    ) as { exp: number };
    expect(exp).toBe(forgedExp);
    expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(FAST_PATH_MARGIN_S);
  });

  for (const path of PROTECTED_DOCUMENTS) {
    test(`${path} answers a real redirect to login, with no protected bytes`, async ({
      browser,
      baseURL,
    }) => {
      const { identity } = await getForgery();
      const res = await probe(await forgedContext(browser, baseURL), path);
      expect(
        res.serverTiming,
        "the middleware must have admitted this cookie on its unverified exp (jwt-fresh); if it refused it instead, this test says nothing about the layout gate",
      ).toContain("jwt-fresh");
      expect(
        res.status,
        `${path}: a forged session must get a real 3xx, not a 200 that redirects on the client`,
      ).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(new URL(res.location, "http://x").pathname).toBe(LOGIN_PATH);
      for (const marker of RENDER_MARKERS) {
        expect(res.body, `${path}: "${marker}" reached a refused visitor`).not.toContain(marker);
      }
      expect(res.body, `${path}: the forged token's identity was rendered`).not.toContain(
        identity.id,
      );
      if (identity.email) expect(res.body).not.toContain(identity.email);
    });
  }

  test("an RSC request to /lt/dashboard/company carries no page data", async ({
    browser,
    baseURL,
  }) => {
    const { identity } = await getForgery();

    // Control: the same request shape with the untampered session DOES carry
    // the identity and the shell state. (/lt/dashboard, because a worker is
    // role-refused from /company — that refusal is not what is measured here.)
    const ok = await probe(await genuineContext(browser), "/lt/dashboard", { RSC: "1" });
    expect(ok.status).toBe(200);
    expect(ok.body).toContain(identity.id);
    expect(ok.body).toContain(AUTH_SHELL_STATE);

    const res = await probe(await forgedContext(browser, baseURL), "/lt/dashboard/company", {
      RSC: "1",
    });
    expect(res.serverTiming).toContain("jwt-fresh");
    if (res.status >= 300 && res.status < 400) {
      expect(new URL(res.location, "http://x").pathname).toBe(LOGIN_PATH);
    } else {
      // A flight response cannot change its status once it streams; the
      // refusal travels as the redirect digest the client router acts on.
      expect(res.status).toBe(200);
      expect(res.body).toMatch(/NEXT_REDIRECT;[a-z]+;\/lt\/auth\/login/);
    }
    expect(res.body, "the forged token's identity reached the flight payload").not.toContain(
      identity.id,
    );
    if (identity.email) expect(res.body).not.toContain(identity.email);
    expect(res.body, "the authenticated shell's state was serialized").not.toContain(
      AUTH_SHELL_STATE,
    );
    expect(res.body).not.toContain("shell-logo-home");
  });
});
