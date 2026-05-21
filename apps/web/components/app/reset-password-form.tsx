"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";

const MIN_PASSWORD = 8;

/** Reset-password screen reached from the recovery email link. The link
 *  carries a PKCE `?code=` which we exchange for a (recovery) session, then
 *  let the user set a new password via `updateUser`. On success → login.
 *
 *  Note: PKCE requires the link be opened in the same browser that requested
 *  the reset (the code verifier lives there). If no session can be
 *  established we show an "invalid/expired link" state. */
export function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tErr = useTranslations("auth.errors");
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        // May fail if the client auto-detected and already exchanged it —
        // that's fine, getSession below is the source of truth.
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      setReady(session ? "ok" : "invalid");
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(t("error_password_short", { min: MIN_PASSWORD }));
      return;
    }
    if (password !== confirm) {
      setError(t("error_password_mismatch"));
      return;
    }
    setStatus("saving");
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      router.replace("/auth/login?reset=1");
    } catch (e) {
      console.error("[reset-password] updateUser failed:", e);
      setStatus("idle");
      const info = mapAuthError(e);
      setError(info.key === "generic" ? t("error_generic") : tErr(info.key, info.params));
    }
  }

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  if (ready === "checking") {
    return (
      <p className="text-sm text-text-secondary" role="status">
        {t("checking")}
      </p>
    );
  }

  if (ready === "invalid") {
    return (
      <div className="card-border p-8">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("invalid_title")}
        </h2>
        <p className="mt-3 text-sm text-text-secondary">{t("invalid_body")}</p>
        <Link
          href="/auth/forgot-password"
          className="mt-4 inline-block text-sm text-brand-blue hover:text-brand-cyan"
        >
          {t("request_new")}
        </Link>
      </div>
    );
  }

  const disabled = status === "saving";

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

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={disabled}>
        {disabled ? t("saving") : t("submit_label")}
      </Button>
    </form>
  );
}
