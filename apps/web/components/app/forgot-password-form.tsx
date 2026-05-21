"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Forgot-password request. Sends a Supabase recovery email whose link lands
 *  on /[locale]/auth/reset-password. We always show the same confirmation
 *  (even if the email isn't registered) so we don't leak account existence. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

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
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${origin}/${locale}/auth/reset-password` },
      );
      if (err) throw err;
      setStatus("sent");
    } catch (e) {
      console.error("[forgot-password] resetPasswordForEmail failed:", e);
      setStatus("idle");
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
        <Link
          href="/auth/login"
          className="mt-4 inline-block text-sm text-brand-blue hover:text-brand-cyan"
        >
          {t("back_to_login")}
        </Link>
      </div>
    );
  }

  const disabled = status === "sending";
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
        <Link
          href="/auth/login"
          className="text-xs text-text-muted hover:text-text-secondary"
        >
          {t("back_to_login")}
        </Link>
      </div>
    </form>
  );
}
