import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Briefcase, Tag, Store, UserRound, Building2, Map as MapIcon } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { FeatureNote } from "@/components/app/feature-note";
import { MarketMapBase } from "@/components/app/market-map-base";
import { createClient } from "@/lib/supabase/server";
import { getOwnedOrganizations } from "@/lib/company/owned-organizations";

/**
 * Map-first market surface (IA polish v2).
 *
 * The map is the main visual market surface, so this page LEADS with the live
 * map + a large "Atverti žemėlapį" primary action. The marketplace concept
 * (offers / shop / rentals / individual activity / company channels) lives
 * BELOW the map, compressed, with honest "preparing" states where no data
 * model exists. The user-facing nav label is "Žemėlapis" (route stays
 * /dashboard/marketplace internally).
 *
 * No schema change, no fake listings / companies / map signals. The map shows
 * only the user's own real location signal (MarketMapBase); supply-side offers
 * / shop / calendar are documented as an owner-gated migration plan in
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tightest text-text-primary">
          <MapIcon className="h-6 w-6 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("map.title")}
        </h1>
        <p className="max-w-prose text-sm text-text-secondary">{t("map.desc")}</p>
      </header>

      {/* MAP-FIRST hero: the live map is the dominant element, with the single
          primary action — "Atverti žemėlapį" — opening the full map workspace
          (advanced signals + capture tools) at /dashboard/market-map. */}
      <section className="flex flex-col gap-3" data-testid="marketplace-map-hero">
        <MarketMapBase />
        <Link
          href="/dashboard/market-map"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
          data-testid="marketplace-open-map"
        >
          <MapIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("map.cta")}
        </Link>
      </section>

      <FeatureNote testId="marketplace-not-fake-note">{t("notFakeNote")}</FeatureNote>

      {/* Live, real sub-surfaces — compact cards. */}
      <div className="grid gap-3 md:grid-cols-2">
        <HubCard
          icon={<Briefcase className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("opportunities.title")}
          desc={t("opportunities.desc")}
          href="/dashboard/opportunities"
          cta={t("opportunities.cta")}
          testId="marketplace-opportunities"
        />
        <HubCard
          icon={<UserRound className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          title={t("individual.title")}
          desc={t("individual.desc")}
          href="/dashboard/profile"
          cta={t("individual.cta")}
          testId="marketplace-individual"
        />
      </div>

      {/* Company channels (real owned companies by name + add). */}
      <section className="card-border flex flex-col gap-3 p-4" data-testid="marketplace-company">
        <div className="flex items-center gap-2 text-text-primary">
          <Building2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <h2 className="font-display text-base font-semibold">{t("company.title")}</h2>
        </div>
        {ownedCompanies.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2" data-testid="marketplace-company-list">
              {ownedCompanies.map((c) => (
                <li key={c.id}>
                  <Link
                    href="/dashboard/company"
                    className="flex items-center justify-between gap-3 rounded-md border border-ink-500 px-3 py-2 text-sm text-text-primary hover:border-brand-blue hover:text-brand-blue"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <span aria-hidden className="shrink-0 text-text-muted">→</span>
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
            <p className="text-sm text-text-secondary">{t("company.noCompanyDesc")}</p>
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

      {/* Preparing supply-side surfaces — collapsed by default (compression):
          no data model yet, no CTA, no fake items. */}
      <details className="group rounded-md border border-border-subtle bg-surface-1/40" data-testid="marketplace-preparing">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-label text-text-secondary hover:text-text-primary">
          <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
          {t("offers.title")} · {t("shop.title")}
          <span className="ml-auto rounded-sm border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 text-state-warning">
            {t("prepareBadge")}
          </span>
        </summary>
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
          <PrepareCard
            icon={<Tag className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            title={t("offers.title")}
            desc={t("offers.desc")}
            testId="marketplace-offers"
          />
          <PrepareCard
            icon={<Store className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            title={t("shop.title")}
            desc={t("shop.desc")}
            testId="marketplace-shop"
          />
        </div>
      </details>
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
    <section className="card-border flex flex-col gap-2 p-4" data-testid={testId}>
      <div className="flex items-center gap-2 text-text-primary">
        {icon}
        <h2 className="font-display text-base font-semibold">{title}</h2>
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
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  testId: string;
}) {
  return (
    <section className="rounded-md border border-border-subtle bg-surface-1/60 p-4" data-testid={testId}>
      <div className="flex items-center gap-2 text-text-secondary">
        {icon}
        <h3 className="font-display text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <p className="mt-1.5 text-sm text-text-secondary">{desc}</p>
    </section>
  );
}
