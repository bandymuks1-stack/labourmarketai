"use client";

import { useState, type ReactNode } from "react";
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

/** LinkedIn "in" bug, white on transparent — sits on the brand-blue button
 *  surface below. Inline so no external asset pipeline is needed. */
function LinkedInLogo() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}

/** Facebook "f" mark, white on transparent — sits on the brand-blue button
 *  surface below. Inline so no external asset pipeline is needed. */
function FacebookLogo() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
      <path d="M13.5 21.9v-8.4h2.82l.42-3.27H13.5V8.14c0-.95.26-1.59 1.62-1.59h1.74V3.63c-.3-.04-1.33-.13-2.53-.13-2.5 0-4.22 1.53-4.22 4.34v2.42H7.28v3.27h2.83v8.37c.62.09 1.25.13 1.89.13.51 0 1.01-.03 1.5-.13Z" />
    </svg>
  );
}

/**
 * Provider seam (social-acquisition readiness v1).
 *
 * Everything about the ONE approved OAuth flow — same-tab `signInWithOAuth`
 * with the PKCE callback on OUR host (owner ruling 2026-07-29, P0) — is
 * provider-agnostic. Only the pieces below differ per provider, so adding
 * LinkedIn OIDC later costs ONE config object + i18n labels at the call
 * sites, not a fork of this file. The Google architecture guards
 * (lib/guards/google-same-tab-redirect.test.ts and friends) keep reading this
 * file by its literal path, which is why the generic core lives here and the
 * file keeps its name.
 */
type OAuthProviderConfig = {
  /** Supabase provider id, passed verbatim to `signInWithOAuth`. */
  readonly id: "google" | "linkedin_oidc" | "facebook";
  /** Inline provider mark rendered before the label. */
  readonly logo: ReactNode;
  /** Stable e2e hook, e.g. "google-signin". */
  readonly testId: string;
  /** The button surface class. Provider brand guidelines fix the surface
   *  (Google mandates the white card), so it is config, not a caller prop. */
  readonly buttonClassName: string;
  /** Marks the pending signup with THIS provider's bounded surface label so
   *  the onboarding surface emits `signup_completed` exactly once. */
  readonly markPending: () => void;
  /** Provider-named SAFE failure log: extracts ONLY `.name` + `.message` of
   *  the start error — never the full Error object, whose subclass `cause`
   *  could carry sensitive data — with the provider named in the fixed
   *  message string so each provider's failures stay grep-able. */
  readonly logStartFailure: (e: unknown) => void;
};

type OAuthButtonProps = {
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
   *  onboarding surface emits `signup_completed`. BOTH auth pages pass
   *  "signup": the login page's Google button equally creates an account
   *  for a new Google identity, so its attribution may not be dropped.
   *  Default "login" (a conservative default for future surfaces that are
   *  genuinely login-only). */
  context?: "signup" | "login";
};

/**
 * Generic same-tab OAuth button — ONE flow: a SAME-TAB redirect (owner
 * ruling 2026-07-29, P0).
 *
 * The previous GIS ID-token integration opened a SEPARATE POPUP WINDOW for
 * the account chooser. The owner ruled the popup out: sign-in must happen as
 * a full-page redirect in the same tab. So this button does exactly one
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
 * and the sanitised `next` param, so after the provider the user lands back
 * on the SAME locale and the SAME intended page — never on someone else's
 * profile and never on a bare default route.
 */
