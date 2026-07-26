import { getTranslations } from "next-intl/server";
import { Building2, MapPin } from "lucide-react";

import type { CompanyVM } from "./premium-hub-data";
import {
  HubEmptyState,
  HubPanel,
  HubStat,
  HubUnavailable,
  HubZoneLink,
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

  // Every stat is a real door to the exact section it counts (interaction
  // contract): team + invitations anchor into the company space sections; a
  // company's projects list is the canonical /dashboard/projects surface. A
  // zero keeps its link — each destination owns an honest empty state with
  // the matching next action (invite form, project creation, …).
  const stats = [
    {
      label: t("company.stats.team"),
      value: company.members,
      href: "/dashboard/company#company-team",
      testid: "hub-company-stat-team",
    },
    {
      label: t("company.stats.projects"),
      value: company.projects,
      href: "/dashboard/projects",
      testid: "hub-company-stat-projects",
    },
    {
      label: t("company.stats.invites"),
      value: company.invitations,
      href: "/dashboard/company#company-invitations",
      testid: "hub-company-stat-invites",
    },
  ];

  return (
    <HubPanel eyebrow={t("company.title")} icon={Building2} testid="premium-hub-company">
      {/* Identity header = the door to the company space. */}
      <HubZoneLink
        href="/dashboard/company"
        ariaLabel={t("company.openSpace")}
        testid="hub-company-space-link"
      >
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card border border-brand-blue/40 bg-gradient-to-br from-brand-blue/20 to-brand-violet/10"
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
      </HubZoneLink>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <HubStat
            key={stat.label}
            value={stat.value}
            label={stat.label}
            href={stat.href}
            openHint={t("openHint")}
            testid={stat.testid}
          />
        ))}
      </div>
    </HubPanel>
  );
}
