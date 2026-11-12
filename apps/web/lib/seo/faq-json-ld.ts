/**
 * FAQPage structured data — ONLY for a real list of several questions and
 * answers that the page itself renders (decision 0009: "FAQPage only for a
 * real set of several editorial questions on one page"; owner P0 2026-11-10,
 * AEO). The caller passes exactly the items it renders, so the markup can never
 * hold a question the reader cannot see. A single answer is never an FAQPage
 * (the answer-engine pages use Article; lib/guards/answer-engine-publishing-static.test.ts).
 * Pure.
 */

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

/** The FAQPage object, or null when there is no real list (fewer than two complete items). */
export function faqPageJsonLd(items: readonly FaqItem[], inLanguage: string) {
  const complete = items.filter((i) => i.q.trim() !== "" && i.a.trim() !== "");
  if (complete.length < 2 || complete.length !== items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage,
    mainEntity: complete.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}
