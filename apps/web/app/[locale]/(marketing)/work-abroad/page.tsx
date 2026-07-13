import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { Link } from "@/lib/i18n/navigation";
import { AuthCtaLink } from "@/components/layouts/auth-cta-link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("workAbroad", locale, "/work-abroad");
}

/**
 * Foreign-worker funnel (Staffing Operating Model v1, PR3). An honest overview
 * of the agency operating model for a worker: the chain (intake → structured
 * profile draft → readiness → match → interest loop), what may be needed, and
 * CTAs into the existing profile / readiness / trades surfaces. No fake jobs,
 * no wage promises, no legal guarantee — copy lives in the `workAbroad` i18n
 * namespace (en/lt/ru). The old `workAbroad.aiNote` claimed help with no
 * model behind it (audit §4) and is no longer rendered; `structuredNote`
 * states the real deterministic capability instead.
 */
export default async function WorkAbroadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workAbroad");
  const steps = t.raw("steps") as { title: string; body: string }[];
  const needItems = t.raw("needItems") as string[];

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12" id="main-content">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-label text-brand-blue">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tightest text-text-primary sm:text-5xl">
          {t("title")}{" "}
          <span className="text-brand-blue">{t("titleAccent")}</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary sm:text-base">
          {t("subcopy")}
        </p>
      </header>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {t("stepsTitle")}
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={i}
              className="rounded-2xl border border-border-subtle bg-surface-1 p-5"
            >
              <h3 className="font-display text-base font-semibold text-text-primary">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary">
            {t("needTitle")}
          </h2>
          <ul className="mt-5 space-y-2">
            {needItems.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-text-secondary"
              >
                <span aria-hidden className="text-brand-blue">
                  •
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface-1 p-6">
          <h2 className="font-display text-xl font-bold text-text-primary">
            {t("directionsTitle")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            {t("directionsNote")}
          </p>
          <Link
            href="/labour-market"
            className="mt-4 inline-block font-mono text-[11px] uppercase tracking-label text-brand-blue hover:text-brand-cyan"
          >
            {t("directionsCta")} →
          </Link>
        </div>
      </section>

      {/* Honest capability statement: CV text is structured by the
          deterministic extractor and every suggestion is human-confirmed.
          No model runs behind this page, so no AI claim is made. */}
      <p className="mt-10 rounded-xl border border-border-subtle bg-surface-2 p-4 text-xs leading-relaxed text-text-secondary">
        {t("structuredNote")}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {/* Public visitors go to signup (a real entry), not straight into the
            auth-walled /onboarding redirect bounce. AuthCtaLink so the CTA
            crosses to the app host from apex (PKCE-safe OAuth origin). */}
        <AuthCtaLink
          relPath={`/${locale}/auth/signup`}
          className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {t("ctaProfile")}
        </AuthCtaLink>
        <Link
          href="/labour-market"
          className="rounded-full border border-border-subtle px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-1"
        >
          {t("ctaReadiness")}
        </Link>
        <Link
          href="/for-workers"
          className="rounded-full border border-border-subtle px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-1"
        >
          {t("ctaTrades")}
        </Link>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-text-muted">
        {t("disclaimer")}
      </p>
    </div>
  );
}
