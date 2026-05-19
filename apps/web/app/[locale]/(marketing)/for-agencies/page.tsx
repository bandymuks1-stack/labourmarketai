import { getTranslations, setRequestLocale } from "next-intl/server";
import { Placeholder } from "@/components/ui/Placeholder";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";

export default async function ForAgenciesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.agencies");
  const benefits = t.raw("benefits") as { title: string; body: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaSource="agencies_hero"
      />
      <BenefitCards items={benefits} />
      <section className="mx-auto max-w-container px-6 pb-12 sm:px-12">
        <div className="grid aspect-[16/7] place-items-center card-border p-8 text-center">
          <Placeholder id="screenshot.flow.agency" />
        </div>
      </section>
      <CtaBand
        title={`${t("title")} ${t("titleAccent")}`}
        subtitle={t("subcopy")}
        ctaSource="agencies_cta"
      />
    </>
  );
}
