import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/lib/i18n/routing";
import { env } from "@/lib/env";
import {
  CANONICAL_ORIGIN,
  isLegacyRedirectHost,
} from "@/lib/domain/canonical";

const intl = createIntlMiddleware(routing);

/** Pure host-normalization: if a request lands on a legacy alias
 *  (www.labourmarket.ai or app.labourmarket.ai), permanently (308)
 *  redirect to the canonical apex
 *  https://labourmarket.ai/<same-path>?<same-query> — preserving
 *  locale, query, `next`, IDs and invitation tokens. The apex itself
 *  serves content and is NEVER redirected (no loop possible: the
 *  target host is not a legacy host). Returns undefined when no
 *  redirect is needed.
 *
 *  Policy (2026-07-19, single-domain): labourmarket.ai is the only
 *  product origin; www + app are redirect aliases only. next.config
 *  host redirects cover /api and static paths this middleware
 *  matcher excludes — this is the in-app belt-and-braces layer. */
function maybeRedirectLegacyHostToCanonical(
  request: NextRequest,
): NextResponse | undefined {
  const host = request.headers.get("host");
  if (!isLegacyRedirectHost(host)) return undefined;
  const target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    CANONICAL_ORIGIN,
  );
  // 308 = permanent + method-preserving (301-class for SEO). Consolidates
  // all legacy aliases onto the apex so Google indexes a single host.
  return NextResponse.redirect(target, 308);
}

/** OAuth-code safety net: if Supabase's redirect allow-list rejects a
 *  `redirect_to`, GoTrue falls back to the configured Site URL — the user
 *  then lands on the site ROOT carrying `?code=<uuid>` instead of on
 *  `/{locale}/auth/callback`, and the PKCE exchange never runs. Forward
 *  such a stray code to the locale callback (same query preserved) so
 *  Google login survives an allow-list/site-URL mismatch during the
 *  single-domain migration. Scoped tightly: root or bare-locale path
 *  only, and the code must be UUID-shaped (GoTrue's PKCE code format)
 *  so ordinary `?code=` marketing params elsewhere are untouched. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function maybeForwardStrayOauthCode(
  request: NextRequest,
): NextResponse | undefined {
  const { pathname, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code || !UUID_RE.test(code)) return undefined;
  const parts = pathname.split("/").filter(Boolean);
  const isRoot = parts.length === 0;
  const isBareLocale =
    parts.length === 1 &&
    (routing.locales as readonly string[]).includes(parts[0]);
  if (!isRoot && !isBareLocale) return undefined;
  const locale = isBareLocale ? parts[0] : routing.defaultLocale;
  const target = request.nextUrl.clone();
  target.pathname = `/${locale}/auth/callback`;
  return NextResponse.redirect(target, 307);
}

/** Locale-stripped pathname, e.g. "/lt/dashboard" → "/dashboard". */
function stripLocale(pathname: string): { locale: string; rest: string } {
  const parts = pathname.split("/");
  const maybeLocale = parts[1];
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, rest: "/" + parts.slice(2).join("/") };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

// /cv renders ONLY the caller's own session data and robots-disallows itself;
// it was gated at the page level alone until W4 — the middleware backstop
// keeps that protection from depending on one redirect() call surviving.
const REQUIRES_AUTH = ["/dashboard", "/onboarding", "/cv"];

/** True if the request carries a Supabase auth cookie. `@supabase/ssr` names
 *  the session cookie `sb-<ref>-auth-token` (chunked: `…-auth-token.0`, …). We
 *  only run the (network) session refresh when such a cookie exists, so
 *  anonymous public/marketing traffic stays fast and never hits Supabase. */
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

/** Seconds of remaining access-token life below which the middleware still
 *  performs the full network refresh (rotation window). */
const TOKEN_FRESH_MARGIN_S = 120;

/**
 * P0 auth-performance fast path: read the access token's `exp` straight from
 * the `@supabase/ssr` session cookie WITHOUT any network call. When the JWT
 * is comfortably fresh, the middleware skips its GoTrue `getUser()`
 * round-trip — the RSC layer (dashboard layout / pages) still performs the
 * REAL validated `getUser()` on every request, and RLS enforces authz at the
 * data layer, so this removes only a redundant validation hop (~100-300 ms
 * on every authenticated navigation), never an authorization boundary.
 * Unparseable/legacy/expiring cookies fall through to the full refresh path.
 */
