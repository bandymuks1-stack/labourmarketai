import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

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
      {/* No "Empty state" badge: that is an engineering label, not something a
          person should read on their first visit. */}
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
      </header>
      <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
      <p className="text-meta leading-relaxed text-text-muted">
        {t("footnote")}
      </p>
      {/* The card used to describe the invite without offering it — a dead
          end on the first visit (2026-09-19). Same canonical invitation
          door the people page links to. */}
      <Link
        href="/dashboard/network?type=join_as_employee"
        className="inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
        data-testid={`team-roster-empty-${variant}-cta`}
      >
        {t("cta")} →
      </Link>
    </section>
  );
}
