import { getTranslations, setRequestLocale } from "next-intl/server";
import { Placeholder } from "@/components/ui/Placeholder";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("privacy.title")}
      </h1>
      <p className="mt-4 rounded-md border border-state-warning/40 px-4 py-3 text-sm text-state-warning">
        {t("draftNote")}
      </p>
      <div className="mt-8 text-sm leading-relaxed text-text-secondary">
        <Placeholder id="legal.privacy" />
      </div>
    </article>
  );
}
