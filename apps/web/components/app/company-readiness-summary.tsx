import { getTranslations } from "next-intl/server";

import {
  computeCompanyReadiness,
  type CompanyReadinessInput,
  type CompanyReadinessStatus,
} from "@/lib/company/company-readiness";

/**
 * Company readiness summary (Stage 5) — derived from the company's OWN existing
 * fields (§3.2). Honest: shows what is still missing for a real hire and never
 * claims "verified" (that is admin-set only). No new schema.
 */

const TONE: Record<CompanyReadinessStatus, string> = {
  incomplete: "border-state-warning/50 bg-state-warning/10 text-state-warning",
  basic: "border-state-amber/50 bg-state-amber/10 text-state-amber",
  hiring_ready: "border-state-success/50 bg-state-success/10 text-state-success",
};

export async function CompanyReadinessSummary({
  company,
}: {
  company: CompanyReadinessInput;
}) {
  const t = await getTranslations("companyReadiness");
  const r = computeCompanyReadiness(company);

  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="company-readiness"
      data-status={r.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <span
          className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${TONE[r.status]}`}
        >
          {t(`status.${r.status}` as never)}
        </span>
      </div>
      <p className="text-xs text-text-secondary">{t("help")}</p>

      {r.missing.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" data-testid="company-readiness-missing">
          {r.missing.map((m) => (
            <li
              key={m}
              className="rounded-md border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {t(`fields.${m}` as never)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-state-success">{t("allSet")}</p>
      )}

      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {r.verified ? t("verified") : t("notVerified")}
      </p>
    </section>
  );
}
