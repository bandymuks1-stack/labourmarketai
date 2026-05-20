"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Role = "worker" | "company" | "agency" | "customer";
const ROLES: { key: Role; icon: string }[] = [
  { key: "worker", icon: "🔨" },
  { key: "company", icon: "🏗️" },
  { key: "agency", icon: "🤝" },
  { key: "customer", icon: "🛒" },
];

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Signup form (magic link). Posts via supabase.auth.signInWithOtp; the
 *  selected role + locale ride along in user_metadata so the
 *  handle_new_user() trigger creates the matching profile_roles row. */
export function SignupForm() {
  const t = useTranslations("auth.signup");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(t("error_email"));
      return;
    }
    if (!role) {
      setError(t("error_role"));
      return;
    }
    setStatus("sending");
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/${locale}/auth/callback`,
          data: { role, locale },
        },
      });
      if (err) throw err;
      setStatus("sent");
    } catch {
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
          placeholder={t("email_placeholder")}
          className={inputCls}
        />
      </label>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-xs text-text-secondary">
          {t("rolePickerLabel")}
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              aria-pressed={role === r.key}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-md border bg-ink-800 p-3 text-left transition-colors",
                role === r.key
                  ? "border-brand-blue ring-1 ring-brand-blue"
                  : "border-ink-500 hover:border-text-muted",
              )}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-lg">
                  {r.icon}
                </span>
                <span className="font-display text-sm font-semibold text-text-primary">
                  {t(`role.${r.key}`)}
                </span>
              </span>
              <span className="text-xs leading-relaxed text-text-muted">
                {t(`roleDescription.${r.key}`)}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

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
          {disabled ? t("sending") : t("submit_label")}
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
