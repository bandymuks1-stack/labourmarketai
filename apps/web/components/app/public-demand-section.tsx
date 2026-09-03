import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import {
  readPublicVacancySupplyCounts,
  searchPublicVacancyPreviews,
} from "@/lib/vacancy-store/public-vacancy-preview";

/**
 * Real market demand, first session (FIRST REAL ECOSYSTEM USE, 2026-09-03).
 *
 * An in-page SECTION of the declared company workspace (like the learners
 * section), not a standalone persistent card: it opens no new surface and
 * owns no action — it reads the public pool and links to the declared board.
 *
 * An agency or an education institution must never meet an empty marketplace.
 * This card shows the REAL public vacancy pool — the same imported market data
 * the public job board serves (anon-safe RPCs, no privilege change): the live
 * count + distinct employers, and the newest previews for an optional
 * profession. Provenance is stated on the card: imported market data, one
 * source market today; those employers are not customers of the platform
 * (Agentai capability contract, VACANCY_PUBLISHING forbidden claims).
 *
 * Honest degradation: `not_provisioned` or a failed read renders the calm
 * "unavailable" line — never a zero that reads as "no demand".
 */
export async function PublicDemandSection({
  professionSlug = null,
  audience,
}: {
  readonly professionSlug?: string | null;
  readonly audience: "agency" | "institution";
}) {
  const t = await getTranslations("publicDemand");
  const tProf = await getTranslations("professions");
  const [counts, previews] = await Promise.all([
    readPublicVacancySupplyCounts().catch(() => null),
    searchPublicVacancyPreviews({ query: null, professionSlug, page: 1 }).catch(() => null),
  ]);
  const professionLabel = (slug: string | null) =>
    slug ? (tProf.has(slug as never) ? tProf(slug as never) : slug.replace(/-/g, " ")) : null;

  const ok = counts?.status === "ok" && previews?.status === "ok";

  return (
    <Card compact>
      <section className="flex flex-col gap-3" data-testid={`public-demand-${audience}`} aria-labelledby="public-demand-title">
        <header className="flex flex-col gap-1">
          <h2 id="public-demand-title" className="font-display text-base font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {audience === "agency" ? t("subtitleAgency") : t("subtitleInstitution")}
          </p>
        </header>

        {!ok ? (
          <p className="text-xs text-text-muted" data-testid="public-demand-unavailable">{t("unavailable")}</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2 text-xs" data-testid="public-demand-counts">
              <li className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2.5 py-1 text-text-primary">
                {t("active", { count: counts.activeVacancies })}
              </li>
              <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-secondary">
                {t("employers", { count: counts.distinctEmployers })}
              </li>
              {professionSlug ? (
                <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-secondary">
                  {t("filtered", { profession: professionLabel(professionSlug) ?? professionSlug, count: previews.totalCount })}
                </li>
              ) : null}
            </ul>
            {previews.vacancies.length === 0 ? (
              <p className="text-xs text-text-muted">{t("none")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-ink-600" data-testid="public-demand-list">
                {previews.vacancies.slice(0, 5).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                    <Link href={`/jobs/${v.id}`} className="min-w-0 truncate text-text-primary hover:underline">
                      {professionLabel(v.professionSlug) ?? v.occupation ?? "—"}
                      {v.positions && v.positions > 1 ? ` · ×${v.positions}` : ""}
                    </Link>
                    <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                      {v.employmentForm ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-meta leading-relaxed text-text-muted">{t("provenance")}</p>
            <Link href="/jobs" className="text-xs text-brand-blue hover:underline" data-testid="public-demand-open-board">
              {t("openBoard")} →
            </Link>
          </>
        )}
      </section>
    </Card>
  );
}
