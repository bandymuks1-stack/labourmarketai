import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrganizationDoorsServer } from "@/components/app/organization/organization-doors-server";

/**
 * THE ORGANIZATION CONTEXT (owner IA correction 2026-09-16, design/final/03).
 *
 * Every route under `/dashboard/company` is one door of the same
 * organization: Dabar (the hub), People, Needs, Calendar (planning),
 * Partners, Learning, History, Settings — and Work lives at
 * `/dashboard/projects`, which renders the same strip on its manager branch.
 * The strip is rendered HERE, once, so a person never loses the doors while
 * standing inside one of them, and no page has to remember to mount it.
 *
 * No data of the pages is read here. The doors loader answers only "which
 * doors does this organization have"; each page keeps its own reads and its
 * own authority checks.
 */
export default async function CompanyContextLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("organizationDoors");
  return (
    <div className="flex flex-col gap-4" data-testid="organization-context">
      <OrganizationDoorsServer ariaLabel={t("label")} />
      {children}
    </div>
  );
}
