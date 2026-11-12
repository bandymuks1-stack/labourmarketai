"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { LmLogo } from "@/components/ui/lm-logo";
import { reloadOnceForChunkError } from "@/lib/telemetry/chunk-reload";
import { reportClientError } from "@/lib/telemetry/report-client-error";

/**
 * Root error boundary for all locale pages (P0: previously there was NONE, so
 * any client error showed Next's dead "Application error" screen with no
 * recovery — what a mobile user saw after a deploy).
 *
 * CONCRETE behaviour:
 *   - Stale-chunk / failed-dynamic-import errors (the cached HTML references
 *     chunk hashes a new deploy replaced) → reload ONCE to fetch the fresh
 *     manifest. This is the only auto-recovered, concrete case.
 *   - Every OTHER error is SURFACED (logged + a visible retry button), never
 *     silently hidden.
 */

/** Hardcoded last-resort labels — used ONLY if the intl context itself is
 *  broken (a boundary that crashes hands the user Next's dead error shell,
 *  which is exactly the F6 production failure mode). */
const FALLBACK = {
  reloading: "Atnaujinama… / Reloading…",
  body: "Įvyko klaida. Jūsų duomenys išsaugoti — bandykite dar kartą. / Something went wrong. Your data is safe — try again.",
  retry: "Bandyti dar kartą / Try again",
} as const;

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // RC6: the boundary must NEVER crash itself. The hook call stays
  // unconditional (hook rules); only a broken intl context is caught, in
  // which case bilingual hardcoded copy renders instead.
  const translate = useTranslations("errorBoundary");
  const t = (key: keyof typeof FALLBACK): string => {
    try {
      return translate(key);
    } catch {
      return FALLBACK[key];
    }
  };
  // True only while the one automatic reload is under way. A chunk error that
  // comes back after it shows the retry button, not an endless "reloading".
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    // One sanitised crash report (no identity, no query string; never throws,
    // and a beacon survives the reload below). 2026-10-18 incident.
    reportClientError("boundary", error);
    // Reload at most once (lib/telemetry/chunk-reload.ts) so a genuinely broken
    // chunk can't loop forever — after that the retry UI shows instead.
    if (reloadOnceForChunkError(error)) {
      setReloading(true);
      return;
    }
    // Do not hide unknown errors — log them so they remain diagnosable.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <LmLogo className="h-12 w-auto" />
      <p
        className="max-w-sm text-sm leading-relaxed text-text-secondary"
        role="alert"
        data-testid="error-boundary-message"
      >
        {reloading ? t("reloading") : t("body")}
      </p>
      {!reloading && (
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md border border-brand-blue px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-brand-blue/80"
          data-testid="error-boundary-retry"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
