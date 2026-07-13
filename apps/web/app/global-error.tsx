"use client";

/**
 * Root global error boundary (RC6, F6). Catches errors thrown ABOVE the
 * [locale] segment boundary (root/locale layout render errors), which
 * previously fell through to Next's dead "Application error" shell with no
 * recovery. Renders its own <html>, so copy is hardcoded and bilingual —
 * the intl provider may be part of what broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[global-error-boundary]", error);
  return (
    <html lang="lt">
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
          background: "#0B1014",
          color: "#E8EEF2",
          font: "15px/1.6 ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <p style={{ maxWidth: "26rem" }} data-testid="global-error-message">
          Įvyko klaida. Jūsų duomenys išsaugoti — bandykite dar kartą.
          <br />
          <span style={{ color: "#A9B4BD" }}>
            Something went wrong. Your data is safe — try again.
          </span>
        </p>
        <button
          type="button"
          onClick={() => reset()}
          data-testid="global-error-retry"
          style={{
            border: "1px solid #3B82F6",
            background: "transparent",
            color: "#E8EEF2",
            borderRadius: "8px",
            padding: "10px 20px",
            font: "600 14px/1 ui-sans-serif, system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          Bandyti dar kartą / Try again
        </button>
      </body>
    </html>
  );
}