function readAccessTokenExpSeconds(request: NextRequest): number | null {
  try {
    const chunks = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    if (chunks.length === 0) return null;
    let raw = chunks.map((c) => c.value).join("");
    raw = decodeURIComponent(raw);
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice("base64-".length), "base64").toString("utf8");
    }
    const session = JSON.parse(raw) as { access_token?: string };
    const jwt = session.access_token;
    if (!jwt) return null;
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64").toString("utf8"),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function hasFreshAccessToken(request: NextRequest): boolean {
  const exp = readAccessTokenExpSeconds(request);
  if (exp === null) return false;
  return exp - Math.floor(Date.now() / 1000) > TOKEN_FRESH_MARGIN_S;
}

export async function middleware(request: NextRequest) {
  // 0. Host normalization runs BEFORE locale/intl + auth so legacy
  //    aliases (www + app) never reach the app shell — they 308
  //    straight to the apex. Only the apex serves content.
  const hostRedirect = maybeRedirectLegacyHostToCanonical(request);
  if (hostRedirect) return hostRedirect;

  // 0b. Stray OAuth code on the root (Site-URL fallback) → locale callback.
  const codeForward = maybeForwardStrayOauthCode(request);
  if (codeForward) return codeForward;

  // 1. Locale routing — may redirect (`/` → `/lt`) or rewrite. When intl
  //    issues its own redirect (e.g. `/` → `/lt`, `/dashboard` → `/lt/dashboard`)
  //    we return it as-is; the redirected request re-enters middleware with a
  //    locale prefix and the session/auth logic runs then.
  const intlResponse = intl(request);
  if (intlResponse.headers.get("location")) return intlResponse;

  const { locale, rest } = stripLocale(request.nextUrl.pathname);
  const needsAuth = REQUIRES_AUTH.some((p) => rest === p || rest.startsWith(p + "/"));

  // Without the anon key we cannot touch sessions; let the request through
  // (the page itself surfaces the misconfiguration).
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return intlResponse;

  // 2. Session refresh. The canonical @supabase/ssr pattern refreshes the
  //    session in middleware so a logged-in user's access token is rotated on
  //    every navigation — NOT only when they happen to open a /dashboard route.
  //    Skipping this (the prior behaviour) let tokens silently expire while a
  //    user browsed public pages, so the next protected hit bounced them back
  //    to login. We only do it when an auth cookie is present, so anonymous
  //    traffic on the public marketing surface never pays a Supabase round-trip.
  const isAuthedRequest = hasSupabaseAuthCookie(request);
  if (!needsAuth && !isAuthedRequest) return intlResponse;

  // Fast path (P0 perf): a comfortably-fresh access token needs neither
  // rotation nor a middleware-level validation round-trip — the RSC layer
  // validates for real on every request and redirects unauthenticated
  // visitors itself. This turns the per-navigation middleware cost into
  // pure cookie parsing. Stale/absent/legacy tokens take the full path.
  if (hasFreshAccessToken(request)) {
    intlResponse.headers.set("Server-Timing", "mw;dur=0;desc=jwt-fresh");
    return intlResponse;
  }

  // Refreshed Set-Cookie headers are written onto the intl response so BOTH the
  // locale handling and the rotated session cookies survive (the prior code
  // discarded the intl response on authed routes).
  const response = intlResponse;
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates + refreshes the session (rotating cookies via setAll).
  const refreshStart = Date.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Non-secret observability: how long the middleware auth hop took.
  response.headers.set(
    "Server-Timing",
    `mw;dur=${Date.now() - refreshStart};desc=refresh`,
  );

  // Public route (auth cookie present but maybe expired): just propagate the
  // refreshed session — never gate.
  if (!needsAuth) return response;

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/auth/login`;
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding gating happens in the dashboard layout, which already reads
  // the profile row for the auth shell and redirects to /onboarding when
  // `onboarded_at` is null. Re-reading profiles here added one extra
  // Supabase round-trip to EVERY authed dashboard navigation for a check
  // the layout repeats anyway (P0 interaction-latency audit) — middleware
  // keeps only the auth gate + session refresh above.

  return response;
}

export const config = {
  // Run on everything except API, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
