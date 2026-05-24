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
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      // Surface the non-secret Supabase error identifiers so the owner can
      // tell expired/already-used codes (`invalid_grant`) apart from PKCE
      // verifier cookie issues, network blips, etc. We deliberately do NOT
      // log the auth code, tokens, cookies, or the full request URL.
      console.error("[auth/callback] exchangeCodeForSession failed", {
        locale,
        code: exchangeError.code,
        status: exchangeError.status,
        name: exchangeError.name,
        message: exchangeError.message,
      });

      // PKCE cookie race fallback: a concurrent token_revoke / cookie
      // overwrite can make exchangeCodeForSession abort locally before
      // posting to /token even though the SDK has already established a
      // valid session via other means (refresh, cached cookie). Check
      // getSession before giving up — if a real session is present we
      // proceed, exactly like a normal success. Verified safe: getSession
      // only reads existing cookies, never trusts client input.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        loginUrl.searchParams.set("error", "exchange_failed");
        return NextResponse.redirect(loginUrl);
      }
      console.warn(
        "[auth/callback] exchangeCodeForSession errored but getSession is valid — proceeding (PKCE race fallback)",
        { locale },
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("[auth/callback] getUser returned no user after exchange", {
        locale,
      });
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
  } catch (e) {
    // Without this the bare catch silently swallowed every unexpected error
    // (env throws, fetch failures, etc.) and the user saw `error=callback`
    // with no signal in Vercel logs. Log the error message only — never the
    // request URL (it carries the auth code).
    console.error(
      "[auth/callback] unexpected error during exchange",
      e instanceof Error ? { name: e.name, message: e.message } : e,
    );
    loginUrl.searchParams.set("error", "callback");
    return NextResponse.redirect(loginUrl);
  }
}
