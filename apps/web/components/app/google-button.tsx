"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  generateOauthTraceId,
  isVercelPreviewHost,
  rememberOauthTraceId,
  withOauthTraceId,
} from "@/lib/auth/oauth-trace";
import { markSignupPending, recordEvent, trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  captureFirstTouchAttribution,
  getFirstTouchAttribution,
} from "@/lib/telemetry/attribution";

/** Official Google "G" mark (multicolour). Inline so the white OAuth button
 *  needs no asset pipeline. */
function GoogleLogo() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" — ONE flow: a SAME-TAB redirect (owner ruling
 * 2026-07-29, P0).
 *
 * The previous GIS ID-token integration opened a SEPARATE POPUP WINDOW for
 * the account chooser. The owner ruled the popup out: sign-in must happen as
 * a full-page redirect in the same tab. So this button now does exactly one
 * thing — `signInWithOAuth` with a PKCE callback on our own
 * `/{locale}/auth/callback`, which routes the user back to their intended
 * `next` path (or onboarding) with the fresh session cookies.
 *
 * DELIBERATE TRADE, recorded: the redirect passes through the Supabase auth
 * host for one hop. The consent screen itself is branded `labourmarket.ai`
 * (OAuth runbook, Lever 1.5 — applied), and this flow needs NO Google-console
 * change because the Supabase callback is the registered redirect URI. The
 * fully-branded alternative (GIS `ux_mode: "redirect"` with a login_uri on
 * our domain) requires adding that URI to the console's Authorized redirect
 * URIs first — a one-action owner step documented in
 * docs/GOOGLE_OAUTH_BRANDING_RUNBOOK.md. Popup removal outranks the host
 * cosmetics, so redirect ships now.
 *
 * Locale + return path: the callback URL carries the active locale segment
 * and the sanitised `next` param, so after Google the user lands back on the
 * SAME locale and the SAME intended page — never on someone else's profile
 * and never on a bare default route.
 */
export function GoogleButton({
  label,
  redirectingLabel,
  errorLabel,
  disabled,
  nextPath,
  context = "login",
}: {
  label: string;
  redirectingLabel: string;
  errorLabel: string;
  disabled?: boolean;
  /** Already-sanitised internal path (see `getSafeReturnPath`). When set,
   *  the auth callback routes the user here on success. */
  nextPath?: string;
  /** Which surface hosts this button. In "signup" context the press is a
   *  registration attempt (emits `registration_started` with first-touch
   *  attribution) and a NEW user landing on /onboarding is marked so the
   *  first authed surface emits `signup_completed`. Default "login". */
  context?: "signup" | "login";
}) {
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onClick() {
    setFailed(false);
    setLoading(true);
    try {
      const supabase = createClient();
      // Evict stale local auth state BEFORE writing a fresh PKCE
      // code_verifier cookie (see the PKCE-race note in the git history).
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // No local session — irrelevant for a fresh OAuth start.
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // The SAME-locale callback with the intended return path — this is what
      // brings the user back to where they started, in their language.
      const callback = new URL(`${origin}/${locale}/auth/callback`);
      if (nextPath) callback.searchParams.set("next", nextPath);
      const traceId = generateOauthTraceId();
      rememberOauthTraceId(traceId);
      const callbackWithTrace = withOauthTraceId(callback, traceId);
      console.info("[auth] oauth start", {
        provider: "google",
        trace: traceId,
        origin,
        locale,
      });
      recordEvent("google_oauth_start", {
        provider: "google",
        trace: traceId,
        origin,
        preview_host: isVercelPreviewHost(
          typeof window !== "undefined" ? window.location.host : null,
        ),
      });
      trackFunnel(FUNNEL_EVENTS.loginStarted, { surface: "google" });
      if (context === "signup") {
        // Mirror the email path so Google signups are counted in the
        // acquisition funnel with first-touch campaign attribution.
        captureFirstTouchAttribution();
        trackFunnel(FUNNEL_EVENTS.registrationStarted, {
          surface: "google",
          ...getFirstTouchAttribution(),
        });
        // The callback routes a NEW user to /onboarding; mark the pending
        // signup now so the first authed surface emits `signup_completed`
        // exactly once. A returning user never reaches /onboarding, so they
        // are never mis-counted (the marker is consumed only there).
        markSignupPending("google");
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        // SAME TAB. No popup: the browser itself navigates to Google and
        // back. skipBrowserRedirect stays default (false) on purpose.
        options: { redirectTo: callbackWithTrace.toString() },
      });
      if (error) throw error;
      // Success: this tab navigates to Google; keep the loading state so the
      // button cannot be double-pressed during the handoff.
    } catch (e) {
      // Never log tokens — name/message only.
      console.error("[auth] signInWithOAuth(google) failed:", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
      recordEvent("google_oauth_error", {
        provider: "google",
        result_kind: e instanceof Error ? e.name : "unknown",
      });
      setLoading(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-testid="google-signin"
        // The button surface is ALWAYS the Google-white card (`bg-white`), so
        // its label must use a FIXED dark ink — never `text-ink-900`, which
        // inverts to near-white under `[data-theme="light"]` and makes the
        // label invisible (white-on-white). `#1f1f1f` is Google's own button
        // text colour and is theme-independent, matching the fixed `bg-white`.
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleLogo />
        {loading ? redirectingLabel : label}
      </button>
      {failed && (
        <p className="text-xs text-state-danger" role="alert">
          {errorLabel}
        </p>
      )}
    </div>
  );
}
