"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AuthLegalNotice } from "@/components/app/auth-legal-notice";
import {
  FacebookButton,
  GoogleButton,
  LinkedInButton,
} from "@/components/app/google-button";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";
import { getSafeReturnPath } from "@/lib/auth/redirect";
import { isVercelPreviewHost } from "@/lib/auth/oauth-trace";
import { clearSignupPending, trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { AUTH_INPUT_CLASS } from "@/components/app/auth-field-class";

/** Map of callback-route `?error=…` codes to a translation key under
 *  `auth.errors.oauth.*`. Any code not listed here falls through to the
 *  generic copy. The codes themselves match what `/[locale]/auth/callback`
 *  sets. */
const OAUTH_ERROR_KEYS: Record<string, string> = {
  missing_code: "oauth.missing_code",
  exchange_failed: "oauth.exchange_failed",
  no_user: "oauth.no_user",
  callback: "oauth.callback",
  // The person pressed Cancel/Deny at the provider — a deliberate choice,
  // rendered as a NEUTRAL status, never as a system fault.
  cancelled: "oauth.cancelled",
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Login form. Social OAuth (shared same-tab buttons) + email/password
 *  (`signInWithPassword`). Magic link was removed in the M1 auth refactor.
 *  On success the session is set and we route to /dashboard — middleware
 *  bounces not-yet-onboarded users on to /onboarding.
 *
 *  `linkedinEnabled` / `facebookEnabled` come from the SERVER page component
 *  (lib/auth/enabled-providers.ts — the auth server's own `/settings`
 *  answer). Default FALSE = fail-closed: a provider button never renders
 *  unless the auth server confirmed it can complete the flow (§18 honesty —
 *  and never as a disabled/greyed decoration either). */
export function LoginForm({
  linkedinEnabled = false,
  facebookEnabled = false,
}: {
  linkedinEnabled?: boolean;
  facebookEnabled?: boolean;
} = {}) {
  const t = useTranslations("auth.login");
  const tSocial = useTranslations("auth.social");
  const tErr = useTranslations("auth.errors");
  const locale = useLocale();
  // Honour the `?next=…` the middleware sets when it bounces an
  // unauthenticated user from a protected route to login. Sanitised via
  // `getSafeReturnPath` so an open-redirect query can't survive.
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextPath = getSafeReturnPath(nextParam, locale);
  const oauthErrorCode = searchParams.get("error");
  const oauthTrace = searchParams.get("trace");
  // `reset-password` routes here with `?reset=1` after `updateUser` succeeded.
  // Nothing read it, so the one moment a person most needs confirmation — they
  // just typed a new password twice — showed them a bare login screen with no
  // sign it had worked. They cannot tell "saved" from "silently failed".
  const passwordWasReset = searchParams.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // True after a failed email/password attempt — the most common cause is a
  // Google-only account (no password), so we point the user back to Google.
  const [passwordFailed, setPasswordFailed] = useState(false);
  const [isPreviewHost, setIsPreviewHost] = useState(false);

  // Detect Vercel preview host (e.g. labourmarketai-<sha>.vercel.app)
  // client-side only — the host is window-bound. Production
  // (`labourmarket.ai`) and the Vercel-managed prod alias
  // (`labourmarket-ai.vercel.app`) are NOT flagged.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsPreviewHost(isVercelPreviewHost(window.location.host));
    }
  }, []);

  // Surface the callback-route's `?error=…` so the user sees a precise
  // reason instead of a silent re-render. The trace id is exposed too —
  // it's not a secret and lets the user quote it back in a bug report.
  const oauthError = oauthErrorCode
    ? tErr(OAUTH_ERROR_KEYS[oauthErrorCode] ?? "oauth.unknown")
    : null;
  // A cancel is not a failure: neutral styling, `role="status"` (below).
  const oauthCancelled = oauthErrorCode === "cancelled";

  // Any `?error=` bounce means the OAuth attempt did NOT create a session.
  // The Google button optimistically marks a pending signup BEFORE the
  // redirect; without this cleanup a cancelled attempt would leave that flag
  // in localStorage and mislabel a much-later ordinary login as a completed
  // signup. Clearing emits nothing — the signup never happened.
  useEffect(() => {
    if (oauthErrorCode) clearSignupPending();
  }, [oauthErrorCode]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPasswordFailed(false);
    if (!isValidEmail(email)) {
      setError(t("error_email"));
      return;
    }
    if (!password) {
      setError(t("error_password_required"));
      return;
    }
    setStatus("signing");
    trackFunnel(FUNNEL_EVENTS.loginStarted, { surface: "password" });
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      // `next` already includes the locale prefix (or got one from
      // `getSafeReturnPath`), so use the raw `window.location` navigation
      // route instead of the locale-aware Link.
      window.location.assign(nextPath);
    } catch (e) {
      console.error("[login] signInWithPassword failed:", e);
      setStatus("error");
      const info = mapAuthError(e);
      setError(tErr(info.key, info.params));
      // Password sign-in failed — surface the Google path. A Google-created
      // account has no password, so "invalid credentials" here usually means
      // "you signed up with Google", not "wrong password".
      setPasswordFailed(true);
    }
  }

  const disabled = status === "signing";

  return (
    /* `method="post"` is the PRE-HYDRATION fallback, not a real endpoint.
       Without it a submit issued before React attaches `onSubmit` falls back to
       the browser default — a GET to this URL with every field as a query
       parameter — which put the password in the address bar, the history, the
       server access log and any Referer:
         /lt/auth/login?email=…&password=…
       Reproduced in a real browser on 2026-08-07. POST keeps the values in a
       request body that nothing here reads. */
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-6" noValidate>
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("headline")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {t("subcopy")}
        </p>
      </header>

      {passwordWasReset && (
        // Confirms the reset actually saved, in the place the reset flow
        // sends people. Carries no account information, so it is safe to
        // render from a query param alone.
        <div
          role="status"
          className="rounded-md border border-state-live/40 bg-state-live/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          data-testid="login-reset-success"
        >
          {t("reset_success")}
        </div>
      )}
      {oauthError && (
        // Surfaced when the callback redirected back here with `?error=…`.
        // The trace id (also a URL param) is shown so the user can quote
        // it in support. NEVER includes the auth code, tokens, or cookies.
        // A CANCEL at the provider is a deliberate choice, not a fault —
        // it renders as a neutral status line, not a red alert.
        <div
          role={oauthCancelled ? "status" : "alert"}
          className={
            oauthCancelled
              ? "rounded-md border border-ink-600/60 bg-ink-500/10 px-3 py-2 text-xs leading-relaxed text-text-secondary"
              : "rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs leading-relaxed text-state-danger"
          }
          data-testid="login-oauth-error"
        >
          <p>{oauthError}</p>
          {oauthTrace && (
            <p className="mt-1 font-mono text-meta text-text-muted">
              trace: {oauthTrace}
            </p>
          )}
        </div>
      )}
      {isPreviewHost && (
        // Honest framing for testers who land on a preview deployment.
        // The Vercel preview is gated by SSO BEFORE the page reaches
        // Supabase, and the Supabase project's Site URL + redirect
        // allowlist target the production origin, not per-deployment
        // preview URLs. So Google login WILL bounce back here from
        // Supabase even after the SSO gate. Surfacing this up-front
        // saves the tester from blaming the product.
        <div
          role="status"
          className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          data-testid="login-preview-notice"
        >
          {t("preview_host_notice")}
        </div>
      )}

      {/* The Google button on LOGIN also creates an account for a new Google
          identity, so the same pre-collection notice must appear here — the
          OAuth path may not bypass it. Email/password login below creates no
          account and needs no notice. */}
      <AuthLegalNotice variant="googleLogin" />

      {/* `context="signup"` because this button is ACCOUNT-CREATING for a new
          Google identity (see the notice above) — the press mirrors the signup
          form exactly: first-touch attribution + `registration_started` +
          the pending-signup marker. A returning login is never mis-counted:
          only the /onboarding surface (which a returning user never mounts)
          emits `signup_completed` from that marker. */}
      <GoogleButton
        label={t("google_label")}
        redirectingLabel={t("google_redirecting")}
        errorLabel={t("error_generic")}
        disabled={disabled}
        nextPath={nextPath}
        context="signup"
      />

      {/* LinkedIn/Facebook render ONLY when the auth server reports the
          provider enabled — same account-creating same-tab flow as Google,
          so `context="signup"` for the same attribution reasons. */}
      {linkedinEnabled && (
        <LinkedInButton
          label={tSocial("continueWithLinkedIn")}
          redirectingLabel={t("google_redirecting")}
          errorLabel={t("error_generic")}
          disabled={disabled}
          nextPath={nextPath}
          context="signup"
        />
      )}
      {facebookEnabled && (
        <FacebookButton
          label={tSocial("continueWithFacebook")}
          redirectingLabel={t("google_redirecting")}
          errorLabel={t("error_generic")}
          disabled={disabled}
          nextPath={nextPath}
          context="signup"
        />
      )}

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-ink-500" />
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("divider")}
        </span>
        <span className="h-px flex-1 bg-ink-500" />
      </div>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("email_label")}
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (passwordFailed) setPasswordFailed(false);
          }}
          className={AUTH_INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        <span className="flex items-center justify-between">
          {t("password_label")}
          <Link
            href="/auth/forgot-password"
            className="text-brand-blue hover:text-brand-cyan"
          >
            {t("forgot_password")}
          </Link>
        </span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={AUTH_INPUT_CLASS}
        />
      </label>

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}
      {passwordFailed && (
        // The most common reason an email/password attempt fails for this
        // product is that the account was created with Google (no password).
        // Point the user back up to the Google button instead of leaving them
        // stuck on a password they never set.
        <p
          className="rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          role="status"
          data-testid="login-google-hint"
        >
          ↑ {t("google_hint")}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="submit" loading={disabled}>
          {disabled ? t("signing") : t("submit_label")}
        </Button>
        <span className="text-xs text-text-muted">
          {t("no_account")}{" "}
          <Link
            // Preserve the `?next=…` the middleware attached, so a user
            // bounced from /dashboard/journal → login → signup still
            // returns to /dashboard/journal after onboarding.
            href={
              nextParam
                ? `/auth/signup?next=${encodeURIComponent(nextPath)}`
                : "/auth/signup"
            }
            className="text-brand-blue hover:text-brand-cyan"
          >
            {t("signup_link")}
          </Link>
        </span>
      </div>

      {/* Prominent, mobile-clear password recovery — the inline link above is
          easy to miss on a phone. No old password is needed; a reset link is
          emailed. */}
      <div
        className="flex flex-col items-center gap-1 border-t border-ink-600/60 pt-4 text-center"
        data-testid="login-recover"
      >
        <Link
          href="/auth/forgot-password"
          className="text-sm font-semibold text-brand-blue hover:text-brand-cyan"
          data-testid="login-recover-link"
        >
          {t("reset_password_cta")}
        </Link>
        <p className="text-meta leading-relaxed text-text-muted">
          {t("reset_password_help")}
        </p>
      </div>
    </form>
  );
}
