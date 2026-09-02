import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSafeReturnPath } from "@/lib/auth/redirect";
import {
  LOCALE_COOKIE_NAME,
  resolvePostLoginLocale,
} from "@/lib/auth/locale-preference";
import { readOauthTraceId } from "@/lib/auth/oauth-trace";
import {
  classifyAuthRedirectError,
  classifyExchangeFailure,
  isEmailConfirmFlow,
  parseEmailVerification,
  parseRedirectToHint,
} from "@/lib/auth/email-confirm";
import { routing } from "@/lib/i18n/routing";

/**
 * E-mail confirmation / OAuth callback. Supabase redirects here after the
 * user clicks the email link or finishes Google OAuth, with `?code=…` (PKCE
 * flow), OR — with the `token_hash` e-mail template — with
 * `?token_hash=…&type=signup`, which we verify ourselves (`verifyOtp`) so the
 * link works on ANY device, not only the browser that started the signup.
 * Either way a session cookie is established, then the user is routed:
 *
 *   • back to `?next=…` when the middleware attached one and it is safe,
 *   • else `/[locale]/onboarding` for users who haven't onboarded yet,
 *   • else `/[locale]/dashboard`.
 *
 * On any failure we bounce to `/[locale]/auth/login?error=…` while
 * preserving the original `next` param so the user still lands where
 * they intended after a retry. See lib/auth/email-confirm.ts for the
 * cross-device and resume reasoning (Train A slice 1).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: urlLocale } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // A `token_hash` template passes the original `emailRedirectTo` along as
  // `rt`; it is a HINT (locale + next) validated below, never a target.
  const hint = parseRedirectToHint(
    url.searchParams.get("rt"),
    url.origin,
    routing.locales as readonly string[],
  );
  const locale = hint.locale ?? urlLocale;
  const nextParam = url.searchParams.get("next") ?? hint.next;
  const verification = parseEmailVerification(url.searchParams);
  const emailConfirmFlow = isEmailConfirmFlow(url.searchParams);
  // v1 OAuth trace id (see lib/auth/oauth-trace.ts). NOT a secret; safe to
  // log and to forward to /login on failure so the user can quote it back.
  const traceId = readOauthTraceId(url);
  const loginUrl = new URL(`/${locale}/auth/login`, url.origin);
  if (nextParam) loginUrl.searchParams.set("next", nextParam);
  if (traceId) loginUrl.searchParams.set("trace", traceId);

  // A bounce that carries an explicit ?error= is an OUTCOME, not a missing
  // code: `error=access_denied` is the person pressing Cancel/Deny on the
  // provider's consent screen — a deliberate choice, not a system fault — so
  // it must not fall through to the "missing sign-in code" system-error copy.
  // Safe diagnostics only: `error` + `error_code` are bounded identifiers;
  // `error_description` is free-form provider text and is deliberately NOT
  // logged (same convention as never logging the full request URL).
  const providerError = url.searchParams.get("error");
  if (providerError) {
    const errorCode = url.searchParams.get("error_code");
    console.info("[auth/callback] provider returned an explicit error", {
      locale,
      trace: traceId,
      error: providerError,
      errorCode,
    });
    // `access_denied` + `otp_expired` is a dead e-mail link, not a cancel —
    // the classifier keeps the two apart (lib/auth/email-confirm.ts).
    loginUrl.searchParams.set(
      "error",
      classifyAuthRedirectError({ error: providerError, errorCode }),
    );
    return NextResponse.redirect(loginUrl);
  }

  if (!code && !verification) {
    console.error("[auth/callback] missing code in callback URL", {
      locale,
      trace: traceId,
    });
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await createClient();
    if (verification) {
      // token_hash path: GoTrue's single-use, expiring token is verified
      // here, so the session is created in THIS browser whatever device
      // started the signup. Nothing about PKCE is bypassed — no auth code
      // is involved on this path at all.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: verification.tokenHash,
        type: verification.type,
      });
      if (verifyError) {
        console.error("[auth/callback] verifyOtp failed", {
          locale,
          trace: traceId,
          type: verification.type,
          code: verifyError.code,
          status: verifyError.status,
          name: verifyError.name,
        });
        // Expired, already used, or never valid — the login page offers a
        // fresh link; a person who already confirmed simply signs in.
        loginUrl.searchParams.set("error", "link_expired");
        return NextResponse.redirect(loginUrl);
      }
    }
    const { error: exchangeError } = verification
      ? { error: null }
      : await supabase.auth.exchangeCodeForSession(code as string);
    if (exchangeError) {
      // Surface the non-secret Supabase error identifiers so the owner can
      // tell expired/already-used codes (`invalid_grant`) apart from PKCE
      // verifier cookie issues, network blips, etc. We deliberately do NOT
      // log the auth code, tokens, cookies, or the full request URL.
      console.error("[auth/callback] exchangeCodeForSession failed", {
        locale,
        trace: traceId,
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
        // E-mail confirmation opened on ANOTHER device: GoTrue already
        // confirmed the address before redirecting here, and this browser
        // holds no PKCE verifier → "confirmed, sign in here", not a fault.
        loginUrl.searchParams.set(
          "error",
          classifyExchangeFailure(exchangeError, emailConfirmFlow),
        );
        return NextResponse.redirect(loginUrl);
      }
      console.warn(
        "[auth/callback] exchangeCodeForSession errored but getSession is valid — proceeding (PKCE race fallback)",
        { locale, trace: traceId },
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("[auth/callback] getUser returned no user after exchange", {
        locale,
        trace: traceId,
      });
      loginUrl.searchParams.set("error", "no_user");
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at, locale")
      .eq("id", user.id)
      .single();

    // V8 W4-B item 2: honor the ACCOUNT language on a device that carries no
    // explicit choice. Priority (pinned by lib/auth/locale-preference.test.ts):
    // NEXT_LOCALE cookie > profiles.locale > the URL locale the middleware
    // derived from Accept-Language. When the profile preference wins, the
    // cookie is set so the choice sticks for every later navigation.
    // A NOT-yet-onboarded account never gets its URL locale overridden: its
    // profiles.locale is the signup-time DB default, not a human choice (the
    // onboarding wizard records the real one at completion).
    const jar = await cookies();
    const decision = resolvePostLoginLocale({
      cookieLocale: jar.get(LOCALE_COOKIE_NAME)?.value ?? null,
      profileLocale:
        (profile as { locale?: string | null } | null)?.locale ?? null,
      urlLocale: locale,
      onboarded: Boolean(profile?.onboarded_at),
    });
    const landingLocale = decision.locale;
    const withLocaleCookie = (res: NextResponse): NextResponse => {
      if (decision.overridden) {
        res.cookies.set(LOCALE_COOKIE_NAME, landingLocale, {
          // The SAME lifetime next-intl's middleware gives this cookie
          // (routing.localeCookie) — one truth for how long a choice lives.
          maxAge:
            (routing.localeCookie as { maxAge?: number }).maxAge ??
            60 * 60 * 24 * 365,
          path: "/",
          sameSite: "lax",
        });
      }
      return res;
    };

    // If onboarding is incomplete /onboarding still wins — the user
    // cannot usefully land on /dashboard/<anything> without a profile.
    // We attach the `next` query so onboarding completion can fall
    // back to it (when that hook is wired in a future PR).
    if (!profile?.onboarded_at) {
      const onboarding = new URL(`/${landingLocale}/onboarding`, url.origin);
      if (nextParam) onboarding.searchParams.set("next", nextParam);
      return withLocaleCookie(NextResponse.redirect(onboarding));
    }

    // A `next` value carrying its OWN locale prefix is an explicit deep link
    // and keeps it; a bare path gets the landing locale prefixed.
    const safeNext = getSafeReturnPath(nextParam, landingLocale);
    console.info("[auth/callback] success", {
      locale,
      trace: traceId,
      onboarded: !!profile?.onboarded_at,
    });
    return withLocaleCookie(NextResponse.redirect(new URL(safeNext, url.origin)));
  } catch (e) {
    // Without this the bare catch silently swallowed every unexpected error
    // (env throws, fetch failures, etc.) and the user saw `error=callback`
    // with no signal in Vercel logs. Log the error message only — never the
    // request URL (it carries the auth code).
    console.error("[auth/callback] unexpected error during exchange", {
      trace: traceId,
      ...(e instanceof Error
        ? { name: e.name, message: e.message }
        : { value: String(e) }),
    });
    loginUrl.searchParams.set("error", "callback");
    return NextResponse.redirect(loginUrl);
  }
}