function OAuthProviderButton({
  provider,
  label,
  redirectingLabel,
  errorLabel,
  disabled,
  nextPath,
  context = "login",
}: OAuthButtonProps & { provider: OAuthProviderConfig }) {
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
        provider: provider.id,
        trace: traceId,
        origin,
        locale,
      });
      recordEvent(`${provider.id}_oauth_start`, {
        provider: provider.id,
        trace: traceId,
        origin,
        preview_host: isVercelPreviewHost(
          typeof window !== "undefined" ? window.location.host : null,
        ),
      });
      trackFunnel(FUNNEL_EVENTS.loginStarted, { surface: provider.id });
      if (context === "signup") {
        // Mirror the email path so social signups are counted in the
        // acquisition funnel with first-touch campaign attribution.
        captureFirstTouchAttribution();
        trackFunnel(FUNNEL_EVENTS.registrationStarted, {
          surface: provider.id,
          ...getFirstTouchAttribution(),
        });
        // The callback routes a NEW user to /onboarding; mark the pending
        // signup now so the ONBOARDING surface emits `signup_completed`
        // exactly once (SessionTelemetry emits it only there). A returning
        // user never mounts /onboarding — the dashboard clears an unconsumed
        // marker silently — and a cancelled/failed attempt bounces back to
        // /auth/login?error=…, which clears the marker too. So an optimistic
        // press-time marker never becomes a false signup count.
        provider.markPending();
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider.id,
        // SAME TAB. No popup: the browser itself navigates to the provider
        // and back. skipBrowserRedirect stays default (false) on purpose.
        options: { redirectTo: callbackWithTrace.toString() },
      });
      if (error) throw error;
      // Success: this tab navigates to the provider; keep the loading state
      // so the button cannot be double-pressed during the handoff.
    } catch (e) {
      // Never log tokens — name/message only (see logStartFailure contract).
      provider.logStartFailure(e);
      recordEvent(`${provider.id}_oauth_error`, {
        provider: provider.id,
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
        data-testid={provider.testId}
        className={provider.buttonClassName}
      >
        {provider.logo}
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

/** Google's own provider config — the ONE live provider today. */
const GOOGLE_PROVIDER: OAuthProviderConfig = {
  id: "google",
  logo: <GoogleLogo />,
  testId: "google-signin",
  // The button surface is ALWAYS the Google-white card (`bg-white`), so
  // its label must use a FIXED dark ink — never `text-ink-900`, which
  // inverts to near-white under `[data-theme="light"]` and makes the
  // label invisible (white-on-white). `#1f1f1f` is Google's own button
  // text colour and is theme-independent, matching the fixed `bg-white`.
  buttonClassName:
    "flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60",
  markPending: () => markSignupPending("google"),
  logStartFailure: (e) =>
    console.error("[auth] signInWithOAuth(google) failed:", {
      name: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message : String(e),
    }),
};

/** "Continue with Google" — the same-tab redirect flow above with Google's
 *  provider config. The public API is unchanged so login-form / signup-form
 *  need no edits when further providers arrive beside it. */
export function GoogleButton(props: OAuthButtonProps) {
  return <OAuthProviderButton provider={GOOGLE_PROVIDER} {...props} />;
}

/**
 * LinkedIn (OIDC) provider config — the `linkedin_oidc` Supabase provider,
 * NOT the deprecated `linkedin` one. Rendered ONLY when the auth server
 * reports the provider enabled (lib/auth/enabled-providers.ts, the §18
 * honesty gate) — the flag is threaded from the auth page server components.
 *
 * ACCOUNT-SAFETY NOTE (no code needed, recorded for reviewers): Supabase
 * links a social identity to an existing account by VERIFIED email only —
 * manual identity linking stays disabled — so a LinkedIn sign-in with the
 * same verified email lands in the same account, and an unverifiable email
 * yields a refusal, never a silent account takeover. The provider-agnostic
 * callback keeps its GENERIC error copy — no provider-specific "account
 * exists" message is ever added, so the error path stays useless as an
 * account-existence oracle.
 */
const LINKEDIN_PROVIDER: OAuthProviderConfig = {
  id: "linkedin_oidc",
  logo: <LinkedInLogo />,
  testId: "linkedin-signin",
  // LinkedIn brand button: the fixed #0A66C2 surface with white label —
  // brand-fixed like the Google white card, hence config, not a caller prop,
  // and theme-independent by design.
  buttonClassName:
    "flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-[#0A66C2] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:bg-[#0A66C2]/90 disabled:cursor-not-allowed disabled:opacity-60",
  markPending: () => markSignupPending("linkedin_oidc"),
  logStartFailure: (e) =>
    console.error("[auth] signInWithOAuth(linkedin_oidc) failed:", {
      name: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message : String(e),
    }),
};

/**
 * Facebook provider config. Rendered ONLY behind the same enabled-providers
 * honesty gate as LinkedIn above.
 *
 * ACCOUNT-SAFETY NOTE (recorded for reviewers): Facebook can return accounts
 * WITHOUT a verified email (phone-only signups, unconfirmed addresses).
 * GoTrue then refuses the silently-unsafe email link and treats the identity
 * separately — that refusal is correct behaviour, not a bug to "fix" by
 * enabling manual linking.
 */
const FACEBOOK_PROVIDER: OAuthProviderConfig = {
  id: "facebook",
  logo: <FacebookLogo />,
  testId: "facebook-signin",
  // Facebook brand button: the fixed #1877F2 surface with white label —
  // brand-fixed and theme-independent, same rationale as above.
  buttonClassName:
    "flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-[#1877F2] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:bg-[#1877F2]/90 disabled:cursor-not-allowed disabled:opacity-60",
  markPending: () => markSignupPending("facebook"),
  logStartFailure: (e) =>
    console.error("[auth] signInWithOAuth(facebook) failed:", {
      name: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message : String(e),
    }),
};

/** "Continue with LinkedIn" — the SAME same-tab flow, LinkedIn OIDC config.
 *  Callers render this ONLY behind the enabled-providers flag. */
export function LinkedInButton(props: OAuthButtonProps) {
  return <OAuthProviderButton provider={LINKEDIN_PROVIDER} {...props} />;
}

/** "Continue with Facebook" — the SAME same-tab flow, Facebook config.
 *  Callers render this ONLY behind the enabled-providers flag. */
export function FacebookButton(props: OAuthButtonProps) {
  return <OAuthProviderButton provider={FACEBOOK_PROVIDER} {...props} />;
}
