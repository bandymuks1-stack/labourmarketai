"use client";

import { useMemo, useState } from "react";
import {
  filterCandidates,
  candidatePoolFacets,
  type CandidateView,
  type CandidateFilters,
  type EvidenceStatus,
} from "@/lib/staffing/candidate-pool-core";

/**
 * Operator candidate pool board (Staffing Operating Model v1, PR7). Read-only,
 * admin-only. Filters the existing worker supply in-memory by trade, country,
 * availability and evidence status. Honest badges: confirmed evidence vs
 * self-declared (NOT verified) vs missing info. No actions, no verification, no
 * publishing — an operator's internal view.
 */
export interface CandidatePoolLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly notVerifiedNote: string;
  readonly filterProfession: string;
  readonly filterCountry: string;
  readonly filterAvailableBy: string;
  readonly filterEvidence: string;
  readonly search: string;
  readonly any: string;
  readonly evidenceConfirmed: string;
  readonly evidenceSelfDeclared: string;
  readonly evidenceMissing: string;
  readonly count: string;
  readonly colName: string;
  readonly colTrade: string;
  readonly colCountry: string;
  readonly colAvailable: string;
  readonly colExperience: string;
  readonly colEvidence: string;
  readonly colMissing: string;
  readonly expYears: string;
  readonly none: string;
  readonly empty: string;
  /** Consent-and-disclosure v1: worker-permission column. */
  readonly colPermission: string;
  readonly permissionGranted: string;
  readonly permissionAwaiting: string;
  readonly permissionWithdrawn: string;
  readonly permissionNote: string;
}

/** CURRENT worker discoverability/permission state (consent ledger). Anything
 *  that is not an active grant renders as "Awaiting worker permission" —
 *  the operator can look internally but may NOT send this candidate outward. */
export type WorkerPermissionBadge =
  | "granted"
  | "withdrawn"
  | "granted_stale_version"
  | "not_set"
  | "unknown";

const EVIDENCE_LABEL: Record<EvidenceStatus, keyof CandidatePoolLabels> = {
  confirmed_evidence: "evidenceConfirmed",
  self_declared: "evidenceSelfDeclared",
  missing_info: "evidenceMissing",
};

const BADGE: Record<EvidenceStatus, string> = {
  confirmed_evidence: "bg-state-success/15 text-state-success",
  self_declared: "bg-brand-blue/15 text-brand-blue",
  missing_info: "bg-state-warning/15 text-state-warning",
};

export function CandidatePoolBoard({
  candidates,
  labels,
  professionLabels,
}: {
  readonly candidates: readonly (CandidateView & {
    readonly workerPermission?: WorkerPermissionBadge;
  })[];
  readonly labels: CandidatePoolLabels;
  readonly professionLabels: Readonly<Record<string, string>>;
}) {
  const [filters, setFilters] = useState<CandidateFilters>({});
  const facets = useMemo(() => candidatePoolFacets(candidates), [candidates]);
  const filtered = useMemo(() => filterCandidates(candidates, filters), [candidates, filters]);

  const prof = (slug: string) => professionLabels[slug] ?? slug;
  const set = (patch: Partial<CandidateFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const ctl =
    "rounded-md border border-border-default bg-surface-1 px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand-blue";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text-primary">{labels.title}</h1>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
        <p className="text-[11px] text-text-muted">{labels.notVerifiedNote}</p>
      </header>

      <div className="flex flex-wrap gap-3" data-testid="candidate-pool-filters">
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          {labels.filterProfession}
          <select className={ctl} value={filters.profession ?? ""} onChange={(e) => set({ profession: e.target.value || undefined })}>
            <option value="">{labels.any}</option>
            {facets.professions.map((p) => (
              <option key={p} value={p}>{prof(p)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          {labels.filterCountry}
          <select className={ctl} value={filters.country ?? ""} onChange={(e) => set({ country: e.target.value || undefined })}>
            <option value="">{labels.any}</option>
            {facets.countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          {labels.filterAvailableBy}
          <input type="date" className={ctl} value={filters.availableBy ?? ""} onChange={(e) => set({ availableBy: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          {labels.filterEvidence}
          <select className={ctl} value={filters.evidence ?? "any"} onChange={(e) => set({ evidence: e.target.value as CandidateFilters["evidence"] })}>
            <option value="any">{labels.any}</option>
            <option value="confirmed_evidence">{labels.evidenceConfirmed}</option>
            <option value="self_declared">{labels.evidenceSelfDeclared}</option>
            <option value="missing_info">{labels.evidenceMissing}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          {labels.search}
          <input type="text" className={ctl} value={filters.search ?? ""} onChange={(e) => set({ search: e.target.value || undefined })} />
        </label>
      </div>

      <p className="text-xs text-text-secondary" data-testid="candidate-pool-count">
        {labels.count}: {filtered.length}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-border-default bg-surface-1 p-4 text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="candidate-pool-table">
            <thead className="text-text-muted">
              <tr>
                <th className="py-2 pr-3">{labels.colName}</th>
                <th className="py-2 pr-3">{labels.colTrade}</th>
                <th className="py-2 pr-3">{labels.colCountry}</th>
                <th className="py-2 pr-3">{labels.colAvailable}</th>
                <th className="py-2 pr-3">{labels.colExperience}</th>
                <th className="py-2 pr-3">{labels.colEvidence}</th>
                <th className="py-2 pr-3">{labels.colPermission}</th>
                <th className="py-2 pr-3">{labels.colMissing}</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border-subtle align-top">
                  <td className="py-2 pr-3 text-text-primary">{c.displayName ?? "—"}</td>
                  <td className="py-2 pr-3">{c.professionSlugs.map(prof).join(", ") || "—"}</td>
                  <td className="py-2 pr-3">
                    {c.locationCountry ?? "—"}
                    {c.preferredCountries.length ? ` → ${c.preferredCountries.join(", ")}` : ""}
                  </td>
                  <td className="py-2 pr-3">{c.availableFrom ?? c.availabilityStatus ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {typeof c.experienceYears === "number" ? `${c.experienceYears} ${labels.expYears}` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[c.evidenceStatus]}`}>
                      {labels[EVIDENCE_LABEL[c.evidenceStatus]]}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {c.workerPermission === "granted" ? (
                      <span className="rounded-full bg-state-success/15 px-2 py-0.5 text-[10px] font-semibold text-state-success">
                        {labels.permissionGranted}
                      </span>
                    ) : c.workerPermission === "withdrawn" ? (
                      <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                        {labels.permissionWithdrawn}
                      </span>
                    ) : (
                      <span className="rounded-full bg-state-warning/15 px-2 py-0.5 text-[10px] font-semibold text-state-warning">
                        {labels.permissionAwaiting}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{c.missingFields.length ? c.missingFields.join(", ") : labels.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
