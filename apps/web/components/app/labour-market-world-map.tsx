import { getTranslations } from "next-intl/server";
import {
  IdCard,
  Award,
  CalendarClock,
  ClipboardList,
  UsersRound,
  Building2,
  Radar,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { getOwnAvailability, getOwnCapabilities } from "@/lib/market-map/owner-readiness";
import { getOwnMarketSignals } from "@/lib/market-map/signals";
import { getOwnDemandLocationSummary } from "@/lib/demand/demand-location";
import { getOwnAcceptedClaimCount } from "@/lib/signals/connected-skill-signal";
import {
  buildWorldMapZones,
  WORLD_MAP_LEGEND,
  type ZoneKey,
  type ZoneStatus,
} from "@/lib/work-market/world-map";

/**
 * Labour Market World Map v1 — a stylized, original labour-market atlas for the
 * logged-in owner. Eight product zones (profile, skills/evidence, availability,
 * work needs, teams, company, market pulse, trust) rendered as a connected
 * system map driven ONLY by the caller's real, RLS-scoped signals. Honest
 * empty/concept states when data is missing — no fake workers/companies/demand/
 * coordinates/markers/scores/percentages/verified badges, no external copying.
 */

const ZONE_ICON: Record<ZoneKey, typeof IdCard> = {
  profileHub: IdCard,
  skillsEvidence: Award,
  availability: CalendarClock,
  workNeeds: ClipboardList,
  teams: UsersRound,
  company: Building2,
  marketPulse: Radar,
  trust: ShieldCheck,
};

const DOT: Record<ZoneStatus, string> = {
  active: "bg-brand-cyan",
  primary: "bg-brand-blue",
  supported: "bg-state-success",
  attention: "bg-state-amber",
  concept: "bg-ink-500",
};

const LEGEND_DOT: Record<(typeof WORLD_MAP_LEGEND)[number], string> = {
  active: "bg-brand-cyan",
  primary: "bg-brand-blue",
  supported: "bg-state-success",
  attention: "bg-state-amber",
  concept: "bg-ink-500",
  blocker: "bg-state-danger",
};

export async function LabourMarketWorldMap() {
  const t = await getTranslations("worldMap");

  const [availability, capabilities, signals, demandSummary, claimCount] = await Promise.all([
    getOwnAvailability(),
    getOwnCapabilities(),
    getOwnMarketSignals(),
    getOwnDemandLocationSummary(),
    getOwnAcceptedClaimCount(),
  ]);
  const sig = signals ?? [];

  const zones = buildWorldMapZones({
    hasWorker: availability.hasWorker,
    hasProfileSignal: sig.some((s) => s.signalType === "profile_location"),
    skillCounts: {
      confirmed: capabilities.counts.confirmed,
      suggested: capabilities.counts.suggested,
      selfDeclared: capabilities.counts.self_declared + claimCount,
    },
    availabilityState: availability.state,
    preferredCount: availability.preferredCountries.length,
    demandTotal: demandSummary?.total ?? 0,
    hasCompanySignal: sig.some((s) => s.signalType === "company_location"),
    hasProjectSignal: sig.some((s) => s.signalType === "project_location"),
    signalCount: sig.length,
  });

  const realCount = zones.filter((z) => z.dataState === "real").length;

  return (
    <section
      className="card-border relative overflow-hidden p-5 sm:p-6"
      data-testid="labour-market-world-map"
    >
      {/* Decorative atlas grid + glowing routes (aria-hidden — all information
          is carried by the zone cards' text labels below). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(62,139,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(62,139,255,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      >
        <defs>
          <linearGradient id="lmwm-route" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
            <stop offset="50%" stopColor="#2563EB" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M4,22 Q50,4 96,28" stroke="url(#lmwm-route)" strokeWidth="0.4" fill="none" />
        <path d="M4,72 Q50,96 96,64" stroke="url(#lmwm-route)" strokeWidth="0.4" fill="none" />
        <path d="M8,50 L92,50" stroke="url(#lmwm-route)" strokeWidth="0.3" fill="none" />
      </svg>

      <div className="relative flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
            <span className="live-dot" aria-hidden />
            {t("eyebrow")}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
            {t("title")}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
            {t("subtitle")}
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr,300px]">
          {/* Zone atlas */}
          <ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            data-testid="world-map-zones"
          >
            {zones.map((z) => {
              const Icon = ZONE_ICON[z.key];
              return (
                <li key={z.key} data-testid={`world-zone-${z.key}`} data-zone-status={z.status}>
                  <div className="glow-hover flex h-full flex-col gap-2 rounded-xl border border-ink-500 bg-ink-800/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-brand-cyan" strokeWidth={1.75} aria-hidden />
                        <span className="font-display text-sm font-semibold text-text-primary">
                          {t(`zone.${z.key}.name`)}
                        </span>
                      </span>
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[z.status]}`}
                        aria-hidden
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-text-muted">
                      {t(`zone.${z.key}.hint`)}
                    </p>
                    <p
                      className="mt-auto text-xs font-medium text-text-secondary"
                      data-testid={`world-zone-${z.key}-state`}
                    >
                      {t(`zone.${z.key}.state.${z.stateKey}`, { count: z.metric ?? 0 })}
                    </p>
                    {z.dataState !== "real" && (
                      <span className="inline-flex w-fit items-center rounded-sm border border-border-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-muted">
                        {z.dataState === "concept" ? t("conceptTag") : t("emptyTag")}
                      </span>
                    )}
                    {z.ctaHref && (
                      <Link
                        href={z.ctaHref}
                        data-testid={`world-zone-${z.key}-cta`}
                        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-blue transition-colors hover:text-brand-cyan"
                      >
                        {z.ctaHref === "/dashboard/company" ? t("ctaCompany") : t("ctaProfile")}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Side summary: legend + what this atlas shows */}
          <aside className="flex flex-col gap-4">
            <section className="rounded-xl border border-ink-500 bg-ink-800/40 p-4" data-testid="world-map-legend">
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("legendTitle")}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {WORLD_MAP_LEGEND.map((role) => (
                  <li key={role} className="flex items-center gap-2 text-xs text-text-secondary">
                    <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT[role]}`} aria-hidden />
                    {t(`legend.${role}`)}
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-ink-500 bg-ink-800/40 p-4">
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("summaryTitle")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                {t("summaryBody")}
              </p>
              <p className="mt-2 text-xs font-medium text-text-primary" data-testid="world-map-real-count">
                {t("summaryCounts", { real: realCount, total: zones.length })}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}