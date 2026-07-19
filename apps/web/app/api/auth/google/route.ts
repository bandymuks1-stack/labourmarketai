import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";
import { getSafeReturnPath } from "@/lib/auth/redirect";
import {
  isAllowedAuthOrigin,
  parseGoogleSignInBody,
  validateGoogleIdTokenClaims,
  type GoogleIdTokenClaims,
} from "@/lib/auth/google-id-token";

/**
 * First-party Google sign-in endpoint (single-domain policy 2026-07-19).
 *
 * The GIS button on /{locale}/auth/login|signup POSTs the Google ID
 * token here — same origin only. The server:
 *   1. gates on Origin (CSRF) + a small per-IP rate limit;
 *   2. confirms the token with Google's tokeninfo endpoint (POST body,
 *      so the token never lands in a URL/query log);
 *   3. validates audience / issuer / expiry / nonce;
 *   4. exchanges it via the cookie-bound Supabase SSR client
 *      (`signInWithIdToken` — Supabase independently re-verifies the
 *      signature + nonce and links to the EXISTING auth user for a
 *      known Google identity or a matching verified email — no second
 *      identity system);
 *   5. answers { ok, next } — the page navigates; the browser never
 *      navigates through the raw Supabase host.
 *
 * Logging: request outcomes + non-secret error identifiers only. The
 * credential/ID token, session cookies and Supabase tokens are NEVER
 * logged (guarded by lib/guards/first-party-google-auth.test.ts).
 */

/** Per-IP sliding-window rate limit. In-memory: per serverless instance,
 *  which is acceptable as a brake on naive abuse (real abuse is already
 *  bounded upstream by Google + Supabase). */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, number[]>();

function isRateLimited(ip: string, now: number = Date.now()): boolean {
  const list = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_ATTEMPTS) {
    attempts.set(ip, list);
    return true;
  }
  list.push(now);
  attempts.set(ip, list);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
    }
  }
  return false;
}

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

async function fetchGoogleClaims(
  credential: string,
): Promise<GoogleIdTokenClaims | null> {
  // POST form body — never a query string, so the token cannot leak
  // into request logs. tokeninfo only returns claims for a token whose
  // signature Google itself validates.
  const res = await fetch(TOKENINFO_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: credential }),
  });
  if (!res.ok) return null;
  return (await res.json()) as GoogleIdTokenClaims;
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);

  // 1. CSRF: same-origin POSTs only.
  if (!isAllowedAuthOrigin(request.headers.get("origin"), url.origin)) {
    return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }

  // 2. Rate limit per client IP.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  // 3. Parse + structurally validate the body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  const body = parseGoogleSignInBody(raw);
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  const localeParam = url.searchParams.get("locale");
  const locale = (routing.locales as readonly string[]).includes(
    localeParam ?? "",
  )
    ? (localeParam as string)
    : routing.defaultLocale;

  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  if (!clientId) {
    // Feature not configured — the UI should not have offered this path.
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  try {
    // 4. Confirm with Google + validate claims.
    const claims = await fetchGoogleClaims(body.credential);
    if (!claims) {
      console.error("[auth/google] tokeninfo verification failed");
      return NextResponse.json(
        { ok: false, error: "invalid_token" },
        { status: 401 },
      );
    }
    const verdict = validateGoogleIdTokenClaims(claims, {
      clientId,
      nonce: body.nonce,
    });
    if (!verdict.ok) {
      console.error("[auth/google] claim validation failed", {
        reason: verdict.reason,
      });
      return NextResponse.json(
        { ok: false, error: verdict.reason },
        { status: 401 },
      );
    }

    // 5. Supabase exchange — cookie-bound SSR client writes the session
    //    cookies for THIS (labourmarket.ai) origin. Supabase re-verifies
    //    the token and attaches the existing user for a known identity /
    //    matching verified email; user ids, profiles, roles and FKs are
    //    untouched by design.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: body.credential,
      nonce: body.nonce,
    });
    if (error || !data?.user) {
      console.error("[auth/google] signInWithIdToken failed", {
        code: error?.code,
        status: error?.status,
        name: error?.name,
        message: error?.message,
      });
      return NextResponse.json(
        { ok: false, error: "exchange_failed" },
        { status: 401 },
      );
    }

    // 6. Route: onboarding gate mirrors the PKCE callback.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", data.user.id)
      .single();

    const next = profile?.onboarded_at
      ? getSafeReturnPath(body.next, locale)
      : `/${locale}/onboarding${
          body.next ? `?next=${encodeURIComponent(body.next)}` : ""
        }`;

    console.info("[auth/google] success", {
      locale,
      onboarded: !!profile?.onboarded_at,
    });
    return NextResponse.json({ ok: true, next });
  } catch (e) {
    console.error("[auth/google] unexpected error", {
      ...(e instanceof Error
        ? { name: e.name, message: e.message }
        : { value: String(e) }),
    });
    return NextResponse.json(
      { ok: false, error: "internal" },
      { status: 500 },
    );
  }
}
