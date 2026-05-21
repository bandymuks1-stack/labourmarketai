"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/app/google-button";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Login form. Google OAuth (shared button) + email/password
 *  (`signInWithPassword`). Magic link was removed in the M1 auth refactor.
 *  On success the session is set and we route to /dashboard — middleware
 *  bounces not-yet-onboarded users on to /onboarding. */
export function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(t("error_email"));
      return;
    }
    if (!password) {
      setError(t("error_password_required"));
      return;
    }
    setStatus("signing");
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      router.replace("/dashboard");
    } catch (e) {
      console.error("[login] signInWithPassword failed:", e);
      setStatus("error");
      setError(t("error_invalid_credentials"));
    }
  }

  const disabled = status === "signing";
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

      <GoogleButton
        label={t("google_label")}
        redirectingLabel={t("google_redirecting")}
        errorLabel={t("error_generic")}
        disabled={disabled}
      />

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
          {disabled ? t("signing") : t("submit_label")}
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
