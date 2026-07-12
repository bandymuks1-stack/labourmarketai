"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { RoleIcon } from "@/components/app/role-icon";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/** Role cards — the START is intentionally simple (owner directive,
 *  company-role-simplicity-v1): a person either WORKS THEMSELVES or
 *  REPRESENTS A COMPANY. An agency is NOT a root role — it is a company
 *  type ('staffing_agency') picked inside the company profile; the same
 *  goes for a client / requester organisation ('client_customer').
 *  Internal identifiers stay within the DB Role contract. */
const ROLE_CARDS: { key: Role }[] = [{ key: "worker" }, { key: "company" }];

// The 9 launch markets, LT first (default).
const COUNTRIES = ["LT", "LV", "EE", "NL", "DE", "DK", "NO", "SE", "PL"] as const;

/** Person-first onboarding. Two steps: (1) pick one OR MORE roles (the same
 *  person can be a worker, run an agency, and buy services), (2) basic profile
 *  (display name + country). Submits the full role set via completeOnboarding;
 *  the first selected (canonical order) becomes the active workspace. */
export function OnboardingWizard({
  defaultName,
  returnTo,
}: {
  defaultName: string;
  /** Safe internal path (e.g. an invite deep link) that onboarding
   *  completion returns to instead of the role dashboard. */
  returnTo?: string | null;
}) {
  const t = useTranslations("auth.onboarding");
  const locale = useLocale();
  const [step, setStep] = useState<1 | 2>(1);
  const [roles, setRoles] = useState<Set<Role>>(() => new Set());
  const [displayName, setDisplayName] = useState(defaultName);
  const [country, setCountry] = useState<string>("LT");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Activation funnel (P0-A): the wizard mounting = onboarding started.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackFunnel(FUNNEL_EVENTS.onboardingStarted);
  }, []);

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
    if (returnTo) form.set("next", returnTo);
    // Primary role = first selected in canonical order (mirrors the
    // server-side primary derivation). Coarse, non-identifying.
    const primaryRole = ROLE_CARDS.map((c) => c.key).find((k) =>
      roles.has(k),
    );
    start(async () => {
      try {
        await completeOnboarding(form);
        // Reached only if the runtime resolves the action instead of
        // throwing NEXT_REDIRECT — exactly one of these two success
        // paths runs, so the event never double-fires.
        trackFunnel(FUNNEL_EVENTS.onboardingCompleted, {
          role_context: primaryRole,
        });
      } catch (e) {
        // A successful onboarding ends in a server-side redirect
        // (NEXT_REDIRECT throws), so this branch — not code after the
        // await — is the reliable success signal. trackFunnel is
        // fire-and-forget, safe before the rethrow.
        if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) {
          trackFunnel(FUNNEL_EVENTS.onboardingCompleted, {
            role_context: primaryRole,
          });
          throw e;
        }
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
                      <RoleIcon role={r.key} className="h-5 w-5 text-text-secondary" />
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
          className="w-full rounded-xl sm:w-auto sm:self-start"
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

      {/* Landing→profile continuity (DESIGN.md): honestly preview the real
          profile the user builds next, so the first post-CTA screen does not
          feel weaker than the premium landing. Concept labels only — no fake
          data, nothing auto-verified. */}
      <div
        className="card-border flex flex-col gap-3 p-4"
        data-testid="onboarding-next-steps"
      >
        <p className="font-mono text-[11px] uppercase tracking-label text-brand-cyan">
          {t("nextSteps.eyebrow")}
        </p>
        <ul className="flex flex-col gap-2">
          {(["s1", "s2", "s3", "s4"] as const).map((k, i) => (
            <li
              key={k}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary"
            >
              <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-brand-blue/30 bg-brand-blue/10 font-mono text-[10px] font-semibold text-brand-blue">
                {i + 1}
              </span>
              {t(`nextSteps.${k}`)}
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-text-muted">
          {t("nextSteps.note")}
        </p>
      </div>

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl sm:w-auto"
        >
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
