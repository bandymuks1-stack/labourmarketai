"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { SAVE_TIMEOUT_MS } from "@/lib/async/with-timeout";
import { cn } from "@/lib/utils";

type Status = "idle" | "sending" | "success" | "duplicate" | "error";

/**
 * Company / agency waitlist modal (PV §10 honesty). Triggered from the hero
 * "Įmonėms ir agentūroms · Sužinoti daugiau" link and posts to /api/waitlist.
 * The platform only ships worker functionality in M1; this modal is how we
 * tell non-worker visitors that and capture their interest.
 */
export function WaitlistModal({
  trigger,
  source = "landing_company_modal",
  triggerClassName,
}: {
  trigger: string;
  source?: string;
  triggerClassName?: string;
}) {
  const t = useTranslations("waitlist");
  const locale = useLocale();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  function close() {
    setOpen(false);
    // Reset to idle next time it opens.
    setTimeout(() => setStatus("idle"), 200);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          locale,
          source,
        }),
        // Bounded so a stalled mobile request can't leave the public signup
        // stuck on "sending" — on timeout it rejects into the error state below
        // and the user can retry.
        signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        duplicate?: boolean;
      };
      if (res.ok && data.ok) {
        setStatus(data.duplicate ? "duplicate" : "success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          // `inline-flex min-h-11` keeps the underlined-text affordance while
          // giving it a 44px tap height: on /pricing this trigger IS the
          // primary action of every plan card, and it measured 20-40px tall
          // across 320-1440px (2026-08-11). The underline still sits on the
          // baseline — only the hit area grows.
          "inline-flex min-h-11 items-center underline decoration-ink-500 underline-offset-4 transition-colors hover:text-text-primary hover:decoration-brand-blue",
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${fieldId}-title`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />
          <div
            ref={dialogRef}
            className="relative w-full max-w-md card-border bg-ink-800 p-6 text-left sm:p-7"
          >
            {status === "success" || status === "duplicate" ? (
              <div className="flex flex-col gap-3">
                <p
                  id={`${fieldId}-title`}
                  className="font-display text-lg font-semibold text-text-primary"
                >
                  {status === "duplicate"
                    ? t("duplicate_title")
                    : t("success_title")}
                </p>
                <p className="text-sm text-text-secondary">
                  {status === "duplicate" ? t("duplicate_body") : t("success_body")}
                </p>
                <div className="mt-2 flex justify-end">
                  <Button type="button" variant="secondary" onClick={close}>
                    {t("close")}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div>
                  <p
                    id={`${fieldId}-title`}
                    className="font-display text-lg font-semibold text-text-primary"
                  >
                    {t("title")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {t("body_intro")}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                    {t("body_detail")}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                    {t("body_cta")}
                  </p>
                </div>

                <label
                  htmlFor={`${fieldId}-email`}
                  className="flex flex-col gap-1 text-xs text-text-secondary"
                >
                  {t("email_label")}
                  <input
                    ref={emailRef}
                    id={`${fieldId}-email`}
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={t("email_placeholder")}
                    className={inputCls}
                  />
                </label>

                {status === "error" && (
                  <p role="alert" className="text-xs text-state-danger">
                    {t("error")}
                  </p>
                )}

                <div className="mt-1 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="text-xs text-text-muted hover:text-text-secondary"
                  >
                    {t("close")}
                  </button>
                  <Button type="submit" disabled={status === "sending"}>
                    {status === "sending" ? t("sending") : t("submit")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
