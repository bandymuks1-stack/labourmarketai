"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Compass, ClipboardList, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
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
const DEMAND_VISIBILITIES = ["company_only", "region_visible", "city_visible", "aggregated"] as const;
const CONSENTS = ["not_requested", "consented", "revoked"] as const;
const PRIORITIES = ["primary", "secondary", "optional"] as const;
const NEED_TYPES = [
  "workers",
  "team",
  "subcontractors",
  "freelancers",
  "service_provider",
  "project_capacity",
  "accommodation_support",
  "transport_support",
] as const;

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
  const [pPriority, setPPriority] = useState<string>("secondary");
  const [pNote, setPNote] = useState("");
  const [pVisibility, setPVisibility] = useState<string>("self_only");
  const [msg, setMsg] = useState<string | null>(null);

  const peopleRange = (d: OwnDemandRow): string | null => {
    const lo = d.peopleCountMin;
    const hi = d.peopleCountMax;
    if (lo == null && hi == null) return null;
    if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`;
    return `${lo ?? hi}`;
  };
  const dateRange = (d: OwnDemandRow): string | null => {
    const f = d.startDate?.slice(0, 10);
    const tt = d.endDate?.slice(0, 10);
    if (!f && !tt) return null;
    return [f, tt].filter(Boolean).join(" → ");
  };

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
      <div id="market-map-add-preferred" className="flex scroll-mt-24 flex-col gap-3" data-testid="capture-preferred">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Compass className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("preferred.title")}
        </h3>

        {preferred.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {preferred.map((p) => (
              <li
                key={p.id}
                className={`flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/50 px-2.5 py-2 text-xs ${p.active ? "" : "opacity-60"}`}
                data-testid="capture-preferred-row"
                data-active={p.active}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{countryName(p.countryCode)}{p.city ? `, ${p.city}` : ""}</span>
                  {/* Direction: primary / secondary / optional (localized, not raw enum). */}
                  <span
                    className="rounded-full border border-brand-blue/40 bg-brand-blue/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-label text-brand-blue"
                    data-testid="capture-preferred-priority"
                  >
                    {t(`priority.${p.priority}`)}
                  </span>
                </div>
                {p.intents.length > 0 && (
                  <div className="flex flex-wrap gap-1" data-testid="capture-preferred-intents">
                    {p.intents.map((i) => (
                      <span key={i} className="rounded-full border border-border-subtle bg-surface-1 px-2 py-0.5 text-[11px] text-text-secondary">
                        {t(`intent.${i}`)}
                      </span>
                    ))}
                  </div>
                )}
                {p.shortNote && <p className="text-[11px] italic leading-relaxed text-text-muted">{p.shortNote}</p>}
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
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

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("preferred.priorityLabel")}
            <select className={fieldCls} value={pPriority} onChange={(e) => setPPriority(e.target.value)} data-testid="capture-preferred-priority-select">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`priority.${p}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("preferred.note")}
            <input
              className={fieldCls}
              value={pNote}
              maxLength={280}
              onChange={(e) => setPNote(e.target.value)}
              placeholder={t("preferred.notePlaceholder")}
              data-testid="capture-preferred-note"
            />
          </label>
        </div>

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
            onClick={() => {
              trackFunnel(FUNNEL_EVENTS.preferredLocationAddStarted, {
                surface: "market_map",
              });
              run(async () => {
                const r = await addPreferredLocationAction({
                  countryCode: pCountry,
                  city: pCity || undefined,
                  intents: pIntents,
                  priority: pPriority,
                  shortNote: pNote || undefined,
                  granularity: pCity ? "city" : "country",
                  visibilityLevel: pVisibility,
                });
                if (r.kind === "ok") {
                  trackFunnel(FUNNEL_EVENTS.preferredLocationSaved, {
                    surface: "market_map",
                    success: true,
                  });
                  setPCity("");
                  setPIntents([]);
                  setPCountry("");
                  setPPriority("secondary");
                  setPNote("");
                } else {
                  // Failed attempt ≠ abandoned attempt (audit F-T5).
                  trackFunnel(FUNNEL_EVENTS.preferredLocationSaved, {
                    surface: "market_map",
                    success: false,
                  });
                }
                return r;
              }, "preferred.added");
            }}
          >
            {t("preferred.add")}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("aggregatedHint")}</p>
      </div>

      {/* ── Login location consent ────────────────────────────────────── */}
      <div id="market-map-login-consent" className="flex scroll-mt-24 flex-col gap-2 border-t border-ink-600/60 pt-4" data-testid="capture-login">
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
            {demand.map((d) => {
              const people = peopleRange(d);
              const dates = dateRange(d);
              return (
              <li
                key={d.id}
                className={`flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/50 px-2.5 py-2 text-xs ${d.active ? "" : "opacity-60"}`}
                data-testid="capture-demand-row"
                data-active={d.active}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{d.locationLabel || countryName(d.countryCode)}</span>
                  {d.urgency && (
                    <span
                      className="rounded-full border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-label text-state-warning"
                      data-testid="capture-demand-urgency"
                    >
                      {t(`urgency.${d.urgency}`)}
                    </span>
                  )}
                  {d.mobilityRequired && (
                    <span className="rounded-full border border-border-subtle bg-surface-1 px-2 py-0.5 text-[10px] text-text-secondary">{t("demand.mobility")}</span>
                  )}
                  {d.accommodationNeeded && (
                    <span className="rounded-full border border-border-subtle bg-surface-1 px-2 py-0.5 text-[10px] text-text-secondary">{t("demand.accommodation")}</span>
                  )}
                </div>
                {(people || dates) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                    {people && <span>{t("demand.people")}: {people}</span>}
                    {dates && <span>{t("demand.dates")}: {dates}</span>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Inline edit: need type (localized, not a raw enum). */}
                  <select
                    className="rounded border border-ink-500 bg-ink-800 px-1 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-secondary"
                    value={d.needType ?? ""}
                    disabled={pending}
                    data-testid="capture-demand-needtype"
                    onChange={(e) => run(() => updateDemandLocationAction(d.id, { needType: e.target.value }))}
                  >
                    <option value="" disabled>{t("demand.needTypeLabel")}</option>
                    {NEED_TYPES.map((n) => (
                      <option key={n} value={n}>{t(`needType.${n}`)}</option>
                    ))}
                  </select>
                  {/* Inline edit: change this company-need location's visibility. */}
                  <select
                    className="rounded border border-ink-500 bg-ink-800 px-1 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-secondary"
                    value={d.visibilityLevel}
                    disabled={pending}
                    data-testid="capture-demand-visibility"
                    onChange={(e) => run(() => updateDemandLocationAction(d.id, { visibilityLevel: e.target.value }))}
                  >
                    {DEMAND_VISIBILITIES.map((v) => (
                      <option key={v} value={v}>{t(`visibility.${v}`)}</option>
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
                </div>
              </li>
              );
            })}
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
