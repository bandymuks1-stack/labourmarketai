"use client";

import { activeLocales, defaultLocale, type ActiveLocale } from "@/lib/i18n/config";

/**
 * Root global error boundary (RC6, F6). Catches errors thrown ABOVE the
 * [locale] segment boundary (root/locale layout render errors), which
 * previously fell through to Next's dead "Application error" shell with no
 * recovery. Renders its own <html>, so copy is hardcoded — the intl provider
 * may be part of what broke, and this boundary lives OUTSIDE it by design.
 *
 * 2026-09-20 locale-leak fix: the copy used to be a fixed LT/EN pair for every
 * visitor, so a Russian, Dutch or German user hitting a layout-level crash was
 * shown Lithuanian. The boundary still cannot use `useTranslations`, so the
 * words for the ACTIVE locales live in the static map below and the locale is
 * read from the first path segment. No provider, no new dependency, no async
 * catalog load — anything that can fail must not run inside an error shell.
 */

/** Per-locale words for exactly the ACTIVE locales (lib/i18n/config.ts
 *  `activeLocales` — lt, en, ru, nl, de, pl). `Record<ActiveLocale, …>` makes the
 *  set exhaustive at compile time: promoting a locale in lib/i18n/config.ts
 *  fails typecheck until a row is added here. PL added 2026-09-20 (#1810). */
const COPY: Record<ActiveLocale, { readonly body: string; readonly retry: string }> = {
  lt: {
    body: "Įvyko klaida. Jūsų duomenys išsaugoti — bandykite dar kartą.",
    retry: "Bandyti dar kartą",
  },
  en: {
    body: "Something went wrong. Your data is safe — try again.",
    retry: "Try again",
  },
  ru: {
    body: "Произошла ошибка. Ваши данные сохранены — попробуйте ещё раз.",
    retry: "Попробовать ещё раз",
  },
  nl: {
    body: "Er is iets misgegaan. Je gegevens zijn veilig — probeer het opnieuw.",
    retry: "Opnieuw proberen",
  },
  de: {
    body: "Ein Fehler ist aufgetreten. Ihre Daten sind sicher — bitte erneut versuchen.",
    retry: "Erneut versuchen",
  },
  pl: {
    body: "Coś poszło nie tak. Twoje dane są bezpieczne — spróbuj ponownie.",
    retry: "Spróbuj ponownie",
  },
};

/** English stays as the universal second line / second button word, exactly as
 *  before — a crashed shell should be readable by someone who does not read
 *  the URL's language either. */
const EN = COPY.en;

/** First path segment, when it is an active UI locale. Falls back to the
 *  previous behaviour (Lithuanian primary + English secondary) everywhere
 *  else, including on the server, where there is no pathname to read. */
function resolveLocale(): ActiveLocale {
  if (typeof window === "undefined") return defaultLocale;
  const segment = window.location.pathname.split("/")[1]?.toLowerCase() ?? "";
  return (activeLocales as readonly string[]).includes(segment)
    ? (segment as ActiveLocale)
    : defaultLocale;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[global-error-boundary]", error);
  // Read at render time so the common case — a purely client-side crash, where
  // this shell never touches the server — is correct on first paint. On the
  // SSR path the server has no pathname, so the markup is the unchanged LT/EN
  // pair and hydration corrects it; the mismatch is expected, not a defect.
  const locale = resolveLocale();
  const copy = COPY[locale];
  const showEnglishSecondLine = locale !== "en";
  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          background: "#000000",
          color: "#FFFFFF",
          font: "15px/1.6 ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <p
          style={{ maxWidth: "26rem" }}
          data-testid="global-error-message"
          suppressHydrationWarning
        >
          {copy.body}
          {showEnglishSecondLine && (
            <>
              <br />
              <span style={{ color: "#C9C9C9" }}>{EN.body}</span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          data-testid="global-error-retry"
          suppressHydrationWarning
          style={{
            border: "1px solid #D4AF37",
            background: "transparent",
            color: "#FFFFFF",
            borderRadius: "8px",
            padding: "10px 20px",
            font: "600 14px/1 ui-sans-serif, system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          {showEnglishSecondLine ? `${copy.retry} / ${EN.retry}` : EN.retry}
        </button>
      </body>
    </html>
  );
}
