"use client";

import { useActionState } from "react";
import { useLocale } from "next-intl";

import {
  setMarketRateAverage,
  type MarketRateActionState,
} from "@/lib/admin/market-actions";

/**
 * Admin market-average entry form (S4). Hand-entered from a REAL source —
 * the source note + source status travel with the figure (needs_source until
 * an admin marks it sourced/reviewed). No estimates, no scraping.
 */

export interface MarketAverageFormLabels {
  professionLabel: string;
  countryLabel: string;
  rateLabel: string;
  sourceNoteLabel: string;
  sourceNotePlaceholder: string;
  sourceStatusLabel: string;
  sourceStatus: Record<"needs_source" | "sourced" | "reviewed", string>;
  save: string;
  saving: string;
  saved: string;
  needsMigration: string;
  errorMsg: string;
}

const COUNTRIES = ["LT", "LV", "EE", "NL", "DE", "DK", "NO", "SE", "PL", "BE"] as const;

const field =
  "rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary";

export function MarketAverageForm({
  professions,
  labels,
}: {
  professions: readonly { id: string; slug: string; name: string }[];
  labels: MarketAverageFormLabels;
}) {
  const locale = useLocale();
  const [state, action, pending] = useActionState<
    MarketRateActionState | null,
    FormData
  >(setMarketRateAverage, null);

  return (
    <form
      action={action}
      className="card-border grid gap-3 p-4 sm:grid-cols-2"
      data-testid="market-average-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.professionLabel}
        </span>
        <select name="profession_id" required className={field} defaultValue="">
          <option value="" disabled />
          {professions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.countryLabel}
        </span>
        <select name="country" required className={field} defaultValue="">
          <option value="" disabled />
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.rateLabel}
        </span>
        <input
          name="avg_rate_eur"
          required
          inputMode="decimal"
          pattern="[0-9]+([.,][0-9]+)?"
          className={field}
          data-testid="market-average-rate"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.sourceStatusLabel}
        </span>
        <select name="source_status" className={field} defaultValue="needs_source">
          {(["needs_source", "sourced", "reviewed"] as const).map((s) => (
            <option key={s} value={s}>
              {labels.sourceStatus[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.sourceNoteLabel}
        </span>
        <input
          name="source_note"
          placeholder={labels.sourceNotePlaceholder}
          className={field}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          data-testid="market-average-submit"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {state?.ok ? (
          <span className="text-xs text-state-success" role="status">
            {labels.saved}
          </span>
        ) : null}
        {state && !state.ok ? (
          <span className="text-xs text-state-warning" role="status">
            {state.code === "needs_migration" ? labels.needsMigration : labels.errorMsg}
          </span>
        ) : null}
      </div>
    </form>
  );
}
