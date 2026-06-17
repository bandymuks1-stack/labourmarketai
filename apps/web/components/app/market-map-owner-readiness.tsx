"use client";

import { useTranslations } from "next-intl";
import { CalendarClock, Plane, Sparkles, ArrowRight, MapPin } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import type { OwnAvailability } from "@/lib/market-map/owner-readiness";
import type { OwnCapabilities, CapabilityStatus } from "@/lib/market-map/owner-readiness";

/**
 * Market Map — OWNER-only availability/mobility + capability (skills) signals.
 *
 * Display-only, fed by the RLS-scoped owner read layer. Shows only the caller's
 * own real data; when there is none, it shows an action to complete the profile,
 * never a fake/empty state. "confirmed" is rendered only when the data layer
 * marked a real platform verification — never a fabricated claim.
 */

const STATUS_TONE: Record<CapabilityStatus, string> = {
  confirmed: "border-state-success/40 bg-state-success/5 text-state-success",
  suggested: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  self_declared: "border-border-subtle bg-surface-1 text-text-secondary",
};
const STATUS_ORDER: CapabilityStatus[] = ["confirmed", "suggested", "self_declared"];

export function MarketMapOwnerReadiness({
  availability,
  capabilities,
}: {
  availability: OwnAvailability;
  capabilities: OwnCapabilities;
}) {
  const t = useTranslations("marketMap.readiness");
  const tc = useTranslations("marketMap.capabilities");
  const tlm = useTranslations("labourMarket");

  const countryName = (code: string): string => {
    const n = tlm(`countryNames.${code}`);
    return n.includes("countryNames.") ? code : n;
  };
  // The ESCO taxonomy dropped localized name columns; the catalogue slug is the
  // honest skill label — humanize it (steel-fixing → Steel fixing).
  const skillName = (s: { slug: string | null; category: string | null }): string => {
    const raw = s.slug || s.category || "—";
    return raw.replace(/[-_.]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  };

  const hasMobility =
    !!availability.currentCountry || availability.preferredCountries.length > 0;

  return (
    <section className="card-border flex flex-col gap-5 p-4 sm:p-5" data-testid="market-map-readiness">
      {/* ── Availability & mobility ───────────────────────────────────── */}
      <div className="flex flex-col gap-2" data-testid="readiness-availability">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
          <CalendarClock className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-muted">{t("note")}</p>

        {!availability.hasWorker ? (
          <Link
            href={"/dashboard/profile" as "/dashboard"}
            data-testid="readiness-add"
            className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
          >
            {t("addAction")}
            <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="readiness-state"
                data-state={availability.availableFrom ? "from_date" : availability.state}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  availability.state === "available"
                    ? "border-state-success/40 bg-state-success/5 text-state-success"
                    : availability.state === "unknown"
                      ? "border-border-subtle bg-surface-1 text-text-secondary"
                      : "border-state-warning/40 bg-state-warning/5 text-state-warning"
                }`}
              >
                {availability.availableFrom
                  ? t("availableFrom", { date: availability.availableFrom })
                  : t(`state.${availability.state}`)}
              </span>
            </div>

            {hasMobility ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted" data-testid="readiness-mobility">
                <Plane className="h-3.5 w-3.5 text-brand-blue" strokeWidth={1.75} aria-hidden />
                {availability.currentCountry && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    {t("currentLabel")}: {countryName(availability.currentCountry)}
                  </span>
                )}
                {availability.preferredCountries.length > 0 && (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {t("preferredLabel")}:
                    {availability.preferredCountries.map((c) => (
                      <span key={c} className="rounded-full border border-border-subtle bg-surface-1 px-2 py-0.5 text-text-secondary">
                        {countryName(c)}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ) : (
              <Link
                href={"/dashboard/profile" as "/dashboard"}
                data-testid="readiness-mobility-add"
                className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
              >
                {t("mobilityAdd")}
                <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── Capability signals ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-ink-600/60 pt-4" data-testid="readiness-capabilities">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
          <Sparkles className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {tc("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-muted">{tc("note")}</p>

        {capabilities.signals.length === 0 ? (
          <Link
            href={"/dashboard/profile" as "/dashboard"}
            data-testid="capabilities-add"
            className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
          >
            {tc("addAction")}
            <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            {/* counts per status */}
            <div className="flex flex-wrap gap-1.5" data-testid="capabilities-counts">
              {STATUS_ORDER.map((s) => (
                <span
                  key={s}
                  data-testid={`capabilities-count-${s}`}
                  data-count={capabilities.counts[s]}
                  className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-label ${STATUS_TONE[s]}`}
                >
                  {tc(`status.${s}`)}: {capabilities.counts[s]}
                </span>
              ))}
            </div>
            {/* skill chips grouped by status */}
            <ul className="flex flex-wrap gap-1.5">
              {capabilities.signals.map((c) => (
                <li
                  key={c.skillId}
                  data-testid={`capability-chip-${c.status}`}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[c.status]}`}
                >
                  {skillName(c)}
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-text-muted">{tc("legend")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
