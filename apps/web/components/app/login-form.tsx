"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

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

/** Login form (magic link). Only email — the role + onboarding already
 *  exist for returning users; the callback decides where to land them. */
export function LoginForm() {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** OAuth (Google). Reuses the existing PKCE callback at /auth/callback,
   *  which exchanges the `?code=` and routes to dashboard (or onboarding for
   *  brand-new users). The SDK redirects the browser to Google on success, so
   *  we only need to surface failures. Independent of the magic-link flow. */
  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/${locale}/auth/callback` },
      });
      if (err) throw err;
      // Success: browser navigates to Google; keep the button in its loading
      // state until the redirect happens.
    } catch (e) {
      console.error("[login] signInWithOAuth(google) failed:", e);
      setGoogleLoading(false);
      setError(t("error_generic"));
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(t("error_email"));
      return;
    }
    setStatus("sending");
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${origin}/${locale}/auth/callback` },
      });
      if (err) throw err;
      setStatus("sent");
    } catch (e) {
      console.error("[login] signInWithOtp failed:", e);
      setStatus("error");
      setError(t("error_generic"));
    }
  }

  if (status === "sent") {
    return (
      <div className="card-border bg-card-glow p-8">
        <p className="font-mono text-[11px] uppercase tracking-label text-state-live">
          ✓
        </p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("success_title")}
        </h2>
        <p className="mt-3 text-sm text-text-secondary">
          {t("success_body", { email: email.trim() })}
        </p>
      </div>
    );
  }

  const disabled = status === "sending" || googleLoading;
  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("headline")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {t("subcopy")}
        </p>
      </header>

      <button
        type="button"
        onClick={onGoogle}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:bg-white/90 disabled:opacity-60"
      >
        <GoogleLogo />
        {googleLoading ? t("google_redirecting") : t("google_label")}
      </button>

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-ink-500" />
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
          className={inputCls}
        />
      </label>

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="submit" disabled={disabled}>
          {disabled ? t("sending") : t("submit_label")}
        </Button>
        <span className="text-xs text-text-muted">
          {t("no_account")}{" "}
          <Link
            href="/auth/signup"
            className="text-brand-blue hover:text-brand-cyan"
          >
            {t("signup_link")}
          </Link>
        </span>
      </div>
    </form>
  );
}
