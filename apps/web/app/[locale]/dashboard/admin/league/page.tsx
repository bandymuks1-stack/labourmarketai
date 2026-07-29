import { setRequestLocale, getTranslations } from "next-intl/server";
import { Thermometer, Trophy, Users } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { getLeague, type LeagueCell } from "@/lib/admin/league";
import { UNKNOWN_BUCKET } from "@/lib/admin/market-analysis";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Šalies lyga (TASK 07.4 — living-arena market intelligence). League tables
 * per country: profession cells with REAL counts (team size, available now,
 * confirmed-skill holders) and the owner-locked thermometer value rendered
 * ONLY where an admin-entered market average exists AND the declared position
 * average has n >= 2 — everywhere else the honest "nepakanka rinkos duomenų"
 * state. No fake rating, no ranking of people (doctrine §7 +
 * PRODUCT_CONSTITUTION §10); rows order by raw team size.
 */
export default async function AdminLeaguePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("admin.league");
  const tProf = await getTranslations("professions");
  const league = await getLeague();

  const professionLabel = (slug: string): string =>
    tProf.has(slug) ? tProf(slug) : slug.replace(/-/g, " ");

  const countryOrder = [...league.countries.keys()].sort((a, b) => {
    if (a === UNKNOWN_BUCKET) return 1;
    if (b === UNKNOWN_BUCKET) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col gap-6" data-testid="admin-league">
      <header className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-brand-cyan">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
        {/* Honest method line: thermometer only where both components exist. */}
        <p
          className="mt-1 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          data-testid="league-method-note"
        >
          {t("methodNote")}
        </p>
        <Link
          href={"/dashboard/admin" as "/dashboard"}
          className="mt-1 self-start text-xs text-text-secondary hover:underline"
        >
          ← {t("back")}
        </Link>
      </header>

      {countryOrder.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="league-empty"
        >
          {t("empty")}
        </p>
      ) : (
        countryOrder.map((country) => {
          const cells = league.countries.get(country) ?? [];
          return (
            <section
              key={country}
              className="card-border rise-in flex flex-col gap-3 p-5"
              data-testid={`league-country-${country}`}
            >
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tightest text-text-primary">
                {country === UNKNOWN_BUCKET ? t("unknownCountry") : country}
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("cellCount", { n: cells.length })}
                </span>
              </h2>
              <ul className="flex flex-col gap-2">
                {cells.map((c) => (
                  <LeagueRow
                    key={`${c.professionSlug}-${c.country}`}
                    cell={c}
                    name={professionLabel(c.professionSlug)}
                    labels={{
                      available: t("availableNow"),
                      confirmed: t("confirmedSkillWorkers"),
                      insufficient: t("insufficientData"),
                      smallSample: t("smallSample"),
                      declaredN: t("declaredSample", { n: c.declaredSampleN }),
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function LeagueRow({
  cell,
  name,
  labels,
}: {
  cell: LeagueCell;
  name: string;
  labels: {
    available: string;
    confirmed: string;
    insufficient: string;
    smallSample: string;
    declaredN: string;
  };
}) {
  const score = cell.thermometer.kind === "score" ? cell.thermometer : null;
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2.5"
      data-testid="league-row"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-semibold text-text-primary">
          {name}
        </span>
        {cell.smallSample ? (
          <span className="font-mono text-meta uppercase tracking-label text-state-warning">
            {labels.smallSample}
          </span>
        ) : null}
      </span>
      <span className="inline-flex items-center gap-1.5 font-mono text-meta text-text-secondary">
        <Users className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
        {cell.workers}
      </span>
      <span className="inline-flex items-center gap-1.5 font-mono text-meta text-text-secondary">
        <span className="live-dot" aria-hidden />
        {cell.availableNow} {labels.available}
      </span>
      <span
        className={cn(
          "font-mono text-meta",
          cell.confirmedSkillWorkers > 0
            ? "text-state-success"
            : "text-text-muted",
        )}
      >
        {cell.confirmedSkillWorkers} {labels.confirmed}
      </span>
      {/* Thermometer — a number ONLY when both components really exist. */}
      {score ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-1 font-mono text-xs font-bold text-brand-cyan"
          data-testid="league-thermometer"
          title={labels.declaredN}
        >
          <Thermometer className="h-3.5 w-3.5" aria-hidden />
          ~{score.scoreEur} €
        </span>
      ) : (
        <span
          className="font-mono text-meta uppercase tracking-label text-text-muted"
          data-testid="league-thermometer-missing"
        >
          {labels.insufficient}
        </span>
      )}
    </li>
  );
}
