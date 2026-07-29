"use client";

import { useActionState } from "react";
import { Building2, Globe2, MapPin, Trash2 } from "lucide-react";

import type {
  CompanyLocation,
  CompanyLocationsState,
} from "@/lib/company/company-locations";
import {
  removeCompanyLocationAction,
  saveCompanyLocationAction,
  type CompanyLocationActionState,
} from "@/lib/company/company-locations-actions";

/**
 * Company Locations management section (F12.4/5).
 *
 * A company is not one implicit point: headquarters, operating locations and
 * desired work markets, across multiple countries. Backed by the OWNER-GATED
 * draft migration (20260713120000). Until the owner applies it, this section
 * shows the honest "prepared, activation pending" state — no fake controls.
 */
export interface CompanyLocationsLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly kindHeadquarters: string;
  readonly kindOperating: string;
  readonly kindDesiredMarket: string;
  readonly countryLabel: string;
  readonly cityLabel: string;
  readonly regionLabel: string;
  readonly addButton: string;
  readonly removeButton: string;
  readonly empty: string;
  readonly gatedHeading: string;
  readonly gatedBody: string;
  readonly errorLabel: string;
  readonly countries: Record<string, string>;
  readonly countryCodes: readonly string[];
}

const IDLE: CompanyLocationActionState = { status: "idle" };

const KIND_META = [
  { value: "headquarters", icon: Building2 },
  { value: "operating", icon: MapPin },
  { value: "desired_market", icon: Globe2 },
] as const;

function kindLabel(
  kind: CompanyLocation["kind"],
  labels: CompanyLocationsLabels,
): string {
  if (kind === "headquarters") return labels.kindHeadquarters;
  if (kind === "operating") return labels.kindOperating;
  return labels.kindDesiredMarket;
}

export function CompanyLocationsSection({
  state,
  labels,
}: {
  state: CompanyLocationsState;
  labels: CompanyLocationsLabels;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveCompanyLocationAction,
    IDLE,
  );
  const [, removeAction] = useActionState(removeCompanyLocationAction, IDLE);

  const gated =
    state.kind === "needs-migration" ||
    saveState.status === "needs-migration";

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="company-locations-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <MapPin className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {gated ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="company-locations-gated"
        >
          <p className="font-mono text-meta uppercase tracking-label text-state-warning">
            {labels.gatedHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{labels.gatedBody}</p>
        </div>
      ) : state.kind === "error" ? (
        <p className="text-xs text-state-danger" role="alert">
          {labels.errorLabel}
        </p>
      ) : (
        <>
          {state.kind === "ok" && state.rows.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="company-locations-empty"
            >
              {labels.empty}
            </p>
          ) : state.kind === "ok" ? (
            <ul className="flex flex-col gap-2" data-testid="company-locations-list">
              {state.rows.map((row) => {
                const Icon =
                  KIND_META.find((k) => k.value === row.kind)?.icon ?? MapPin;
                return (
                  <li
                    key={row.id}
                    className="card-border flex items-center justify-between gap-3 p-3"
                    data-testid="company-location-row"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-text-primary">
                      <Icon className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                      <span className="truncate">
                        {[
                          row.label,
                          row.city,
                          row.region,
                          labels.countries[row.country] ?? row.country,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                      <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                        {kindLabel(row.kind, labels)}
                      </span>
                    </span>
                    <form action={removeAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        aria-label={labels.removeButton}
                        title={labels.removeButton}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-500 text-text-muted transition-colors hover:border-state-danger hover:text-state-danger"
                        data-testid={`company-location-remove-${row.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <form
            action={saveAction}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            data-testid="company-location-add-form"
          >
            <label className="flex min-w-36 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {labels.kindOperating} / {labels.kindHeadquarters}
              </span>
              <select
                name="kind"
                defaultValue="operating"
                className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              >
                <option value="headquarters">{labels.kindHeadquarters}</option>
                <option value="operating">{labels.kindOperating}</option>
                <option value="desired_market">{labels.kindDesiredMarket}</option>
              </select>
            </label>
            <label className="flex min-w-36 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {labels.countryLabel}
              </span>
              <select
                name="country"
                defaultValue=""
                required
                className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              >
                <option value="" disabled>
                  —
                </option>
                {labels.countryCodes.map((code) => (
                  <option key={code} value={code}>
                    {labels.countries[code] ?? code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-36 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                {labels.cityLabel}
              </span>
              <input
                type="text"
                name="city"
                maxLength={120}
                className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
              />
            </label>
            <button
              type="submit"
              disabled={savePending}
              data-testid="company-location-add-submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
            >
              {labels.addButton}
            </button>
          </form>
          {(saveState.status === "error" || saveState.status === "invalid") && (
            <p className="text-xs text-state-danger" role="alert">
              {labels.errorLabel}
            </p>
          )}
        </>
      )}
    </section>
  );
}
