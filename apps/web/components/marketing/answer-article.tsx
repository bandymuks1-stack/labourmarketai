/**
 * Answer Engine — the single-question answer page (server-rendered).
 *
 * Renders the full contract from the registry + localized answer layer: H1,
 * short direct answer first, full answer, practical steps, limitations, country
 * scope, sources, review date + editorial responsibility, related questions,
 * category link, breadcrumb, real CTA (or none), and Article + BreadcrumbList +
 * Organization JSON-LD (a single editorial answer uses Article only, never a
 * Q&A-page schema type). Fully in the initial HTML — no
 * client fetch, no login. Semantic landmarks + keyboard-navigable links.
 */
import { Link } from "@/lib/i18n/navigation";
import type { ActiveLocale } from "@/lib/i18n/config";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import {
  getAnswer,
  getRegistryQuestion,
  relatedPublished,
} from "@/lib/answer-engine/publishing";
import { CHROME, CATEGORY_LABELS, CTA_FOR_CAPABILITY, pickL } from "@/lib/answer-engine/chrome";
import {
  answerArticleJsonLd,
  breadcrumbJsonLd,
  organizationJsonLd,
} from "@/lib/answer-engine/answer-seo";
import { jsonLdScript } from "@/lib/seo/json-ld";
import { AnswerTrackedLink } from "@/components/marketing/answer-tracked-link";
import { AnswerPageViewed } from "@/components/marketing/answer-analytics";

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // JSON-LD is inert DATA — but only once `<` is escaped. Plain
      // JSON.stringify leaves `</script>` intact inside a string value, which
      // closes the block early and executes the remainder (audit L-05).
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}

export function AnswerArticle({ id, locale }: { id: string; locale: ActiveLocale }) {
  const answer = getAnswer(id, locale);
  const question = getRegistryQuestion(id);
  if (!answer || !question) return null;

  const category = question.category;
  const catLabel = pickL(CATEGORY_LABELS[category], locale);
  const catPath = `/questions/category/${category}`;
  const abs = (p: string) => `${MARKETING_ORIGIN}/${locale}${p}`;

  const crumbs = [
    { name: pickL(CHROME.breadcrumbHome, locale), path: "/", url: abs("") },
    { name: pickL(CHROME.breadcrumbQuestions, locale), path: "/questions", url: abs("/questions") },
    { name: catLabel, path: catPath, url: abs(catPath) },
    { name: answer.h1, path: `/questions/${answer.localizedSlug}`, url: abs(`/questions/${answer.localizedSlug}`) },
  ];

  const related = relatedPublished(id, locale, 8);
  const cta = CTA_FOR_CAPABILITY[question.relatedProductCapability] ?? null;
  // Public "Sources" list = official answer evidence sources (shown with a
  // readable title + publisher) PLUS any url-bearing registry sourceReferences,
  // deduplicated by URL. Discovery signals are editorial-only and never shown.
  const sourceLinks: { href: string; label: string }[] = [];
  const seenSourceHrefs = new Set<string>();
  for (const s of answer.evidenceSources ?? []) {
    if (seenSourceHrefs.has(s.url)) continue;
    seenSourceHrefs.add(s.url);
    sourceLinks.push({ href: s.url, label: `${s.title} — ${s.publisher}` });
  }
  for (const s of question.sourceReferences) {
    if (!s.url || seenSourceHrefs.has(s.url)) continue;
    seenSourceHrefs.add(s.url);
    sourceLinks.push({ href: s.url, label: s.id });
  }
  const showLegalNote = question.riskLevel === "HIGH" || Boolean(answer.countryScope);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <AnswerPageViewed category={category} />
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: c.url })))} />
      <JsonLd data={answerArticleJsonLd(answer)} />

      <nav aria-label={pickL(CHROME.breadcrumbAria, locale)}>
        <ol className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
          {crumbs.map((c, i) => (
            <li key={c.path} className="flex items-center gap-1">
              {i < crumbs.length - 1 ? (
                <Link href={c.path} className="hover:text-brand-blue hover:underline">{c.name}</Link>
              ) : (
                <span aria-current="page" className="text-text-secondary">{c.name}</span>
              )}
              {i < crumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
            </li>
          ))}
        </ol>
      </nav>

      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            <Link href={catPath} className="hover:text-brand-blue hover:underline">{catLabel}</Link>
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
            {answer.h1}
          </h1>
        </header>

        <section aria-label={pickL(CHROME.shortAnswer, locale)} className="rounded-lg border border-border/60 bg-ink-800/30 p-4">
          <p className="text-meta font-semibold uppercase tracking-label text-text-muted">
            {pickL(CHROME.shortAnswer, locale)}
          </p>
          <p className="mt-1 text-base leading-relaxed text-text-primary">{answer.shortAnswer}</p>
        </section>

        <div className="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
          {answer.fullAnswer.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {answer.practicalActions && answer.practicalActions.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-text-primary">{pickL(CHROME.practicalSteps, locale)}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-secondary">
              {answer.practicalActions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </section>
        ) : null}

        {answer.countryScope ? (
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">{pickL(CHROME.countryScope, locale)}</h2>
            <p className="text-sm text-text-secondary">{answer.countryScope}</p>
          </section>
        ) : null}

        {answer.limitations ? (
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">{pickL(CHROME.limitations, locale)}</h2>
            <p className="text-sm text-text-secondary">{answer.limitations}</p>
          </section>
        ) : null}

        {showLegalNote ? (
          <p className="rounded-md border border-state-amber/30 bg-state-amber/5 p-2 text-xs text-state-amber">
            {pickL(CHROME.notLegalAdvice, locale)}
          </p>
        ) : null}

        {cta ? (
          <div>
            <AnswerTrackedLink
              href={cta.href}
              event="answer_product_cta_clicked"
              category={category}
              className="inline-flex rounded-md border border-brand-blue/50 px-3 py-1.5 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
            >
              {pickL(cta.label, locale)}
            </AnswerTrackedLink>
          </div>
        ) : null}

        {sourceLinks.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">{pickL(CHROME.sources, locale)}</h2>
            <ul className="flex flex-col gap-1 text-xs text-text-secondary">
              {sourceLinks.map((s) => (
                <li key={s.href}>
                  <AnswerTrackedLink href={s.href} event="answer_source_opened" category={category} external className="text-brand-blue hover:underline">
                    {s.label}
                  </AnswerTrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="flex flex-col gap-1 border-t border-border/40 pt-3 text-meta text-text-muted">
          <span>{pickL(CHROME.lastReviewed, locale)}: <time dateTime={answer.reviewDate}>{answer.reviewDate}</time></span>
          <span>{pickL(CHROME.editorialBy, locale)}: {answer.editorialResponsibility}</span>
        </footer>
      </article>

      {related.length > 0 ? (
        <nav aria-label={pickL(CHROME.related, locale)} className="flex flex-col gap-2 border-t border-border/40 pt-4">
          <h2 className="text-sm font-semibold text-text-primary">{pickL(CHROME.related, locale)}</h2>
          <ul className="flex flex-col gap-1.5">
            {related.map((r) => (
              <li key={r.question.canonicalQuestionId}>
                <AnswerTrackedLink href={`/questions/${r.answer.localizedSlug}`} event="answer_related_question_opened" category={category} className="text-sm text-brand-blue hover:underline">
                  {r.answer.h1}
                </AnswerTrackedLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </main>
  );
}
