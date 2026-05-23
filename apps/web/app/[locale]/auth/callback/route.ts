import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeReturnPath } from "@/lib/auth/redirect";

/**
 * Magic-link / OAuth callback. Supabase redirects here after the user
 * clicks the email link or finishes Google OAuth, with `?code=…` (PKCE
 * flow). We exchange it for a session cookie, then route the user:
 *
 *   • back to `?next=…` when the middleware attached one and it is safe,
 *   • else `/[locale]/onboarding` for users who haven't onboarded yet,
 *   • else `/[locale]/dashboard`.
 *
 * On any failure we bounce to `/[locale]/auth/login?error=…` while
 * preserving the original `next` param so the user still lands where
 * they intended after a retry.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const loginUrl = new URL(`/${locale}/auth/login`, url.origin);
  if (nextParam) loginUrl.searchParams.set("next", nextParam);

  if (!code) {
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      loginUrl.searchParams.set("error", "exchange_failed");
      return NextResponse.redirect(loginUrl);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      loginUrl.searchParams.set("error", "no_user");
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single();

    // If onboarding is incomplete /onboarding still wins — the user
    // cannot usefully land on /dashboard/<anything> without a profile.
    // We attach the `next` query so onboarding completion can fall
    // back to it (when that hook is wired in a future PR).
    if (!profile?.onboarded_at) {
      const onboarding = new URL(`/${locale}/onboarding`, url.origin);
      if (nextParam) onboarding.searchParams.set("next", nextParam);
      return NextResponse.redirect(onboarding);
    }

    const safeNext = getSafeReturnPath(nextParam, locale);
    return NextResponse.redirect(new URL(safeNext, url.origin));
  } catch {
    loginUrl.searchParams.set("error", "callback");
    return NextResponse.redirect(loginUrl);
  }
}
