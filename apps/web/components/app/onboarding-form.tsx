"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import {
  completeOnboarding,
  type Role,
} from "@/lib/auth/actions";

const COUNTRIES = ["LT", "LV", "EE", "PL", "NL", "DE", "DK", "SE", "NO"] as const;

const FIELDS: Record<Role, string[]> = {
  worker: ["profession", "language", "city"],
  company: ["name", "industry", "headcount"],
  agency: ["name", "regions", "focus"],
  customer: ["city"],
};

/** First-onboarding form. Common (display_name + country) plus a small
 *  role-specific set; everything posts to the `completeOnboarding` server
 *  action which writes profile_roles.role_data + profiles.onboarded_at. */
export function OnboardingForm({
  role,
  defaultName,
}: {
  role: Role;
  defaultName: string;
}) {
  const t = useTranslations("auth.onboarding");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(form: FormData) {
    setError(null);
    start(async () => {
      try {
        await completeOnboarding(form);
      } catch (e) {
        // Re-throw Next.js redirect signal (server action navigation)
        if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) {
          throw e;
        }
        console.error("[onboarding] completeOnboarding failed:", e);
        setError(t("error_generic"));
      }
    });
  }

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="locale" value={locale} />

      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("greeting", { name: defaultName })}
        </h1>
        <p className="mt-3 text-sm text-text-secondary">{t("subcopy")}</p>
      </header>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("display_name_label")}
        <input
          name="display_name"
          defaultValue={defaultName}
          required
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("country_label")}
        <select name="country" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            —
          </option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {FIELDS[role].map((f) => (
        <label
          key={f}
          className="flex flex-col gap-1.5 text-xs text-text-secondary"
        >
          {t(`fields.${role}.${f}`)}
          <input name={f} required className={inputCls} />
        </label>
      ))}

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("submit_label")}
      </Button>
    </form>
  );
}
