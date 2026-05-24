"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";

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
 * Shared "Continue with Google" button used on both /auth/login and
 * /auth/signup. Calls `signInWithOAuth` and reuses the existing PKCE callback
 * at /[locale]/auth/callback, which exchanges the code and routes to
 * /dashboard (or /onboarding for users who haven't onboarded). The SDK
 * redirects the browser to Google on success, so we only surface failures.
 */
export function GoogleButton({
  label,
  redirectingLabel,
  errorLabel,
  disabled,
  nextPath,
}: {
  label: string;
  redirectingLabel: string;
  errorLabel: string;
  disabled?: boolean;
  /** Already-sanitised internal path (see `getSafeReturnPath`). When set,
   *  the OAuth callback is told to route the user here on success. */
  nextPath?: string;
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
      // code_verifier cookie. Production logs showed a token_revoked
      // event on a prior refresh_token at the exact second a new
      // /authorize started, with no follow-up /token POST — classic
      // PKCE race where the new verifier collides with a half-revoked
      // session cookie. `scope: 'local'` ONLY clears this browser's
      // tokens/cookies — it does NOT call Supabase /logout and never
      // revokes the user's other sessions. Safe to ignore failures.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // signOut may throw if no local session — irrelevant for the
        // fresh-OAuth-start path. Continue to signInWithOAuth.
      }
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      // Forward the sanitised return path through Supabase → callback as
      // a query param. The callback at `/[locale]/auth/callback`
      // re-validates before honouring it.
      const callback = new URL(`${origin}/${locale}/auth/callback`);
      if (nextPath) callback.searchParams.set("next", nextPath);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
      if (error) throw error;
      // Success: browser navigates to Google; keep the loading state.
    } catch (e) {
      console.error("[auth] signInWithOAuth(google) failed:", e);
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
        className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:bg-white/90 disabled:opacity-60"
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
