import { getTranslations } from "next-intl/server";
import { UserRound, Building2, MapPin, ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import type { SelfSignal, SelfSignalBoard } from "@/lib/market-map/self-signal";

/**
 * Market-map SELF-SIGNAL panel. Shows the logged-in user on the shared map as a
 * REAL country-level signal — their worker/person signal, their company signal,
 * or both — built from their own self-declared country. No coordinates, no
 * marker, no fake point: the input shape carries no lat/lng.
 *
 * When a signal has no country yet it renders a real location-completion action
 * (link to the profile / company room), never a "map is being prepared" notice.
 *
 * Pure presentational server component — the shell fetches the RLS-scoped board.
 */
export async function MarketMapSelfSignal({ board }: { board: SelfSignalBoard }) {
  const t = await getTranslations("marketMap.selfSignal");
  const tlm = await getTranslations("labourMarket");

  const countryName = (code: string): string => {
    const name = tlm(`countryNames.${code}`);
    // next-intl returns the key path when missing — fall back to the raw value
    // (a free-text country still renders honestly).
    return name.includes("countryNames.") ? code : name;
  };

  function SignalRow({
    signal,
    icon: Icon,
    roleLabel,
    completeHref,
    completeBody,
    testId,
  }: {
    signal: SelfSignal;
    icon: typeof UserRound;
    roleLabel: string;
    completeHref: string;
    completeBody: string;
    testId: string;
  }) {
    return (
      <li
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3"
        data-testid={testId}
        data-has-location={signal.hasLocation ? "true" : "false"}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium text-text-primary">
            {signal.name ?? roleLabel}
          </span>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-label text-text-muted">
            {roleLabel}
          </span>
        </div>

        {signal.hasLocation && signal.countryCode ? (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
              {countryName(signal.countryCode)}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-label text-text-muted">
              {t("countryLevel")} · {t("selfDeclared")}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-text-secondary">
              {completeBody}
            </p>
            <Link
              href={completeHref as "/dashboard"}
              data-testid={`${testId}-complete`}
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-brand-blue/40 bg-brand-blue/5 px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
            >
              {t("addLocationCta")}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        )}
      </li>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="market-map-self-signal"
      aria-labelledby="market-map-self-signal-title"
    >
      <div className="flex flex-col gap-1">
        <span
          id="market-map-self-signal-title"
          className="flex items-center gap-2 font-display text-base font-semibold text-text-primary"
        >
          <UserRound className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </span>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("note")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        <SignalRow
          signal={board.worker}
          icon={UserRound}
          roleLabel={t("workerLabel")}
          completeHref="/dashboard/profile"
          completeBody={t("workerMissingBody")}
          testId="market-map-self-signal-worker"
        />
        {board.company && (
          <SignalRow
            signal={board.company}
            icon={Building2}
            roleLabel={t("companyLabel")}
            completeHref="/dashboard/company"
            completeBody={t("companyMissingBody")}
            testId="market-map-self-signal-company"
          />
        )}
      </ul>
    </section>
  );
}
