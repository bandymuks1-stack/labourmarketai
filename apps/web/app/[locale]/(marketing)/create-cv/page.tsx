import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { TrackedCta } from "@/components/app/tracked-cta";
import { buttonLinkClassName } from "@/components/ui/Button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("createCv", locale, "/create-cv");
}

/**
 * Free CV builder — the worker-acquisition entry (beta train v2 §5-§12).
 *
 * This page is an ENTRY SURFACE, not a CV system: the product already has the
 * whole chain (upload/extract → deterministic section parse → per-fact review
 * → confirm into the profile → /cv render with templates → print-to-PDF), all
 * behind auth. What was missing is a public page an ad can land on that
 * promises exactly what that chain delivers — so the promise here is the
 * free CV, stated honestly:
 *
 *   - the CV is genuinely free: template choice and PDF export sit behind no
 *     paywall (print-to-PDF by deliberate architecture — PDF libs are
 *     CI-banned by verified-cv-honesty);
 *   - extracted facts stay suggestions until the worker confirms them
 *     (cv-section-import-actions), and nothing here claims otherwise;
 *   - profile building and employer discoverability are OPTIONAL, consented
 *     steps — the copy says so, matching the consent ledger doctrine;
 *   - no "AI finds you a job" or any outcome promise.
 *
 * Funnel: `landing_viewed` fires from the marketing layout beacon (audience
 * "workers" via the path map); the CTAs fire `cta_clicked` with stable ids.
 * The signup CTA enters the EXISTING auth → onboarding → profile flow where
 * cv_upload_started / cv_upload_succeeded already instrument the chain.
 */
/**
 * Where "Create my CV — free" actually has to land.
 *
 * `/dashboard/profile` is the surface that mounts `ProfileTextFirstFlow` →
 * `CvInputPanel` → `CvImportUpload`: upload a PDF/DOCX/TXT or paste the text,
 * review every extracted fact, then apply. It is the page this file's own
 * header has always claimed the CTA enters ("the EXISTING auth → onboarding →
 * profile flow"), and the one where `cv_upload_started` / `cv_upload_succeeded`
 * are instrumented.
 *
 * NOT `/cv` — that route is the finished print/PDF sheet. Sending a brand-new
 * account there would show an empty CV and no way to fill it.
 *
 * Carried as `?next=` so it survives signup AND onboarding: `signup-form`
 * sanitises it via `getSafeReturnPath` and re-attaches it to
 * `/onboarding?next=…`, where an attached safe `next` beats the generic
 * dashboard. Without it the CTA loses the one promise this page makes.
 */
const CREATE_CV_NEXT = "/dashboard/profile";

export default async function CreateCvPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.createCv");
  const benefits = t.raw("benefits") as { title: string; body: string }[];
  const steps = t.raw("steps") as { title: string; body: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="signup"
        ctaLabel={t("cta")}
        ctaSource="create_cv_hero"
        ctaNext={CREATE_CV_NEXT}
      />
      <BenefitCards items={benefits} />
      <section className="mx-auto max-w-container px-6 pb-12 sm:px-12">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          {t("stepsTitle")}
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-lg border border-ink-500 p-5"
              data-testid={`create-cv-step-${i + 1}`}
            >
              <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
                {i + 1}
              </p>
              <h3 className="mt-2 font-semibold text-text-primary">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-text-muted">
          {t("privacyNote")}
        </p>
        <div className="mt-8">
          <TrackedCta
            href={`/auth/signup?next=${encodeURIComponent(CREATE_CV_NEXT)}`}
            ctaId="create_cv_footer"
            audience="workers"
            className={buttonLinkClassName()}
          >
            {t("cta")} →
          </TrackedCta>
        </div>
      </section>
    </>
  );
}
