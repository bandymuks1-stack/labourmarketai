import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  IP_OWNER,
  PLATFORM_OPERATOR,
  PRIVACY_CONTACT_EMAIL,
} from "@/lib/legal/entity-identity";

/**
 * Canonical legal notice / imprint (legal-entity truth v1).
 *
 * Entity data renders from the single verified source module
 * (lib/legal/entity-identity.ts — values checked against KRS, the MF VAT
 * White List, VIES and the Lithuanian RC open data on 2026-07-11; see
 * docs/legal/corporate-identity-source-of-truth-v1.md). Labels come from
 * i18n. Deliberately NO bank accounts, personal codes or private data.
 * Guarded by legal-entity-truth.test.ts.
 */
export default async function LegalNoticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.legalNotice");

  const row = (label: string, value: string, testid?: string) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-48 shrink-0 text-text-muted">{label}</dt>
      <dd className="text-text-primary" data-testid={testid}>
        {value}
      </dd>
    </div>
  );

  return (
    <article
      className="mx-auto max-w-3xl px-6 py-16 sm:px-12"
      data-testid="legal-notice"
    >
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-text-secondary">
        {t("intro")}
      </p>

      {/* Platform operator and seller */}
      <section className="mt-10" data-testid="legal-notice-operator">
        <h2 className="font-display text-xl font-semibold text-text-primary">
          {t("operatorHeading")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {t("operatorRole")}
        </p>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          {row(t("companyCode"), `${PLATFORM_OPERATOR.name} · ${PLATFORM_OPERATOR.companyCode}`, "operator-code")}
          {row(t("vatCode"), PLATFORM_OPERATOR.vatCode)}
          {row(
            t("registeredOffice"),
            `${PLATFORM_OPERATOR.address.street}, ${PLATFORM_OPERATOR.address.city}, ${PLATFORM_OPERATOR.address.country}`,
          )}
          {row(t("email"), PRIVACY_CONTACT_EMAIL)}
          {row(t("businessEmail"), PLATFORM_OPERATOR.businessEmail)}
          {row(t("representedBy"), `${PLATFORM_OPERATOR.director}, ${t("director")}`)}
        </dl>
      </section>

      {/* IP owner and licensor */}
      <section className="mt-10" data-testid="legal-notice-ip-owner">
        <h2 className="font-display text-xl font-semibold text-text-primary">
          {t("ipOwnerHeading")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {t("ipOwnerRole")}
        </p>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          {row(t("krs"), `${IP_OWNER.name} · KRS ${IP_OWNER.krs}`, "ip-owner-krs")}
          {row(t("nip"), IP_OWNER.nip)}
          {row(t("regon"), IP_OWNER.regon)}
          {row(t("euVat"), IP_OWNER.euVat)}
          {row(
            t("registeredOffice"),
            `${IP_OWNER.address.street}, ${IP_OWNER.address.city}, ${IP_OWNER.address.country}`,
          )}
          {row(t("representation"), IP_OWNER.representationMethod)}
        </dl>
      </section>

      <section className="mt-10 border-t border-ink-600/60 pt-6 text-sm leading-relaxed text-text-secondary">
        <p data-testid="legal-notice-dpo">{t("dpoLine")}</p>
        <p className="mt-2 text-text-muted">{t("openSourceNote")}</p>
      </section>
    </article>
  );
}
