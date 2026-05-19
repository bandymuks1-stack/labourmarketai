"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type LeadIntent = "hire_workers" | "find_job" | "partner";
type Intent = LeadIntent;
type Status = "idle" | "sending" | "success" | "error";

/**
 * Lead capture (brief §10.4): the ONLY real DB write on public M0 pages.
 * Posts to /api/leads, which inserts into the `leads` table via the
 * service-role client. Degrades gracefully — if the endpoint is not
 * configured (no service key yet) the user sees a friendly error, never a
 * crash.
 */
export function LeadCapture({
  source = "landing_cta",
  tone = "primary",
  labelKey = "open",
  label,
  defaultIntent = "hire_workers",
  className,
}: {
  source?: string;
  tone?: "primary" | "secondary";
  labelKey?: "open" | "openAlt";
  label?: string;
  defaultIntent?: LeadIntent;
  className?: string;
}) {
  const t = useTranslations("leadForm");
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [intent, setIntent] = useState<Intent>(defaultIntent);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          full_name: form.get("name"),
          intent,
          source,
        }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
      };
      setStatus(res.ok && data.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  const intents: Intent[] = ["hire_workers", "find_job", "partner"];
  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  return (
    <div className={cn("inline-block", className)}>
      <Button
        type="button"
        variant={tone}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label ?? t(labelKey)}
      </Button>

      {open && (
        <div className="mt-3 w-[min(92vw,22rem)] card-border p-5 text-left">
          {status === "success" ? (
            <p className="text-sm text-state-live">{t("success")}</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div>
                <p className="font-display text-base font-semibold text-text-primary">
                  {t("title")}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {t("subtitle")}
                </p>
              </div>

              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                {t("name")}
                <input
                  name="name"
                  autoComplete="name"
                  className={inputCls}
                  id={`${fieldId}-name`}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                {t("email")}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputCls}
                  id={`${fieldId}-email`}
                />
              </label>

              <fieldset className="flex flex-col gap-1 text-xs text-text-secondary">
                <legend className="mb-1">{t("intentLabel")}</legend>
                <div className="flex flex-wrap gap-2">
                  {intents.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIntent(i)}
                      aria-pressed={intent === i}
                      className={cn(
                        "rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-label transition-colors",
                        intent === i
                          ? "border-brand-blue text-brand-blue"
                          : "border-ink-500 text-text-muted hover:text-text-secondary",
                      )}
                    >
                      {t(`intents.${i}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {status === "error" && (
                <p className="text-xs text-state-danger">{t("error")}</p>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={status === "sending"}>
                  {status === "sending" ? t("sending") : t("submit")}
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  {t("close")}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
