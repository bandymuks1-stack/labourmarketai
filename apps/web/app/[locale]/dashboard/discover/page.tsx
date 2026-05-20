import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardSection } from "@/components/app/dashboard-section";

export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.dashboard");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("tabs.discover")}
      </h1>
      <DashboardSection
        title={t("tabs.discover")}
        emptyBody={t("empty.discover")}
      />
    </div>
  );
}
