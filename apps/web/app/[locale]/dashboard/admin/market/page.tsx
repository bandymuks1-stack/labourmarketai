import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import {
  getMarketAnalysis,
  UNKNOWN_BUCKET,
} from "@/lib/admin/market-analysis";
import { getLeague } from "@/lib/admin/league";
import {
  MarketAverageForm,
  type MarketAverageFormLabels,
} from "@/components/app/market-average-form";
import { MarketPulseBoard } from "@/components/app/market-pulse-board";

/**
 * "Kokia situacija rinkoje" — admin market analysis v1 (S4 item 4).
 *
 * ONLY real counts under admin RLS: supply (workers × profession × country),
 * demand (customer_requests × country × free-text role), the admin-entered
 * market averages, and country-level gaps. Honesty rules pinned by the S4
 * guard: small samples (n<5) carry a visible warning; the demand side has NO
 * profession FK today and the view says so; averages degrade to a
 * needs-migration note until the S4 draft is applied. No estimates, no
 * invented numbers, no silent zeros.
 *
 * UI: S8 living-arena skin — the MarketPulseBoard renders the same real
 * aggregates visually (pure CSS bars proportional to row counts, thermometer
 * chips only where the owner-locked formula has both components); the
 * detailed tables below stay the audit surface.
 */

export default async function AdminMarketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("admin.market");
  const tProf = await getTranslations("professions");
  const [analysis, league] = await Promise.all([
    getMarketAnalysis(),
    getLeague(),
  ]);

  const professionLabel = (slug: string): string => {
    try {
      return tProf(slug);
    } catch {
      return slug;
    }
  };
  const countryLabel = (c: string): string =>
    c === UNKNOWN_BUCKET ? t("unknownCountry") : c;

  const formLabels: MarketAverageFormLabels = {
    professionLabel: t("form.profession"),
    countryLabel: t("form.country"),
    rateLabel: t("form.rate"),
    sourceNoteLabel: t("form.sourceNote"),
    sourceNotePlaceholder: t("form.sourceNotePlaceholder"),
    sourceStatusLabel: t("form.sourceStatus"),
    sourceStatus: {
      needs_source: t("sourceStatus.needs_source"),
      sourced: t("sourceStatus.sourced"),
      reviewed: t("sourceStatus.reviewed"),
    },
    save: t("form.save"),
    saving: t("form.saving"),
    saved: t("form.saved"),
    needsMigration: t("needsMigration"),
    errorMsg: t("form.error"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="admin-market">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        <p
          className="mt-1 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-text-secondary"
          data-testid="admin-market-method-note"
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

      {/* ── S8: the living market pulse — the SAME real aggregates, visual ── */}
      <MarketPulseBoard
        analysis={analysis}
        league={league}
        professionLabel={professionLabel}
        countryLabel={countryLabel}
      />

      {/* ── Admin market averages (thermometer component 2) ──────────────── */}
      <section className="flex flex-col gap-3" data-testid="admin-market-averages">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("averages.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("averages.help")}</p>
        {analysis.averages.kind === "needs-migration" ? (
          <p
            className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
            data-testid="admin-market-migration-blocker"
          >
            {t("needsMigration")}
          </p>
        ) : (
          <>
            <MarketAverageForm
              professions={analysis.professions.map((p) => ({
                ...p,
                name: professionLabel(p.slug),
              }))}
              labels={formLabels}
            />
            {analysis.averages.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted">
                {t("averages.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {analysis.averages.rows.map((r) => (
                  <li
                    key={r.id}
                    className="card-border flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <span className="text-sm text-text-primary">
                      {professionLabel(r.professionSlug)} · {r.country}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-display text-base font-bold text-text-primary">
                        {r.avgRateEur} € / {t(`basis.${r.basis}` as never)}
                      </span>
                      <span
                        className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${
                          r.sourceStatus === "needs_source"
                            ? "border-state-warning/60 text-state-warning"
                            : "border-state-success/40 text-state-success"
                        }`}
                      >
                        {t(`sourceStatus.${r.sourceStatus}` as never)}
                      </span>
                      {r.sourceNote ? (
                        <span className="text-text-muted">{r.sourceNote}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── Supply ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3" data-testid="admin-market-supply">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("supply.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("supply.help")}</p>
        {analysis.supply.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted">
            {t("supply.empty")}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-500 text-left font-mono text-meta uppercase tracking-label text-text-muted">
                <th className="py-1.5 pr-3">{t("supply.profession")}</th>
                <th className="py-1.5 pr-3">{t("supply.country")}</th>
                <th className="py-1.5 pr-3">{t("supply.workers")}</th>
                <th className="py-1.5">{t("supply.confirmed")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.supply.map((s) => (
                <tr
                  key={`${s.professionSlug}-${s.country}`}
                  className="border-b border-ink-700 text-text-secondary"
                >
                  <td className="py-1.5 pr-3 text-text-primary">
                    {professionLabel(s.professionSlug)}
                  </td>
                  <td className="py-1.5 pr-3">{countryLabel(s.country)}</td>
                  <td className="py-1.5 pr-3">
                    {s.workers}
                    {s.smallSample ? (
                      <span
                        className="ml-1.5 text-meta text-state-warning"
                        data-testid="market-small-sample"
                      >
                        {t("smallSample")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5">{s.confirmedSkillWorkers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Demand ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3" data-testid="admin-market-demand">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("demand.title")}
        </h2>
        {/* Honest structural note: the intake's role is FREE TEXT (no
            profession FK), so demand never joins supply on profession. */}
        <p className="text-xs text-text-secondary" data-testid="admin-market-demand-note">
          {t("demand.freeTextNote")}
        </p>
        {analysis.demand.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted">
            {t("demand.empty")}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-500 text-left font-mono text-meta uppercase tracking-label text-text-muted">
                <th className="py-1.5 pr-3">{t("demand.country")}</th>
                <th className="py-1.5 pr-3">{t("demand.role")}</th>
                <th className="py-1.5">{t("demand.requests")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.demand.map((d) => (
                <tr
                  key={`${d.country}-${d.roleText}`}
                  className="border-b border-ink-700 text-text-secondary"
                >
                  <td className="py-1.5 pr-3">{countryLabel(d.country)}</td>
                  <td className="py-1.5 pr-3 text-text-primary">{d.roleText}</td>
                  <td className="py-1.5">
                    {d.requests}
                    {d.smallSample ? (
                      <span className="ml-1.5 text-meta text-state-warning">
                        {t("smallSample")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Gaps (country level — the only honest join) ──────────────────── */}
      <section className="flex flex-col gap-3" data-testid="admin-market-gaps">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("gaps.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("gaps.help")}</p>
        {analysis.countryGaps.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted">
            {t("gaps.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {analysis.countryGaps.map((g) => (
              <li
                key={g.country}
                className={`card-border flex flex-wrap items-center justify-between gap-2 p-3 ${
                  g.supplyWorkers === 0 ? "border-state-warning/50" : ""
                }`}
                data-testid={`market-gap-${g.country}`}
              >
                <span className="text-sm font-semibold text-text-primary">
                  {countryLabel(g.country)}
                </span>
                <span className="text-xs text-text-secondary">
                  {t("gaps.row", {
                    demand: g.demandRequests,
                    supply: g.supplyWorkers,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
