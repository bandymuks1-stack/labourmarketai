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
  type WorldMapZone,
} from "@/lib/work-market/world-map";

/**
 * Labour Market World Map — VISUAL v2 (PR #481).
 *
 * An original Labourmarket.ai labour-market WORLD, not a card grid and not a
 * street map: a central Profile Hub connected by glowing routes to its districts
 * (skills/evidence, availability, work needs, company, teams, trust, market
 * pulse). Real-data-driven from the owner's own signals (incl. accepted claims,
 * #480); empty zones stay honest. Desktop = map canvas + routes + side panel;
 * mobile = a vertical connected map path. No fake markers, no fake coordinates,
 * no scores, no external map. Routes are decorative (aria-hidden); every zone
 * carries an accessible text label.
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
const RING: Record<ZoneStatus, string> = {
  active: "border-brand-cyan/50",
  primary: "border-brand-blue/50",
  supported: "border-state-success/50",
  attention: "border-state-amber/45",
  concept: "border-ink-500",
};
const LEGEND_DOT: Record<(typeof WORLD_MAP_LEGEND)[number], string> = {
  active: "bg-brand-cyan",
  primary: "bg-brand-blue",
  supported: "bg-state-success",
  attention: "bg-state-amber",
  concept: "bg-ink-500",
  blocker: "bg-state-danger",
};

/** Radial layout — Profile Hub at centre, districts around it (canvas %). */
const POS: Record<ZoneKey, { x: number; y: number }> = {
  profileHub: { x: 50, y: 50 },
  availability: { x: 50, y: 14 },
  skillsEvidence: { x: 20, y: 30 },
  workNeeds: { x: 80, y: 30 },
  marketPulse: { x: 14, y: 64 },
  company: { x: 86, y: 64 },
  trust: { x: 31, y: 88 },
  teams: { x: 69, y: 88 },
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
  const byKey = Object.fromEntries(zones.map((z) => [z.key, z])) as Record<ZoneKey, WorldMapZone>;
  const realCount = zones.filter((z) => z.dataState === "real").length;

  const nodeLabel = (z: WorldMapZone) => t(`zone.${z.key}.name`);
  const nodeState = (z: WorldMapZone) =>
    t(`zone.${z.key}.state.${z.stateKey}`, { count: z.metric ?? 0 });

  return (
    <section className="card-border flex flex-col gap-5 p-5 sm:p-6" data-testid="labour-market-world-map">
      <header className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">{t("title")}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">{t("subtitle")}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr,300px]">
        <div>
          {/* ── Desktop: map canvas with glowing routes + positioned zones ── */}
          <div
            className="relative hidden aspect-[16/10] w-full overflow-hidden rounded-xl border border-ink-500 bg-ink-900/70 lg:block"
            data-testid="world-map-canvas"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(62,139,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(62,139,255,0.05) 1px, transparent 1px)",
              backgroundSize: "38px 38px",
            }}
          >
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" data-testid="world-map-routes">
              <defs>
                <linearGradient id="lmwm2-route" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.05" />
                  <stop offset="50%" stopColor="#2563EB" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              {zones
                .filter((z) => z.key !== "profileHub")
                .map((z) => (
                  <line
                    key={z.key}
                    x1={POS.profileHub.x}
                    y1={POS.profileHub.y}
                    x2={POS[z.key].x}
                    y2={POS[z.key].y}
                    stroke="url(#lmwm2-route)"
                    strokeWidth={z.dataState === "real" ? 0.5 : 0.3}
                    fill="none"
                  />
                ))}
            </svg>
            {zones.map((z) => {
              const Icon = ZONE_ICON[z.key];
              const center = z.key === "profileHub";
              return (
                <div
                  key={z.key}
                  data-testid={`world-zone-${z.key}`}
                  data-zone-status={z.status}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${z.dataState === "real" ? "" : "opacity-70"}`}
                  style={{ left: `${POS[z.key].x}%`, top: `${POS[z.key].y}%` }}
                >
                  <div
                    className={`flex w-[150px] flex-col gap-1 rounded-xl border bg-ink-800/85 px-3 py-2 backdrop-blur-sm ${RING[z.status]} ${center ? "shadow-cta-glow" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-brand-cyan" strokeWidth={1.75} aria-hidden />
                        <span className="font-display text-xs font-semibold text-text-primary">{nodeLabel(z)}</span>
                      </span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[z.status]}`} aria-hidden />
                    </span>
                    <span className="text-[10px] leading-snug text-text-muted" data-testid={`world-zone-${z.key}-state`}>
                      {nodeState(z)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Mobile: vertical connected map path ── */}
          <ol className="flex flex-col lg:hidden" data-testid="world-map-path">
            {zones.map((z, i) => {
              const Icon = ZONE_ICON[z.key];
              return (
                <li key={z.key} data-testid={`world-zone-m-${z.key}`} className="relative flex gap-3 pb-4">
                  {i < zones.length - 1 && (
                    <span className="absolute left-[11px] top-6 -bottom-0 w-px bg-ink-600" aria-hidden />
                  )}
                  <span className={`relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${RING[z.status]} bg-ink-800`}>
                    <span className={`h-2 w-2 rounded-full ${DOT[z.status]}`} aria-hidden />
                  </span>
                  <div className={`flex flex-1 flex-col gap-0.5 rounded-xl border border-ink-500 bg-ink-800/60 px-3 py-2 ${z.dataState === "real" ? "" : "opacity-70"}`}>
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-brand-cyan" strokeWidth={1.75} aria-hidden />
                      <span className="font-display text-sm font-semibold text-text-primary">{nodeLabel(z)}</span>
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">{nodeState(z)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Side panel: legend + summary */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-ink-500 bg-ink-800/40 p-4" data-testid="world-map-legend">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("legendTitle")}</p>
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
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("summaryTitle")}</p>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">{t("summaryBody")}</p>
            <p className="mt-2 text-xs font-medium text-text-primary" data-testid="world-map-real-count">
              {t("summaryCounts", { real: realCount, total: zones.length })}
            </p>
            <Link
              href="/dashboard/profile"
              data-testid="world-map-profile-cta"
              className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-blue transition-colors hover:text-brand-cyan"
            >
              {t("ctaProfile")} →
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}