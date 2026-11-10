import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { TrackedCta } from "@/components/app/tracked-cta";
import { buttonLinkClassName } from "@/components/ui/Button";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import { breadcrumbJsonLd } from "@/lib/answer-engine/answer-seo";
import { jsonLdScript } from "@/lib/seo/json-ld";
import { BRAND_NAME, brandedTitle, localizedUrl, OG_IMAGE_SIZE } from "@/lib/seo/metadata";
import { GUIDE_CHROME } from "@/content/worker-guides/professions";
import { GUIDE_SOURCES_CHECKED_AT } from "@/content/worker-guides/countries";
import {
  GUIDE_BASE_PATH,
  GUIDE_OG_LOCALE,
  GUIDE_PROFESSIONS,
  GUIDE_SIGNUP_NEXT,
  WORKER_GUIDES,
  guideHreflang,
  guideUrl,
  parentCountryGuide,
  relatedCountryGuides,
  relatedProfessionGuides,
  resolveWorkerGuide,
} from "@/lib/seo/worker-guides";

/**
 * /{locale}/work-abroad/{guide} — a worker acquisition guide (owner P0
 * 2026-11-09). One page per country, and per profession × country only where
 * the profession has something true and specific in that country. Content,
 * routing and hreflang rules live in lib/seo/worker-guides.ts; the copy in
 * content/worker-guides/. Every guide ends in the existing worker sign-up and
 * the existing public job board — no second intake, no second board.
 */
