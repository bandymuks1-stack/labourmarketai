"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Compass, ClipboardList, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import {
  addPreferredLocationAction,
  setPreferredLocationActiveAction,
  updatePreferredLocationAction,
  setLoginLocationConsentAction,
  setDemandLocationActiveAction,
  updateDemandLocationAction,
} from "@/lib/market-map/capture-actions";
import type {
  PreferredLocationRow,
  LoginConsentRow,
  OwnDemandRow,
} from "@/lib/market-map/capture";

/**
 * Market Map capture v1 — OWNER-only entry/management for preferred locations,
 * login-location consent, and company-need locations. Every action writes only
 * the caller's own rows (RLS), country/region level, no coordinates/address.
 * After a successful write the actions revalidate the layout and we refresh, so
 * the map's owner view (getOwnMarketSignals) shows the change.
 */

const INTENTS = [
  "work",
  "find_job",
  "sell_services",
  "buy_services",
  "join_team",
  "hire_team",
  "project_interest",
  "relocate",
  "remote_if_possible",
] as const;

const VISIBILITIES = ["self_only", "region_visible", "city_visible", "aggregated"] as const;
const CONSENTS = ["not_requested", "consented", "revoked"] as const;

export function MarketMapCapture({
  preferred,
  login,
  demand,
}: {
  preferred: PreferredLocationRow[];
  login: LoginConsentRow | null;
  demand: OwnDemandRow[];
}) {
  const t = useTranslations("marketMap.capture");
  const tlm = useTranslations("labourMarket");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const countryName = (code: string): string => {
    const n = tlm(`countryNames.${code}`);
    return n.includes("countryNames.") ? code : n;
  };

  // preferred add form state
  const [pCountry, setPCountry] = useState("");
  const [pCity, setPCity] = useState("");
  const [pIntents, setPIntents] = useState<string[]>([]);
  const [pVisibility, setPVisibility] = useState<string>("self_only");
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ kind: string }>, okKey = "saved") =>
    startTransition(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.kind === "ok" ? t(okKey) : t("error"));
      if (r.kind === "ok") router.refresh();
    });

  const fieldCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";

  return (
    <section className="card-border flex flex-col gap-5 p-4 sm:p-5" data-testid="market-map-capture">
      <h2 className="font-display text-base font-semibold text-text-primary">{t("title")}</h2>
      <p className="text-xs leading-relaxed text-text-muted">{t("note")}</p>

      {/* ── Preferred locations ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3" data-testid="capture-preferred">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Compass className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("preferred.title")}
        </h3>

        {preferred.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {preferred.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800/50 px-2.5 py-1.5 text-xs" data-testid="capture-preferred-row" data-active={p.active}>
                <span className="text-text-primary">{countryName(p.countryCode)}{p.city ? `, ${p.city}` : ""}</span>
                {/* Inline edit: change this location's visibility. */}
                <select
                  className="rounded border border-ink-500 bg-ink-800 px-1 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-secondary"
                  value={p.visibilityLevel}
                  disabled={pending}
                  data-testid="capture-preferred-visibility"
                  onChange={(e) => run(() => updatePreferredLocationAction(p.id, { visibilityLevel: e.target.value }))}
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>{t(`visibility.${v}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setPreferredLocationActiveAction(p.id, !p.active))}
                  className="ml-auto text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
                  data-testid="capture-preferred-toggle"
                >
                  {p.active ? t("disable") : t("enable")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("preferred.country")}
            <select className={fieldCls} value={pCountry} onChange={(e) => setPCountry(e.target.value)} data-testid="capture-preferred-country">
              <option value="">{t("preferred.countryPlaceholder")}</option>
              {MARKET_COUNTRIES.map((c) => (
                <option key={c} value={c}>{countryName(c)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("preferred.city")}
            <input className={fieldCls} value={pCity} onChange={(e) => setPCity(e.target.value)} placeholder={t("preferred.cityPlaceholder")} />
          </label>
        </div>

        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="mb-1 w-full font-mono text-[10px] uppercase tracking-label text-text-muted">{t("preferred.intents")}</legend>
          {INTENTS.map((i) => {
            const on = pIntents.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPIntents((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i]))}
                className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-border-subtle bg-surface-1 text-text-secondary"}`}
                data-testid={`capture-intent-${i}`}
              >
                {t(`intent.${i}`)}
              </button>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("preferred.visibility")}
            <select className={fieldCls} value={pVisibility} onChange={(e) => setPVisibility(e.target.value)}>
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>{t(`visibility.${v}`)}</option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            disabled={pending || !pCountry}
            data-testid="capture-preferred-add"
            onClick={() =>
              run(async () => {
                const r = await addPreferredLocationAction({
                  countryCode: pCountry,
                  city: pCity || undefined,
                  intents: pIntents,
                  granularity: pCity ? "city" : "country",
                  visibilityLevel: pVisibility,
                });
                if (r.kind === "ok") {
                  setPCity("");
                  setPIntents([]);
                  setPCountry("");
                }
                return r;
              }, "preferred.added")
            }
          >
            {t("preferred.add")}
          </Button>
        </div>
      </div>

      {/* ── Login location consent ────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-ink-600/60 pt-4" data-testid="capture-login">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <LogIn className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("login.title")}
        </h3>
        <p className="text-xs leading-relaxed text-text-secondary">{t("login.note")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {CONSENTS.map((c) => {
            const active = (login?.consentStatus ?? "not_requested") === c;
            return (
              <button
                key={c}
                type="button"
                disabled={pending}
                onClick={() => run(() => setLoginLocationConsentAction({ consentStatus: c, countryCode: login?.countryCode ?? undefined, granularity: "country" }))}
                className={`rounded-full border px-2.5 py-1 text-xs ${active ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-border-subtle bg-surface-1 text-text-secondary"}`}
                data-testid={`capture-login-${c}`}
              >
                {t(`login.${c}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Company-need locations (edit/disable; create in demand flow) ── */}
      <div className="flex flex-col gap-2 border-t border-ink-600/60 pt-4" data-testid="capture-demand">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <ClipboardList className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("demand.title")}
        </h3>
        {demand.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {demand.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800/50 px-2.5 py-1.5 text-xs" data-testid="capture-demand-row" data-active={d.active}>
                <span className="text-text-primary">{d.locationLabel || countryName(d.countryCode)}</span>
                {/* Inline edit: change this company-need location's visibility. */}
                <select
                  className="rounded border border-ink-500 bg-ink-800 px-1 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-secondary"
                  value={d.visibilityLevel}
                  disabled={pending}
                  data-testid="capture-demand-visibility"
                  onChange={(e) => run(() => updateDemandLocationAction(d.id, { visibilityLevel: e.target.value }))}
                >
                  {["company_only", "region_visible", "city_visible", "aggregated"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setDemandLocationActiveAction(d.id, !d.active))}
                  className="ml-auto text-[11px] font-semibold text-brand-blue hover:text-brand-cyan"
                  data-testid="capture-demand-toggle"
                >
                  {d.active ? t("disable") : t("enable")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-relaxed text-text-secondary">{t("demand.empty")}</p>
        )}
        <Link href={"/dashboard/company" as "/dashboard"} className="inline-flex w-fit text-[11px] font-semibold text-brand-blue hover:text-brand-cyan" data-testid="capture-demand-add">
          {t("demand.addCta")} →
        </Link>
      </div>

      {msg && (
        <p className="text-xs text-text-secondary" role="status" data-testid="capture-status">{msg}</p>
      )}
    </section>
  );
}
