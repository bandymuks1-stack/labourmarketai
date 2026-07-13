"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

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

const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk\s+[\w-]+\s+failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

function isChunkError(error: (Error & { digest?: string }) | undefined): boolean {
  if (!error) return false;
  return error.name === "ChunkLoadError" || CHUNK_ERROR.test(error.message ?? "");
}

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
  const chunk = isChunkError(error);

  useEffect(() => {
    if (chunk && typeof window !== "undefined") {
      // Reload at most once per tab-session so a genuinely broken chunk can't
      // loop forever — after that the retry UI shows instead.
      const KEY = "lm-chunk-reload";
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, "1");
        window.location.reload();
        return;
      }
    }
    // Do not hide unknown errors — log them so they remain diagnosable.
    console.error("[error-boundary]", error);
  }, [chunk, error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p
        className="max-w-sm text-sm leading-relaxed text-text-secondary"
        role="alert"
        data-testid="error-boundary-message"
      >
        {chunk ? t("reloading") : t("body")}
      </p>
      {!chunk && (
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
