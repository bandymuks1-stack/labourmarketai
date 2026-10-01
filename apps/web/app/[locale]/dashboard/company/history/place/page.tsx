import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { CompanyPlaceHistory } from "@/components/app/organization/company-work-history";

/**
 * ONE PLACE of the company's imported work history: who worked there, when,
 * what was done, how many hours. `?p=` is a place key from the overview
 * (`o:<workObjectId>` or `l:<source label>`); an unknown key says so.
 */
export default async function CompanyHistoryPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");
  const sp = (await searchParams) ?? {};
  const placeKey = typeof sp.p === "string" ? sp.p : "none";
  const t = await getTranslations("companyWorkHistory");

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/dashboard/company/history"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        data-testid="company-place-back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>
      <CompanyPlaceHistory locale={locale} placeKey={placeKey} />
    </div>
  );
}
