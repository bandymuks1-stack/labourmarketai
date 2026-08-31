"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AuthLegalNotice } from "@/components/app/auth-legal-notice";
import { GoogleButton } from "@/components/app/google-button";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";
import { getSafeReturnPath } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { markSignupPending, trackFunnel } from "@/lib/telemetry/task";
import {
  captureFirstTouchAttribution,
  getFirstTouchAttribution,
} from "@/lib/telemetry/attribution";
import { AUTH_INPUT_CLASS } from "@/components/app/auth-field-class";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const MIN_PASSWORD = 8;

/** Signup form. Google OAuth (shared button) + email/password/confirm
 *  (`signUp`). Role is no longer picked here — it moves to /onboarding.
 *  Email confirmation is OFF (DI prereq), so signUp returns a live session;
 *  we route straight to /onboarding. Magic link was removed in M1. */
export function SignupForm() {
  const t = useTranslations("auth.signup");
  const tErr = useTranslations("auth.errors");
  const locale = useLocale();
  const router = useRouter();
  // Honour the `?next=…` the middleware sets when it bounces an
  // unauthenticated user from a protected route to login → signup.
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextPath = getSafeReturnPath(nextParam, locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<
    "idle" | "signing" | "error" | "check_email"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  // When a returning user lands on /signup by mistake, Supabase returns
  // `user_already_exists`. We surface a one-click "Login instead" CTA
  // next to the error so they aren't stuck reading body text.
  const [errorKind, setErrorKind] = useState<"generic" | "alreadyRegistered">(
    "generic",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(t("error_email"));
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(t("error_password_short", { min: MIN_PASSWORD }));
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError(t("error_password_uppercase"));
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError(t("error_password_number"));
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      setError(t("error_password_special"));
      return;
    }
    if (password !== confirm) {
      setError(t("error_password_mismatch"));
      return;
    }
    setStatus("signing");
    // Registration-started conversion signal (Pre-Advertising Launch
    // Readiness v1) with first-touch campaign attribution. Fires only after
    // client validation passes, so it maps to a genuine signup attempt.
    // Idempotent capture handles a direct ad landing on /auth/signup.
    captureFirstTouchAttribution();
    trackFunnel(FUNNEL_EVENTS.registrationStarted, {
      surface: "email",
      ...getFirstTouchAttribution(),
    });
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Harmless when "Confirm email" is OFF; correct target if DI
          // re-enables verification later.
          emailRedirectTo: `${origin}/${locale}/auth/callback`,
          // Durable first-touch attribution (social-acquisition readiness
          // v1): localStorage lives on ONE device/browser only, so the
          // bounded first-touch fields also ride the signup into
          // auth.users.raw_user_meta_data — no schema change, no cookie.
          // Every value passed here has already been through the attribution
          // sanitizer (control chars stripped, angle brackets removed,
          // 120-char cap); when nothing was captured the spread adds nothing.
          data: { locale, ...getFirstTouchAttribution() },
        },
      });
      if (err) throw err;
      // Defensive: if "Confirm email" is ever toggled ON, signUp returns NO
      // session (and no error). Without this branch the form would redirect to
      // /onboarding, which bounces an unauthenticated user back to /login with
      // no message — a silent registration dead-end gated on a single Supabase
      // toggle. Show an explicit "check your email" state instead.
      if (!data.session) {
        setStatus("check_email");
        return;
      }
      // Confirm email OFF → session is live. Mark this session as a fresh
      // signup so the first authed surface emits `signup_completed`, then land
      // on the unified onboarding, propagating `next` so onboarding completion
      // can fall back to the user's original destination.
      markSignupPending("email");
      const onboardingPath = nextParam
        ? `/onboarding?next=${encodeURIComponent(nextPath)}`
        : "/onboarding";
      router.replace(onboardingPath);
    } catch (e) {
      console.error("[signup] signUp failed:", e);
      setStatus("error");
      const info = mapAuthError(e);
      setError(tErr(info.key, info.params));
      setErrorKind(
        info.key === "userAlreadyRegistered" ? "alreadyRegistered" : "generic",
      );
    }
  }

  const disabled = status === "signing";
  const passwordOk =
    password.length >= MIN_PASSWORD &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  // Confirm-email state: signUp returned no session (Supabase "Confirm email"
  // is ON). Tell the user to verify instead of silently bouncing to login.
  if (status === "check_email") {
    return (
      <div className="flex flex-col gap-4" role="status" data-testid="signup-check-email">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("check_email_title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("check_email_body", { email: email.trim() })}
        </p>
        <Link
          href="/auth/login"
          className="text-sm text-brand-blue hover:text-brand-cyan"
        >
          {t("login_link")} →
        </Link>
      </div>
    );
  }

  return (
    /* `method="post"` — pre-hydration fallback only. See login-form.tsx: without
       it an early submit GETs the password into the URL. */
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-6" noValidate>
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("headline")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {t("subcopy")}
        </p>
      </header>

      {/* GDPR Art. 13 first-layer notice must be visible BEFORE the Google
          button is pressed — the Google path collects account data too. */}
      <AuthLegalNotice variant="signup" />

      <GoogleButton
        label={t("google_label")}
        redirectingLabel={t("google_redirecting")}
        errorLabel={t("error_generic")}
        disabled={disabled}
        nextPath={nextPath}
        context="signup"
      />

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
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email_placeholder")}
          className={AUTH_INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("password_label")}
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={AUTH_INPUT_CLASS}
          aria-describedby="password-help"
        />
        <span
          id="password-help"
          className={cn(
            "flex items-center gap-1 text-text-muted",
            passwordOk && "text-state-live",
          )}
        >
          {passwordOk && <span aria-hidden>✓</span>}
          {t("password_help")}
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("confirm_password_label")}
        <input
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={AUTH_INPUT_CLASS}
        />
      </label>

      <p className="rounded-md border border-state-warning/40 px-3 py-2 text-xs leading-relaxed text-state-warning">
        {t("disclaimer")}
      </p>

      {error && (
        // The already-registered case is the most common reason an owner
        // bounces back here ("I registered yesterday — why am I not in?").
        // Surface a one-tap "Login instead" CTA right next to the error
        // text so the user isn't stuck searching for the footer link.
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-xs text-state-danger">{error}</p>
          {errorKind === "alreadyRegistered" && (
            <Link
              data-testid="signup-login-instead"
              href={
                nextParam
                  ? `/auth/login?next=${encodeURIComponent(nextPath)}`
                  : "/auth/login"
              }
              className="inline-flex w-fit items-center rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-1.5 text-xs font-semibold text-brand-blue hover:border-brand-blue"
            >
              {t("login_link")} →
            </Link>
          )}
        </div>
      )}

      {/* Repeated above the submit so the notice is on-screen at the moment
          the email/password form is submitted — the top instance can be a
          full viewport away on mobile. */}
      <AuthLegalNotice variant="signup" />

      <div className="flex items-center justify-between">
        <Button type="submit" disabled={disabled}>
          {disabled ? t("signing") : t("submit_label")}
        </Button>
        <span className="text-xs text-text-muted">
          {t("has_account")}{" "}
          <Link
            href={
              nextParam
                ? `/auth/login?next=${encodeURIComponent(nextPath)}`
                : "/auth/login"
            }
            className="text-brand-blue hover:text-brand-cyan"
          >
            {t("login_link")}
          </Link>
        </span>
      </div>
    </form>
  );
}
