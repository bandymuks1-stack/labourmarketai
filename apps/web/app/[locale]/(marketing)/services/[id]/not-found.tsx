import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/app/premium/page-title";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notFound");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ServiceNotFound() {
  const t = await getTranslations("publicServices");
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <PageTitle>{t("notFound")}</PageTitle>
      <p className="text-sm text-text-secondary">{t("notFoundHint")}</p>
      <Link href="/services" className={buttonLinkClassName("secondary")}>{t("back")}</Link>
    </section>
  );
}