type Params = { readonly params: Promise<{ locale: string; guide: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return WORKER_GUIDES.map((g) => ({ locale: g.homeLocale, guide: g.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, guide } = await params;
  const g = resolveWorkerGuide(locale, guide);
  if (!g) return { robots: { index: false, follow: false } };
  const url = guideUrl(g);
  const title = brandedTitle(g.title);
  const shareImage = {
    url: localizedUrl(g.homeLocale, "/opengraph-image"),
    width: OG_IMAGE_SIZE.width,
    height: OG_IMAGE_SIZE.height,
    alt: BRAND_NAME,
  };
  return {
    title,
    description: g.description,
    alternates: { canonical: url, languages: guideHreflang(g) },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: BRAND_NAME,
      title,
      description: g.description,
      url,
      locale: GUIDE_OG_LOCALE[g.language],
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", title, description: g.description, images: [shareImage] },
  };
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Escaped serialization — never plain JSON.stringify (audit L-05).
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}

const SECTION = "mt-10";
const H2 = "font-display text-2xl font-bold text-text-primary";
const BULLETS = "mt-4 space-y-2";
const BULLET = "flex gap-2 text-sm leading-relaxed text-text-secondary";
const TEXT_LINK = "text-sm font-semibold text-brand-blue hover:text-brand-champagne";

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className={BULLETS}>
      {items.map((item) => (
        <li key={item} className={BULLET}>
          <span aria-hidden className="text-brand-blue">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function WorkerGuidePage({ params }: Params) {
  const { locale, guide } = await params;
  const g = resolveWorkerGuide(locale, guide);
  if (!g) notFound();
  setRequestLocale(locale);

  const chrome = GUIDE_CHROME[g.language];
  const countryCopy = g.country[g.language];
  const parent = parentCountryGuide(g);
  const relatedCountries = relatedCountryGuides(g);
  const relatedProfession = relatedProfessionGuides(g);
  const jobsSlug = g.profession?.jobsSlug ?? null;
  const jobsHref = jobsSlug ? `/jobs?profession=${encodeURIComponent(jobsSlug)}` : "/jobs";
  const signupHref = `/auth/signup?next=${encodeURIComponent(GUIDE_SIGNUP_NEXT)}`;
  const ctaAudience = `workers_guide_${g.language}`;

  const crumbs = [
    { name: chrome.breadcrumbHome, url: `${MARKETING_ORIGIN}/${g.homeLocale}` },
    { name: chrome.breadcrumbHub, url: localizedUrl(g.homeLocale, GUIDE_BASE_PATH) },
    ...(parent ? [{ name: parent.h1, url: guideUrl(parent) }] : []),
    { name: g.h1, url: guideUrl(g) },
  ];
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.h1,
    description: g.description,
    inLanguage: g.language,
    url: guideUrl(g),
    mainEntityOfPage: guideUrl(g),
    dateModified: GUIDE_SOURCES_CHECKED_AT,
    about: [
      { "@type": "Country", name: countryCopy.name },
      ...(g.profession ? [{ "@type": "Occupation", name: g.profession[g.language].name }] : []),
    ],
    author: { "@type": "Organization", "@id": `${MARKETING_ORIGIN}/#organization`, name: BRAND_NAME },
    publisher: { "@type": "Organization", "@id": `${MARKETING_ORIGIN}/#organization`, name: BRAND_NAME },
    citation: g.sources.map((s) => ({ "@type": "CreativeWork", name: s.label, url: s.url })),
  };

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12" id="main-content">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={article} />

      <article lang={g.language} data-guide-key={g.key} data-guide-language={g.language}>
        <nav aria-label={chrome.breadcrumbHub} className="font-mono text-meta uppercase tracking-label">
          <Link href={GUIDE_BASE_PATH} className="text-brand-blue hover:text-brand-champagne">
            ← {chrome.breadcrumbHub}
          </Link>
          {parent && (
            <>
              <span aria-hidden className="mx-2 text-text-muted">
                /
              </span>
              <Link href={parent.path} className="text-brand-blue hover:text-brand-champagne">
                {countryCopy.name}
              </Link>
            </>
          )}
        </nav>

        <header className="mt-6 max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
            {chrome.eyebrow}
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-text-primary sm:text-5xl">
            {g.h1}
          </h1>
          <div className="mt-6 rounded-card border border-border-subtle bg-surface-1 p-5">
            <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {chrome.shortAnswer}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-text-primary sm:text-base">{g.lede}</p>
          </div>
          {chrome.uiLanguageNote && (
            <p className="mt-4 text-xs leading-relaxed text-text-muted">{chrome.uiLanguageNote}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <TrackedCta
              href={signupHref}
              ctaId={`guide_register_${g.language}`}
              audience={ctaAudience}
              className={buttonLinkClassName()}
            >
              {chrome.ctaRegister} →
            </TrackedCta>
            <TrackedCta
              href={jobsHref}
              ctaId={`guide_jobs_${g.language}`}
              audience={ctaAudience}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-1"
            >
              {chrome.ctaJobs}
            </TrackedCta>
          </div>
        </header>

        <div className="mt-4 grid gap-10 lg:grid-cols-2">
          <section className={SECTION}>
            <h2 className={H2}>{chrome.rightsTitle}</h2>
            <Bullets items={[...chrome.euRules, ...countryCopy.rights]} />
          </section>
          <section className={SECTION}>
            <h2 className={H2}>{chrome.onSiteTitle}</h2>
            <Bullets items={countryCopy.onSite} />
          </section>
        </div>

        {g.professionNotes.length > 0 && (
          <section className={SECTION}>
            <h2 className={H2}>{chrome.professionTitle(countryCopy.inName)}</h2>
            <Bullets items={g.professionNotes} />
          </section>
        )}

        <section className={SECTION}>
          <h2 className={H2}>{chrome.journeyTitle}</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chrome.journey.map((step, i) => (
              <li key={step} className="rounded-card border border-border-subtle bg-surface-1 p-4">
                <p className="font-mono text-meta uppercase tracking-label text-text-secondary">{i + 1}</p>
                <p className="mt-2 text-sm leading-relaxed text-text-primary">{step}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-text-muted">{chrome.jobsNote}</p>
          <div className="mt-6">
            <TrackedCta
              href={signupHref}
              ctaId={`guide_register_footer_${g.language}`}
              audience={ctaAudience}
              className={buttonLinkClassName()}
            >
              {chrome.ctaRegister} →
            </TrackedCta>
          </div>
        </section>

        {!g.profession && (
          <section className={SECTION}>
            <h2 className={H2}>{chrome.professionsTitle}</h2>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">{chrome.professionsNote}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {GUIDE_PROFESSIONS.map((p) => (
                <li key={p.key}>
                  <Link
                    href={p.jobsSlug ? `/jobs?profession=${encodeURIComponent(p.jobsSlug)}` : "/jobs"}
                    className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-4 py-2 text-sm text-text-primary hover:bg-surface-1"
                  >
                    {p[g.language].name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={SECTION}>
          <h2 className={H2}>{chrome.faqTitle}</h2>
          <dl className="mt-4 space-y-4">
            {chrome.faq.map((item) => (
              <div key={item.q} className="rounded-card border border-border-subtle bg-surface-1 p-4">
                <dt className="text-sm font-semibold text-text-primary">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-text-secondary">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {relatedProfession.length > 0 && (
          <section className={SECTION}>
            <h2 className={H2}>{chrome.relatedProfessionTitle}</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {relatedProfession.map((o) => (
                <li key={o.key}>
                  <Link href={o.path} className={TEXT_LINK}>
                    {o.h1} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={SECTION}>
          <h2 className={H2}>{chrome.relatedCountriesTitle}</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {relatedCountries.map((o) => (
              <li key={o.key}>
                <Link href={o.path} className={TEXT_LINK}>
                  {o.country[o.language].name} →
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>{chrome.sourcesTitle}</h2>
          <ul className="mt-4 space-y-2">
            {g.sources.map((s) => (
              <li key={s.url} className="text-sm">
                <a
                  href={s.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="break-words text-brand-blue hover:text-brand-champagne"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-text-muted">
            {chrome.sourcesNote(GUIDE_SOURCES_CHECKED_AT)}
          </p>
        </section>

        <footer className="mt-10 space-y-2 border-t border-border-subtle pt-6 text-xs leading-relaxed text-text-muted">
          <p>{chrome.disclaimer}</p>
          <p>{chrome.reviewNote}</p>
        </footer>
      </article>
    </div>
  );
}
