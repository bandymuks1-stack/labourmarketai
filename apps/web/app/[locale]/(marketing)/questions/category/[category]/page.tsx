import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import { ANSWER_CATEGORY_KEYS, type AnswerCategoryKey } from "@/lib/answer-engine/contract";
import { publishedInCategory, publishedCategories } from "@/lib/answer-engine/publishing";
import { buildStaticQuestionsMetadata, breadcrumbJsonLd } from "@/lib/answer-engine/answer-seo";
import { CHROME, CATEGORY_LABELS, pickL } from "@/lib/answer-engine/chrome";
import { activeLocales } from "@/lib/i18n/config";
import { jsonLdScript } from "@/lib/seo/json-ld";

function isCategory(x: string): x is AnswerCategoryKey {
  return (ANSWER_CATEGORY_KEYS as readonly string[]).includes(x);
}

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const l = resolveActiveLocale(params?.locale ?? "lt");
  return publishedCategories(l).map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}): Promise<Metadata> {
  const { locale, category } = await params;
  const l = resolveActiveLocale(locale);
  if (!isCategory(category)) return { robots: { index: false, follow: false } };
  const label = pickL(CATEGORY_LABELS[category], l);
  return buildStaticQuestionsMetadata(
    l,
    `/questions/category/${category}`,
    label,
    `${label} — ${pickL(CHROME.hubIntro, l)}`,
  );
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  const l = resolveActiveLocale(locale);
  if (!isCategory(category)) notFound();
  const items = publishedInCategory(category, l);
  // Never render a thin/empty category page — 404 until it has real content.
  if (items.length === 0) notFound();

  const abs = (p: string) => `${MARKETING_ORIGIN}/${l}${p}`;
  const label = pickL(CATEGORY_LABELS[category], l);
  void activeLocales;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: pickL(CHROME.breadcrumbHome, l), url: abs("") },
              { name: pickL(CHROME.breadcrumbQuestions, l), url: abs("/questions") },
              { name: label, url: abs(`/questions/category/${category}`) },
            ]),
          ),
        }}
      />
      <nav aria-label={pickL(CHROME.breadcrumbAria, l)}>
        <ol className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
          <li><Link href="/questions" className="hover:text-brand-blue hover:underline">{pickL(CHROME.breadcrumbQuestions, l)}</Link></li>
          <li aria-hidden="true">/</li>
          <li><span aria-current="page" className="text-text-secondary">{label}</span></li>
        </ol>
      </nav>

      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">{label}</h1>
      </header>

      <ul className="flex flex-col gap-2">
        {items.map(({ question, answer }) => (
          <li key={question.canonicalQuestionId}>
            <Link
              href={`/questions/${answer.localizedSlug}`}
              className="text-base text-brand-blue hover:underline"
            >
              {answer.h1}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
