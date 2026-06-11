import { getTranslations } from "next-intl/server";
import { BarChart3, Thermometer } from "lucide-react";

import {
  SMALL_SAMPLE_N,
  type MarketAnalysis,
} from "@/lib/admin/market-analysis";
import type { LeagueData } from "@/lib/admin/league";
import { cn } from "@/lib/utils";

/**
 * S8 — gyva rinkos vizualizacija (TASK 07 estetika) ant REALIŲ agregatų:
 * supply / demand bars are pure CSS widths proportional to the real counts
 * from getMarketAnalysis(); thermometer chips come from the league cells
 * (owner-locked formula — value ONLY when both components exist). No fake
 * liveliness: nothing pulses, nothing animates a number that did not come
 * from a row; small samples carry their warning; empty markets say so in
 * founder-moment tone (§18).
 */
export async function MarketPulseBoard({
  analysis,
  league,
  professionLabel,
  countryLabel,
}: {
  analysis: MarketAnalysis;
  league: LeagueData;
  professionLabel: (slug: string) => string;
  countryLabel: (c: string) => string;
}) {
  const t = await getTranslations("admin.market.pulse");

  const supplyTop = [...analysis.supply].slice(0, 8);
  const demandTop = [...analysis.demand].slice(0, 8);
  const supplyMax = Math.max(1, ...supplyTop.map((s) => s.workers));
  const demandMax = Math.max(1, ...demandTop.map((d) => d.requests));

  const thermoCells = [...league.countries.values()]
    .flat()
    .filter((c) => c.thermometer.kind === "score")
    .slice(0, 8);

  return (
    <section
      className="card-border rise-in flex flex-col gap-5 p-5 sm:p-6"
      data-testid="market-pulse-board"
    >
      <h2 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
        {t("title")}
      </h2>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Supply bars: real worker counts per profession × country ── */}
        <div className="flex flex-col gap-2" data-testid="pulse-supply">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("supplyTitle")}
          </h3>
          {supplyTop.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted">
              {t("supplyEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {supplyTop.map((s) => (
                <li
                  key={`${s.professionSlug}-${s.country}`}
                  className="flex flex-col gap-0.5"
                  data-testid="pulse-supply-row"
                >
                  <span className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate text-text-secondary">
                      {professionLabel(s.professionSlug)} ·{" "}
                      {countryLabel(s.country)}
                      {s.smallSample ? (
                        <span className="ml-1.5 font-mono text-[9px] uppercase tracking-label text-state-warning">
                          {t("smallSample", { n: SMALL_SAMPLE_N })}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono font-bold text-text-primary">
                      {s.workers}
                      {s.confirmedSkillWorkers > 0 ? (
                        <span className="ml-1 text-state-success">
                          ({s.confirmedSkillWorkers}✓)
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {/* width = real count / max — a fact made visible */}
                  <span className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <span
                      className="block h-full rounded-full bg-brand-cyan/70"
                      style={{ width: `${(s.workers / supplyMax) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Demand bars: real request counts (free-text role, said so) ── */}
        <div className="flex flex-col gap-2" data-testid="pulse-demand">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("demandTitle")}
          </h3>
          {demandTop.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted">
              {t("demandEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {demandTop.map((d) => (
                <li
                  key={`${d.country}-${d.roleText}`}
                  className="flex flex-col gap-0.5"
                  data-testid="pulse-demand-row"
                >
                  <span className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate text-text-secondary">
                      {d.roleText} · {countryLabel(d.country)}
                    </span>
                    <span className="font-mono font-bold text-text-primary">
                      {d.requests}
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <span
                      className="block h-full rounded-full bg-brand-orange/70"
                      style={{ width: `${(d.requests / demandMax) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Country gaps: demand vs supply, honest zero-supply warnings ── */}
      <div className="flex flex-col gap-2" data-testid="pulse-gaps">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t("gapsTitle")}
        </h3>
        {analysis.countryGaps.length === 0 ? (
          <p className="text-xs leading-relaxed text-text-muted">
            {t("gapsEmpty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {analysis.countryGaps.slice(0, 10).map((g) => (
              <li
                key={g.country}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[11px]",
                  g.supplyWorkers === 0
                    ? "border-state-warning/40 bg-state-warning/10 text-state-warning"
                    : "border-ink-600 bg-ink-800/40 text-text-secondary",
                )}
                data-testid="pulse-gap-chip"
              >
                {countryLabel(g.country)}: {t("gapLine", {
                  demand: g.demandRequests,
                  supply: g.supplyWorkers,
                })}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Thermometer chips — ONLY cells where both components exist ── */}
      <div className="flex flex-col gap-2" data-testid="pulse-thermo">
        <h3 className="inline-flex items-center gap-2 font-display text-sm font-semibold text-text-primary">
          <Thermometer className="h-4 w-4 text-brand-cyan" aria-hidden />
          {t("thermoTitle")}
        </h3>
        {thermoCells.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted">
            {t("thermoEmpty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {thermoCells.map((c) => (
              <li
                key={`${c.professionSlug}-${c.country}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-cyan/30 bg-brand-cyan/10 px-2.5 py-1 font-mono text-xs font-bold text-brand-cyan"
              >
                {professionLabel(c.professionSlug)} · {countryLabel(c.country)}{" "}
                ~{c.thermometer.kind === "score" ? c.thermometer.scoreEur : 0} €
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
