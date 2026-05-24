import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function handle(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Logout should never error to the user; cookies still cleared by signOut.
  }
  const url = new URL(request.url);
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
    new URL(`/${locale}/auth/login`, url.origin),
    { status: 303 },
  );
}

/** Accept POST (form submit from the dashboard) and GET (direct link), both
 *  clear the session and route the visitor to the localized login page via
 *  HTTP 303 so a POST-from-form redirects as GET. */
export const POST = handle;
export const GET = handle;
