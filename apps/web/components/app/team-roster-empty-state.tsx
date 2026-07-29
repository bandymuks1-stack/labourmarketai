import { getTranslations } from "next-intl/server";

/**
 * Sports-team roster empty-state card (Priority 6 of the next-layer v2
 * sprint). Used by company dashboard as "Komandos branduolys" and by
 * agency dashboard as "Kandidatų rezervas".
 *
 * Doctrine: NO fake members, NO fake stats, NO gamification. The card
 * shows only the empty state + the future model in honest copy, so the
 * vocabulary lands without pretending the roster exists yet.
 *
 * Server component. Pure render. No telemetry, no fetch.
 */
export async function TeamRosterEmptyState({
  variant,
}: {
  variant: "company" | "agency";
}) {
  const t = await getTranslations(`teamRosterEmpty.${variant}`);
  return (
    <section
      className="card-border flex flex-col gap-2 p-4"
      data-testid={`team-roster-empty-${variant}`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("scope")}
        </span>
      </header>
      <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
      <p className="text-meta leading-relaxed text-text-muted">
        {t("footnote")}
      </p>
    </section>
  );
}
