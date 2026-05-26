import { getTranslations } from "next-intl/server";

// SR-2 pilot honesty banner. Renders inside the dashboard shell so every
// authenticated route announces the pilot state honestly: no payment,
// hiring decision, or verification fires automatically; real activation
// requires owner/admin review. Server component — no client JS.
export async function PilotModeBanner() {
  const t = await getTranslations("pilotMode");
  return (
    <div
      role="note"
      aria-label={t("title")}
      data-testid="pilot-mode-banner"
      className="mx-auto mt-4 max-w-container px-6 sm:px-12"
    >
      <div className="flex flex-col gap-1 rounded-md border border-state-warning/30 bg-state-warning/5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-label text-state-warning">
          {t("title")}
        </span>
        <p className="text-xs leading-snug text-text-secondary">{t("body")}</p>
      </div>
    </div>
  );
}
