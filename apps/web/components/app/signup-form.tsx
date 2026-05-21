"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/app/google-button";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

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
    if (password !== confirm) {
      setError(t("error_password_mismatch"));
      return;
    }
    setStatus("signing");
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Harmless when "Confirm email" is OFF; correct target if DI
          // re-enables verification later.
          emailRedirectTo: `${origin}/${locale}/auth/callback`,
          data: { locale },
        },
      });
      if (err) throw err;
      // Confirm email OFF → session is live. Land on the unified onboarding.
      router.replace("/onboarding");
    } catch (e) {
      console.error("[signup] signUp failed:", e);
      setStatus("error");
      setError(t("error_generic"));
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
          placeholder={t("email_placeholder")}
          className={inputCls}
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
          className={inputCls}
        />
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
          className={inputCls}
        />
      </label>

      <p className="rounded-md border border-state-warning/40 px-3 py-2 text-xs leading-relaxed text-state-warning">
        {t("disclaimer")}
      </p>

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
          {t("has_account")}{" "}
          <Link
            href="/auth/login"
            className="text-brand-blue hover:text-brand-cyan"
          >
            {t("login_link")}
          </Link>
        </span>
      </div>
    </form>
  );
}
