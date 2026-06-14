"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { buildWorkCategoryOptions, MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import { applyNeedStructureAction } from "@/lib/admin/need-backfill-actions";
import type { UnstructuredNeed } from "@/lib/admin/need-backfill";

/**
 * One row of the admin need-structuring backfill: shows the admin-only free
 * text + the deterministic suggestion, with editable closed-set selects the
 * admin reviews before applying. Only closed-set values are submitted; free
 * text is never written to the structured columns.
 */
const SELECT =
  "w-full rounded-md border border-ink-500 bg-ink-700 px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-brand-blue";

const CONFIDENCE_TONE: Record<string, string> = {
  high: "border-state-success/40 bg-state-success/10 text-state-success",
  medium: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  low: "border-ink-500 bg-ink-800/40 text-text-muted",
};

export function NeedStructureRow({ need }: { need: UnstructuredNeed }) {
  const t = useTranslations("needStructuring");
  const tc = useTranslations("companyNeed");
  const tlm = useTranslations("labourMarket");
  const to = useTranslations("opportunities");
  const locale = useLocale();
  const categories = buildWorkCategoryOptions(locale);

  const s = need.suggestion;
  const [workType, setWorkType] = useState(need.current.roleOrWorkType ?? s.workType ?? "");
  const [country, setCountry] = useState(need.current.country ?? s.country ?? "");
  const [teamSize, setTeamSize] = useState(
    need.current.teamSize != null ? String(need.current.teamSize) : s.teamSize != null ? String(s.teamSize) : "",
  );
  const [startPeriod, setStartPeriod] = useState(need.current.startPeriod ?? s.startPeriod ?? "");
  const [accommodation, setAccommodation] = useState(s.accommodation ?? "");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const accommodationOptions = [
    { value: "provided_free", label: tc("accFree") },
    { value: "provided_paid", label: tc("accPaid") },
    { value: "provided_deducted", label: tc("accDeducted") },
    { value: "not_provided", label: tc("accNone") },
  ];
  const startOptions = [
    { value: "flexible", label: to("urgency.flexible") },
    { value: "this_week", label: to("urgency.this_week") },
    { value: "urgent", label: to("urgency.urgent") },
  ];

  function apply() {
    setError(null);
    start(() => {
      applyNeedStructureAction(need.id, { workType, country, teamSize, startPeriod, accommodation })
        .then((res) => {
          if (res?.ok) setDone(true);
          else setError(t(res?.code === "not_admin" ? "applyNotAdmin" : "applyError"));
        })
        .catch(() => setError(t("applyError")));
    });
  }

  return (
    <li className="card-border flex flex-col gap-3 p-4" data-testid={`need-row-${need.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate font-display text-sm font-bold text-text-primary">{need.title}</p>
        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label ${CONFIDENCE_TONE[s.confidence]}`}
        >
          {t(`confidence.${s.confidence}`)}
          {s.needsReview ? ` · ${t("needsReview")}` : ""}
        </span>
      </div>

      {/* Admin-only free-text context (NEVER shown to workers). */}
      <details className="rounded-md border border-ink-600 bg-ink-800/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-secondary">
          {t("freeTextHeading")}
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pb-3 text-xs">
          {(
            [
              ["role", need.freeText.role],
              ["description", need.freeText.description],
              ["location", need.freeText.location],
              ["notes", need.freeText.notes],
            ] as const
          ).map(([k, v]) => (
            <Fragmenty key={k} k={t(`freeText.${k}`)} v={v} />
          ))}
        </dl>
      </details>

      {/* Reviewed, closed-set structured fields. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-muted">{tc("profession")}</span>
          <select className={SELECT} value={workType} onChange={(e) => setWorkType(e.target.value)} disabled={done}>
            <option value="">—</option>
            {categories.map((c) => (
              <optgroup key={c.key} label={c.sector}>
                {c.options.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-muted">{tc("country")}</span>
          <select className={SELECT} value={country} onChange={(e) => setCountry(e.target.value)} disabled={done}>
            <option value="">—</option>
            {MARKET_COUNTRIES.map((code) => (
              <option key={code} value={code}>{tlm(`countryNames.${code}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-muted">{tc("numberOfWorkers")}</span>
          <input
            type="number"
            min={1}
            max={100000}
            className={SELECT}
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            disabled={done}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-muted">{t("startPeriodLabel")}</span>
          <select className={SELECT} value={startPeriod} onChange={(e) => setStartPeriod(e.target.value)} disabled={done}>
            <option value="">—</option>
            {startOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-text-muted">{tc("accommodation")}</span>
          <select className={SELECT} value={accommodation} onChange={(e) => setAccommodation(e.target.value)} disabled={done}>
            <option value="">—</option>
            {accommodationOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {done ? (
          <span className="text-xs font-semibold text-state-success">✓ {t("applied")}</span>
        ) : (
          <button
            type="button"
            onClick={apply}
            disabled={isPending}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
            data-testid={`need-apply-${need.id}`}
          >
            {isPending ? t("applying") : t("applyButton")}
          </button>
        )}
        {error && <span className="text-xs text-state-danger">{error}</span>}
      </div>
    </li>
  );
}

function Fragmenty({ k, v }: { k: string; v: string | null }) {
  return (
    <>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">{k}</dt>
      <dd className="whitespace-pre-wrap text-text-secondary">{v?.trim() || "—"}</dd>
    </>
  );
}
