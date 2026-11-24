import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";
import { isSameOriginRequest } from "@/lib/http/same-origin-request";

/**
 * WHO MAY END THIS SESSION (walk-spec finding, 2026-10-25: CSRF logout).
 *
 * Any page on the internet could sign a person out with
 * `<img src="https://labourmarket.ai/lt/auth/logout">` or a self-submitting
 * form, because both verbs signed out unconditionally. The session is ended
 * only for a request the person's own browser made from this site:
 *
 *   · the shared same-origin check (`isSameOriginRequest`, the one
 *     `/api/assistant/transcript` uses): the sign-out form in the account
 *     menu and the account page, and the invite page's same-origin links;
 *   · a GET the person started themselves — typed, bookmarked or opened in a
 *     new tab — which the browser marks `Sec-Fetch-Site: none`. No other site
 *     can produce that value, so it is not a cross-site door.
 *
 * Anything else (a cross-site page, a look-alike host, a request carrying
 * neither fetch metadata nor an Origin) does NOT sign out: it is sent to the
 * account page, where the real sign-out button is, with the session intact.
 */
function mayEndSession(request: Request): boolean {
  if (isSameOriginRequest(request)) return true;
  return request.method === "GET" && request.headers.get("sec-fetch-site") === "none";
}

async function handle(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  // The public origin, not the request URL: behind the VPS proxy that is the
  // bind host (0.0.0.0:3000) and sign-out landed on an unreachable address.
  const origin = requestPublicOrigin(request);
  if (!mayEndSession(request)) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard/account`, origin), {
      status: 303,
    });
  }
  try {
    const supabase = await createClient();
    // SCOPE IS `local` ON PURPOSE — and it is the fix for a real incident.
    //
    // supabase-js documents its own default: `signOut(options = { scope:
    // "global" })`. Global sign-out asks GoTrue to DELETE every session the
    // user holds — not only this browser's, but also the sessions minted for
    // external OAuth clients the user deliberately authorised (ChatGPT,
    // Claude, a future mobile build, any MCP client). Their refresh grants go
    // with the sessions, so the next refresh answers `invalid_grant /
    // Refresh Token Not Found` and the assistant shows the person a
    // "reconnect your account" wall for no reason they can see.
    //
    // 2026-09-02: that is exactly what happened in production. The owner
    // signed out of the web app on 2026-08-31; ChatGPT's 2026-08-30 grant
    // was deleted with it; the next `@LabourMarket.ai` call failed at the
    // token endpoint before ever reaching /api/mcp. Signing out of ONE
    // device must not silently revoke a delegated grant the person made on
    // purpose — revoking an external client is its own explicit decision
    // (`supabase.auth.oauth.revokeGrant`), never a side effect of logout.
    //
    // `local` ends THIS session only (the cookie-bound one), which is what
    // "Sign out" on a device means. The Google button and the mobile app
    // already sign out with `scope: "local"` for the same reason.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Logout should never error to the user; cookies still cleared by signOut.
  }
  // Localized login (not the locale home) so the next action after sign
  // out is unambiguous: re-authenticate, switch account, or close the
  // tab. Owner-requested in the account-menu-logout-admin-visibility
  // hotfix doc.
  //
  // CRITICAL — use HTTP 303 "See Other". Next's default redirect is 307
  // which PRESERVES the original request method. A logout form posts to
  // this route, and a 307 made the browser POST again to
  // /[locale]/auth/login, which only accepts GET → Vercel responded
  // 405 INVALID_REQUEST_METHOD. 303 forces the browser to load the
  // login page with GET, matching POST-redirect-GET semantics.
  return NextResponse.redirect(
    new URL(`/${locale}/auth/login`, origin),
    { status: 303 },
  );
}

/** Accept POST (form submit from the dashboard) and GET (direct link). Both
 *  clear the session only for a same-origin / user-started request (see
 *  `mayEndSession`) and route the visitor to the localized login page via
 *  HTTP 303 so a POST-from-form redirects as GET. */
export const POST = handle;
export const GET = handle;
