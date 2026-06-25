import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Map as MapIcon, Briefcase, Tag, Store, UserRound, Building2 } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { FeatureNote } from "@/components/app/feature-note";
import { createClient } from "@/lib/supabase/server";
import { getOwnedOrganizations } from "@/lib/company/owned-organizations";

/**
 * Marketplace hub (IA cleanup v2).
 *
 * ONE compact place that connects the person + company identities, the live
 * map, real opportunities/search, and HONEST "preparing" states for the
 * supply-side surfaces (offers / shop / rentals / real estate) that have no
 * data model yet. It is NOT a second dashboard and NOT a fake-listing wall:
 *   - live sections link to the real existing surfaces;
 *   - preparing sections say so plainly (no fake items, no fake companies);
 *   - the company section lists the REAL organizations the user owns
 *     (2, 3, or 50) by NAME and offers an "add company" action.
 *
 * No schema change: every datum here is read from existing tables. Supply-side
 * offers / shop / calendar are documented as an owner-gated migration plan in
 * docs/owner-input/ia-compactness-marketplace-v2.md — not faked here.
 */
export default async function MarketplacePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketplaceHub");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const ownedResult = await getOwnedOrganizations();
  const ownedCompanies =
    ownedResult.kind === "ok"
      ? ownedResult.organizations.filter((o) => o.organizationType !== "agency")
      : [];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      <FeatureNote testId="marketplace-not-fake-note">
        {t("notFakeNote")}
      </FeatureNote>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1 — Map (live) */}
        <HubCard
          icon={<MapIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("map.title")}
          desc={t("map.desc")}
          href="/dashboard/market-map"
          cta={t("map.cta")}
          testId="marketplace-map"
        />

        {/* 2 — Work / needs / opportunities (live) */}
        <HubCard
          icon={<Briefcase className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("opportunities.title")}
          desc={t("opportunities.desc")}
          href="/dashboard/opportunities"
          cta={t("opportunities.cta")}
          testId="marketplace-opportunities"
        />

        {/* 3 — Company & personal offers (preparing — no supply-side schema) */}
        <PrepareCard
          icon={<Tag className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("offers.title")}
          desc={t("offers.desc")}
          badge={t("prepareBadge")}
          testId="marketplace-offers"
        />

        {/* 4 — Shop / services / rentals / real estate (preparing — no schema) */}
        <PrepareCard
          icon={<Store className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("shop.title")}
          desc={t("shop.desc")}
          badge={t("prepareBadge")}
          testId="marketplace-shop"
        />

        {/* 5 — Individual activity (person identity / self-employed) */}
        <HubCard
          icon={<UserRound className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("individual.title")}
          desc={t("individual.desc")}
          href="/dashboard/profile"
          cta={t("individual.cta")}
          testId="marketplace-individual"
        />

        {/* 6 — Company channels (selected/owned companies — real, by name) */}
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="marketplace-company"
        >
          <div className="flex items-center gap-2 text-text-primary">
            <Building2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <h2 className="font-display text-lg font-semibold">
              {t("company.title")}
            </h2>
          </div>
          {ownedCompanies.length > 0 ? (
            <>
              <p className="text-sm text-text-secondary">{t("company.desc")}</p>
              <ul className="flex flex-col gap-2" data-testid="marketplace-company-list">
                {ownedCompanies.map((c) => (
                  <li key={c.id}>
                    <Link
                      href="/dashboard/company"
                      className="flex items-center justify-between gap-3 rounded-md border border-ink-500 px-3 py-2 text-sm text-text-primary hover:border-brand-blue hover:text-brand-blue"
                    >
                      <span className="truncate font-medium">{c.name}</span>
                      <span aria-hidden className="shrink-0 text-text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/start/company"
                className="font-mono text-[11px] uppercase tracking-label text-brand-blue hover:underline"
                data-testid="marketplace-add-company"
              >
                + {t("company.noCompanyCta")}
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                {t("company.noCompanyDesc")}
              </p>
              <Link
                href="/dashboard/start/company"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-1.5 text-sm text-brand-blue hover:bg-brand-blue/10"
                data-testid="marketplace-add-company"
              >
                + {t("company.noCompanyCta")}
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Live hub card — links to a real existing surface. */
function HubCard({
  icon,
  title,
  desc,
  href,
  cta,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  cta: string;
  testId: string;
}) {
  return (
    <section className="card-border flex flex-col gap-3 p-5" data-testid={testId}>
      <div className="flex items-center gap-2 text-text-primary">
        {icon}
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <p className="flex-1 text-sm text-text-secondary">{desc}</p>
      <Link
        href={href as "/dashboard"}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-1.5 text-sm text-brand-blue hover:bg-brand-blue/10"
      >
        {cta}
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}

/** Honest preparing card — no data model yet, no CTA, no fake items. */
function PrepareCard({
  icon,
  title,
  desc,
  badge,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge: string;
  testId: string;
}) {
  return (
    <section
      className="card-border flex flex-col gap-3 p-5 opacity-90"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-text-secondary">
          {icon}
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {title}
          </h2>
        </div>
        <span className="shrink-0 rounded-sm border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning">
          {badge}
        </span>
      </div>
      <p className="text-sm text-text-secondary">{desc}</p>
    </section>
  );
}
