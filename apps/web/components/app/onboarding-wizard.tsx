"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

/** Role cards — the START is intentionally simple (owner directive,
 *  company-role-simplicity-v1): a person either WORKS THEMSELVES or
 *  REPRESENTS A COMPANY. An agency is NOT a root role — it is a company
 *  type ('staffing_agency') picked inside the company profile; the same
 *  goes for a client / requester organisation ('client_customer').
 *  Internal identifiers stay within the DB Role contract. */
const ROLE_CARDS: { key: Role; icon: string }[] = [
  { key: "worker", icon: "🔨" },
  { key: "company", icon: "🏢" },
];

// The 9 launch markets, LT first (default).
const COUNTRIES = ["LT", "LV", "EE", "NL", "DE", "DK", "NO", "SE", "PL"] as const;

/** Person-first onboarding. Two steps: (1) pick one OR MORE roles (the same
 *  person can be a worker, run an agency, and buy services), (2) basic profile
 *  (display name + country). Submits the full role set via completeOnboarding;
 *  the first selected (canonical order) becomes the active workspace. */
export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const t = useTranslations("auth.onboarding");
  const locale = useLocale();
  const [step, setStep] = useState<1 | 2>(1);
  const [roles, setRoles] = useState<Set<Role>>(() => new Set());
  const [displayName, setDisplayName] = useState(defaultName);
  const [country, setCountry] = useState<string>("LT");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleRole(r: Role) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  function submit() {
    if (roles.size === 0) return;
    setError(null);
    if (!displayName.trim()) {
      setError(t("error_name_required"));
      return;
    }
    const form = new FormData();
    // canonical order keeps the chosen primary deterministic server-side
    form.set(
      "roles",
      ROLE_CARDS.map((c) => c.key).filter((k) => roles.has(k)).join(","),
    );
    form.set("locale", locale);
    form.set("display_name", displayName.trim());
    form.set("country", country);
    start(async () => {
      try {
        await completeOnboarding(form);
      } catch (e) {
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
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("rolePicker.heading")}
          </h1>
          {/*
           * Premium-impression cleanup v1: the multi-role promise was
           * previously a quiet `text-sm text-text-secondary` line under
           * the heading. Doctrine §5.5 says no person fits in one
           * category — each person carries a portfolio of engagements.
           * The promise must be visible BEFORE the user picks, so it is
           * now a bordered callout that the eye reads with the cards,
           * not before them. Copy unchanged — same i18n key, same text.
           */}
          <p
            className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm leading-relaxed text-text-secondary"
            data-testid="onboarding-role-multi-note"
          >
            {t("rolePicker.multiNote")}
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLE_CARDS.map((r) => {
            const selected = roles.has(r.key);
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => toggleRole(r.key)}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border bg-ink-800 p-4 text-left transition-colors",
                    selected
                      ? "border-brand-orange ring-1 ring-brand-orange"
                      : "border-ink-500 hover:border-text-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border text-[11px]",
                      selected
                        ? "border-brand-orange bg-brand-orange text-ink-900"
                        : "border-ink-500 text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="text-xl">
                        {r.icon}
                      </span>
                      <span className="font-display text-sm font-semibold text-text-primary">
                        {t(`rolePicker.${r.key}.title`)}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">
                      {t(`rolePicker.${r.key}.desc`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="rounded-md border border-ink-500 bg-ink-700/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
          {t("rolePicker.infoBox")}
        </p>

        <Button
          type="button"
          disabled={roles.size === 0}
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
