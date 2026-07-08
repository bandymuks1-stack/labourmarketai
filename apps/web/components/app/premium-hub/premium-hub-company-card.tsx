import { getTranslations } from "next-intl/server";
import { Building2, MapPin } from "lucide-react";

import type { CompanyVM } from "./premium-hub-data";
import {
  HubEmptyState,
  HubPanel,
  HubStat,
  HubUnavailable,
} from "./premium-hub-primitives";

/** Block B — Įmonės kortelė. Real company identity + real RLS-scoped counts
 *  (active members, projects, pending invitations). Honest empty state when the
 *  caller has no company yet. */
export async function PremiumHubCompanyCard({ company }: { company: CompanyVM }) {
  const t = await getTranslations("premiumHub");

  if (company.status === "unavailable") {
    return (
      <HubPanel eyebrow={t("company.title")} icon={Building2} testid="premium-hub-company">
        <HubUnavailable message={t("unavailable")} />
      </HubPanel>
    );
  }

  if (company.status === "empty") {
    return (
      <HubPanel eyebrow={t("company.title")} icon={Building2} testid="premium-hub-company">
        <HubEmptyState
          icon={Building2}
          title={t("company.empty.title")}
          body={t("company.empty.body")}
          ctaLabel={t("company.empty.cta")}
          href="/dashboard/company"
        />
      </HubPanel>
    );
  }

  const stats = [
    { label: t("company.stats.team"), value: company.members },
    { label: t("company.stats.projects"), value: company.projects },
    { label: t("company.stats.invites"), value: company.invitations },
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
            {company.name ?? t("company.unnamed")}
          </h2>
          {company.country ? (
            <p className="flex items-center gap-1.5 truncate text-sm text-text-secondary">
              <MapPin
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                strokeWidth={1.75}
                aria-hidden
              />
              {company.country}
            </p>
          ) : null}
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
