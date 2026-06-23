import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Public legal page — honest minimal notice (audit P1 cleanup): legal documents
 * are being prepared before any paid/contractual launch. No internal draft-note
 * wording, no placeholder marker, no fake legal finality.
 */
export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12" data-testid="legal-terms">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("terms.title")}
      </h1>
      <div className="mt-6 flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
        <p>{t("preparing.body")}</p>
        <p className="text-text-muted">{t("preparing.contact")}</p>
      </div>
    </article>
  );
}