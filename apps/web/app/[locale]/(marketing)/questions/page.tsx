import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import { publishedCategories } from "@/lib/answer-engine/publishing";
import { buildStaticQuestionsMetadata, breadcrumbJsonLd, organizationJsonLd } from "@/lib/answer-engine/answer-seo";
import { CHROME, CATEGORY_LABELS, pickL } from "@/lib/answer-engine/chrome";
import { jsonLdScript } from "@/lib/seo/json-ld";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const l = resolveActiveLocale(locale);
  return buildStaticQuestionsMetadata(l, "/questions", pickL(CHROME.hubTitle, l), pickL(CHROME.hubIntro, l));
}

export default async function QuestionsHub({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = resolveActiveLocale(locale);
  const categories = publishedCategories(l);
  const abs = (p: string) => `${MARKETING_ORIGIN}/${l}${p}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10" id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd()) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: pickL(CHROME.breadcrumbHome, l), url: abs("") },
              { name: pickL(CHROME.breadcrumbQuestions, l), url: abs("/questions") },
            ]),
          ),
        }}
      />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary">
          {pickL(CHROME.hubTitle, l)}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{pickL(CHROME.hubIntro, l)}</p>
      </header>

      {categories.length === 0 ? (
        <p className="rounded-md border border-border/60 bg-ink-800/30 p-4 text-sm text-text-muted">
          {pickL(CHROME.hubEmpty, l)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c}>
              <Link
                href={`/questions/category/${c}`}
                className="text-base font-medium text-brand-blue hover:underline"
              >
                {pickL(CATEGORY_LABELS[c], l)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
