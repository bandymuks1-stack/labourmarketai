import { getTranslations } from "next-intl/server";
import {
  UserRound,
  Building2,
  MapPin,
  LogIn,
  Compass,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import type { SelfSignal, SelfSignalBoard } from "@/lib/market-map/self-signal";

/**
 * Market-map SELF-SIGNAL panel — the logged-in user as a REAL country/region
 * labour-market signal. Separates the distinct signal categories the product
 * actually has:
 *   • Profile location (person's declared country)
 *   • Company location (registration / activity country)
 *   • Login location (neutral until it can be determined reliably + safely)
 *   • Preferred / desired locations (where they want to work / act)
 *
 * Privacy: country/region level only; exact address / coordinates are never
 * shown without confirmation. No fake markers, no fake points — a real
 * country-level signal is a real signal, not an empty state.
 *
 * Pure presentational server component — the shell fetches the RLS-scoped board.
 */
export async function MarketMapSelfSignal({ board }: { board: SelfSignalBoard }) {
  const t = await getTranslations("marketMap.selfSignal");
  const tlm = await getTranslations("labourMarket");

  const countryName = (code: string): string => {
    const name = tlm(`countryNames.${code}`);
    return name.includes("countryNames.") ? code : name;
  };

  function SignalRow({
    icon: Icon,
    roleLabel,
    signal,
    completeHref,
    completeBody,
    completeCta,
    testId,
  }: {
    icon: typeof UserRound;
    roleLabel: string;
    signal: SelfSignal;
    completeHref: string;
    completeBody: string;
    completeCta: string;
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
            <Link
              href={completeHref as "/dashboard"}
              data-testid={`${testId}-refine`}
              className="mt-0.5 inline-flex w-fit items-center gap-1 text-[11px] font-medium text-brand-blue hover:text-brand-cyan"
            >
              {completeCta}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-text-secondary">{completeBody}</p>
            <Link
              href={completeHref as "/dashboard"}
              data-testid={`${testId}-complete`}
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-brand-blue/40 bg-brand-blue/5 px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
            >
              {completeCta}
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
        {/* Honest country/region-level framing — a real country signal IS real. */}
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-text-secondary"
          data-testid="market-map-country-level-notice"
        >
          {t("countryLevelNotice")} · {t("exactHidden")}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        <SignalRow
          icon={UserRound}
          roleLabel={t("profileLabel")}
          signal={board.worker}
          completeHref="/dashboard/profile"
          completeBody={t("workerMissingBody")}
          completeCta={board.worker.hasLocation ? t("ctaRefineProfile") : t("addLocationCta")}
          testId="market-map-self-signal-worker"
        />

        {board.company && (
          <SignalRow
            icon={Building2}
            roleLabel={t("companyLabel")}
            signal={board.company}
            completeHref="/dashboard/company"
            completeBody={t("companyMissingBody")}
            completeCta={board.company.hasLocation ? t("ctaRefineCompany") : t("addLocationCta")}
            testId="market-map-self-signal-company"
          />
        )}

        {/* Login location — neutral until it can be determined reliably + safely.
            Never an exact address or coordinates. */}
        <li
          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/50 p-3"
          data-testid="market-map-self-signal-login"
        >
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium text-text-primary">{t("loginLabel")}</span>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">{t("loginNeutral")}</p>
        </li>

        {/* Preferred / desired locations — where the person wants to work / act.
            A separate intent signal from registration. */}
        <li
          className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3"
          data-testid="market-map-self-signal-preferred"
          data-count={board.preferred.length}
        >
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium text-text-primary">{t("preferredLabel")}</span>
          </div>
          {board.preferred.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" data-testid="market-map-preferred-list">
              {board.preferred.map((code) => (
                <li
                  key={code}
                  className="inline-flex items-center gap-1 rounded-full border border-brand-blue/40 bg-brand-blue/5 px-2 py-0.5 text-xs text-brand-blue"
                >
                  <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  {countryName(code)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-text-secondary">{t("preferredEmpty")}</p>
          )}
          <p className="text-[11px] leading-relaxed text-text-muted">{t("preferredNote")}</p>
          <Link
            href={"/dashboard/profile" as "/dashboard"}
            data-testid="market-map-self-signal-preferred-add"
            className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
          >
            {t("ctaAddPreferred")} →
          </Link>
        </li>
      </ul>
    </section>
  );
}
