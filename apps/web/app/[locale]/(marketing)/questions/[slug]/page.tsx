import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { resolveSlug, publishedParams } from "@/lib/answer-engine/publishing";
import { buildQuestionMetadata } from "@/lib/answer-engine/answer-seo";
import { AnswerArticle } from "@/components/marketing/answer-article";

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const l = resolveActiveLocale(params?.locale ?? "lt");
  return publishedParams()
    .filter((p) => p.locale === l)
    .map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const l = resolveActiveLocale(locale);
  const answer = resolveSlug(slug, l);
  if (!answer) return { robots: { index: false, follow: false } };
  return buildQuestionMetadata(answer);
}

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const l = resolveActiveLocale(locale);
  const answer = resolveSlug(slug, l);
  // Not published in this locale (or reserved slug) → 404, never a thin/empty
  // page and never an English fallback.
  if (!answer) notFound();
  return <AnswerArticle id={answer.canonicalQuestionId} locale={l} />;
}
