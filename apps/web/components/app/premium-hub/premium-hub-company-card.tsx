import { getTranslations } from "next-intl/server";
import { Building2, MapPin } from "lucide-react";

import type { HubCompany } from "./premium-hub-fixtures";
import { HubPanel, HubStat } from "./premium-hub-primitives";

/** Block B — Įmonės kortelė. Company/team identity + compact operational stats. */
export async function PremiumHubCompanyCard({ company }: { company: HubCompany }) {
  const t = await getTranslations("premiumHub");
  const stats = [
    { label: t("company.stats.team"), value: company.team },
    { label: t("company.stats.projects"), value: company.projects },
    { label: t("company.stats.active"), value: company.active },
  ];
  return (
    <HubPanel eyebrow={t("company.title")} icon={Building2} testid="premium-hub-company">
      <div className="flex items-center gap-4">
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-blue/40 bg-gradient-to-br from-brand-blue/20 to-brand-violet/10"
        >
          <Building2 className="h-6 w-6 text-brand-blue" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate font-display text-lg font-bold tracking-tightest text-text-primary">
            {company.companyName}
          </h2>
          <p className="flex items-center gap-1.5 truncate text-sm text-text-secondary">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
            {company.location}
          </p>
          <p className="truncate font-mono text-[10px] uppercase tracking-label text-text-muted">
            {company.sector}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <HubStat key={stat.label} value={stat.value} label={stat.label} />
        ))}
      </div>
    </HubPanel>
  );
}
