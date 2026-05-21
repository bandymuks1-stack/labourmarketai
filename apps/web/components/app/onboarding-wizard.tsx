"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

/** Role cards. Internal identifiers stay worker/company/agency/customer
 *  (the DB + dashboard contract); the LT/EN labels render Įmonė/Užsakovas
 *  etc. via i18n. Emoji per the onboarding card spec. */
const ROLE_CARDS: { key: Role; icon: string }[] = [
  { key: "worker", icon: "🔨" },
  { key: "company", icon: "🏢" },
  { key: "agency", icon: "🤝" },
  { key: "customer", icon: "🛒" },
];

// The 9 launch markets, LT first (default).
const COUNTRIES = ["LT", "LV", "EE", "NL", "DE", "DK", "NO", "SE", "PL"] as const;

/** Unified onboarding for ALL auth methods. Two steps:
 *  1) role picker, 2) basic profile (display name + country). On submit it
 *  calls the existing `completeOnboarding` RPC action (sets active_role,
 *  upserts profile_roles, creates the role's entity row) and redirects to
 *  /dashboard. The auto-Worker trigger (migration 0009) guarantees a workers
 *  row regardless of role. */
export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const t = useTranslations("auth.onboarding");
  const locale = useLocale();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState(defaultName);
  const [country, setCountry] = useState<string>("LT");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!role) return;
    setError(null);
    if (!displayName.trim()) {
      setError(t("error_name_required"));
      return;
    }
    const form = new FormData();
    form.set("role", role);
    form.set("locale", locale);
    form.set("display_name", displayName.trim());
    form.set("country", country);
    // company/agency entity rows take their name from role_data.name; seed a
    // draft name from the display name (DI can rename later in dashboard).
    if (role === "company" || role === "agency") {
      form.set("name", `${displayName.trim()} UAB`);
    }
    start(async () => {
      try {
        await completeOnboarding(form);
      } catch (e) {
        // Re-throw Next.js redirect signal (server action navigation).
        if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) throw e;
        console.error("[onboarding] completeOnboarding failed:", e);
        setError(t("error_generic"));
      }
    });
  }

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  if (step === 1) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("rolePicker.heading")}
          </h1>
        </header>

        <div className="grid grid-cols-2 gap-3">
          {ROLE_CARDS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              aria-pressed={role === r.key}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-md border bg-ink-800 p-4 text-left transition-colors",
                role === r.key
                  ? "border-brand-orange ring-1 ring-brand-orange"
                  : "border-ink-500 hover:border-text-muted",
              )}
            >
              <span aria-hidden className="text-2xl">
                {r.icon}
              </span>
              <span className="font-display text-sm font-semibold text-text-primary">
                {t(`rolePicker.${r.key}.title`)}
              </span>
              <span className="text-xs leading-relaxed text-text-muted">
                {t(`rolePicker.${r.key}.desc`)}
              </span>
            </button>
          ))}
        </div>

        <p className="rounded-md border border-ink-500 bg-ink-700/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
          {t("rolePicker.infoBox")}
        </p>

        <Button
          type="button"
          disabled={!role}
          onClick={() => setStep(2)}
          className="self-start"
        >
          {t("rolePicker.continue")}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("step2.heading")}
        </h1>
      </header>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("display_name_label")}
        <input
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("country_label")}
        <select
          name="country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          required
          className={inputCls}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("step2.continue")}
        </Button>
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={pending}
          className="text-xs text-text-muted hover:text-text-secondary disabled:opacity-60"
        >
          {t("back")}
        </button>
      </div>
    </form>
  );
}
