/**
 * Answer Engine — Publishing Engine LOGIC + RENDER guards (Wave 1).
 *
 * Mocks the content layer with a small fixture set over REAL registry question
 * IDs, then exercises the real publishing/SEO logic + the real AnswerArticle
 * server component (rendered to static markup) across the 5 active locales.
 * Behavior-neutral. The auth-gated-free /questions surface is public, so the
 * render proof IS the server-render proof.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Loc = "lt" | "en" | "ru" | "nl" | "de";
const LOCALES: Loc[] = ["lt", "en", "ru", "nl", "de"];

function ans(id: string, locale: Loc, slug: string, status = "HUMAN_APPROVED") {
  return {
    canonicalQuestionId: id,
    locale,
    localizedSlug: slug,
    h1: `H1 ${id} ${locale}`,
    shortAnswer: `Short answer ${id} ${locale}.`,
    fullAnswer: [`Full answer paragraph one for ${id} in ${locale}.`],
    title: `Title ${id} ${locale}`,
    description: `Description ${id} ${locale}.`,
    reviewStatus: status,
    reviewDate: "2026-07-18",
    editorialResponsibility: "LabourMarket.ai editorial",
  };
}

// AE-0001 published in all 5 locales; AE-0002 only lt+en; AE-0003 machine draft.
const FIXTURES = [
  ...LOCALES.map((l) => ans("AE-0001", l, `q1-${l}`)),
  ans("AE-0002", "lt", "q2-lt"),
  ans("AE-0002", "en", "q2-en"),
  ans("AE-0003", "lt", "q3-lt", "MACHINE_DRAFT"),
];

vi.mock("@/content/answer-engine/pilot-answers", () => ({ PILOT_ANSWERS: FIXTURES }));
// Wave 2B content is a separate module; keep this fixture-driven test isolated
// from real content so the logic assertions stay pinned to FIXTURES only.
vi.mock("@/content/answer-engine/wave2b-answers", () => ({ WAVE2B_ANSWERS: [] }));
vi.mock("@/content/answer-engine/wave2c-answers", () => ({ WAVE2C_ANSWERS: [] }));
vi.mock("@/content/answer-engine/wave2d-answers", () => ({ WAVE2D_ANSWERS: [] }));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/components/marketing/answer-tracked-link", () => ({
  AnswerTrackedLink: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/components/marketing/answer-analytics", () => ({ AnswerPageViewed: () => null }));

const {
  isIndexable,
  publishedLocales,
  resolveSlug,
  publishedParams,
  relatedPublished,
  publishedInCategory,
} = await import("@/lib/answer-engine/publishing");
const { buildQuestionMetadata, buildAnswerSitemap } = await import("@/lib/answer-engine/answer-seo");
const { getAnswer } = await import("@/lib/answer-engine/publishing");
const { AnswerArticle } = await import("@/components/marketing/answer-article");

const meta = (id: string, l: Loc) => buildQuestionMetadata(getAnswer(id, l)!);

describe("publishing engine — indexability + hreflang + canonical", () => {
  it("1/21. an unknown slug / unpublished locale does not resolve (no English fallback)", () => {
    expect(resolveSlug("does-not-exist", "lt")).toBeNull();
    expect(resolveSlug("q2-en", "ru")).toBeNull(); // AE-0002 not published in ru
    expect(isIndexable("AE-0002", "ru")).toBe(false);
  });

  it("2/3. a MACHINE_DRAFT answer is not indexable and not in the sitemap", () => {
    expect(isIndexable("AE-0003", "lt")).toBe(false);
    const urls = buildAnswerSitemap().map((e) => String(e.url));
    expect(urls.some((u) => u.includes("q3-lt"))).toBe(false);
  });

  it("4/6. hreflang lists ONLY published locales (never a 404)", () => {
    const langs = meta("AE-0002", "lt").alternates?.languages as Record<string, string>;
    expect(Object.keys(langs).sort()).toEqual(["en", "lt", "x-default"]); // not ru/nl/de
  });

  it("5. hreflang is reciprocal across all published locales", () => {
    const langs = meta("AE-0001", "en").alternates?.languages as Record<string, string>;
    for (const l of LOCALES) expect(langs[l]).toContain(`/${l}/questions/q1-${l}`);
    expect(langs["x-default"]).toContain("/lt/questions/q1-lt");
  });

  it("7. canonical is self-referential (this locale, not the source language)", () => {
    const canon = meta("AE-0001", "en").alternates?.canonical as string;
    expect(canon).toContain("/en/questions/q1-en");
    expect(canon).not.toContain("/lt/questions");
  });

  it("robots index true only for a published page", () => {
    expect((meta("AE-0001", "lt").robots as { index: boolean }).index).toBe(true);
  });
});

describe("publishing engine — related, categories, sitemap", () => {
  it("12. related questions are real published pages only, never self or drafts", () => {
    const related = relatedPublished("AE-0001", "lt").map((r) => r.question.canonicalQuestionId);
    expect(related).toContain("AE-0002");
    expect(related).not.toContain("AE-0003"); // machine draft
    expect(related).not.toContain("AE-0001"); // never self
  });

  it("13. a category lists only its published questions", () => {
    const ids = publishedInCategory("job_search_discovery", "lt").map((x) => x.question.canonicalQuestionId);
    expect(ids).toContain("AE-0001");
    expect(ids).toContain("AE-0002");
    expect(ids).not.toContain("AE-0003");
  });

  it("19/20. sitemap holds only indexable pairs; a partial-locale question is per-locale", () => {
    const urls = buildAnswerSitemap().map((e) => String(e.url));
    expect(urls.length).toBeLessThanOrEqual(200);
    // AE-0002 is published lt+en only → its ru/nl/de URLs are absent.
    expect(urls.some((u) => u.includes("q2-lt"))).toBe(true);
    expect(urls.some((u) => u.includes("q2-en"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/ru/questions/q2-en"))).toBe(false);
    // every entry corresponds to a published param
    const pub = new Set(publishedParams().map((p) => `${p.locale}:${p.slug}`));
    for (const e of buildAnswerSitemap()) {
      const m = String(e.url).match(/\/([a-z]{2})\/questions\/(.+)$/);
      expect(pub.has(`${m?.[1]}:${m?.[2]}`)).toBe(true);
    }
  });
});

describe("publishing engine — server-render proof (all 5 active locales)", () => {
  it.each(LOCALES)("9/11/26. %s renders the answer + H1 + JSON-LD Article in the initial HTML", (l) => {
    const html = renderToStaticMarkup(createElement(AnswerArticle, { id: "AE-0001", locale: l }));
    expect(html).toContain(`H1 AE-0001 ${l}`); // localized H1 present
    expect(html).toContain(`Short answer AE-0001 ${l}.`); // short answer in HTML
    expect(html).toContain(`Full answer paragraph one for AE-0001 in ${l}.`); // full answer in HTML
    expect(html).toContain('"@type":"Article"'); // single-answer JSON-LD is Article
    expect(html).not.toContain("QAPage");
    expect(html).not.toContain("FAQPage");
    expect(html).toContain("<h1"); // semantic heading
  });

  it("17. structured-data headline matches the visible H1", () => {
    const html = renderToStaticMarkup(createElement(AnswerArticle, { id: "AE-0001", locale: "lt" }));
    expect(html).toContain('"headline":"H1 AE-0001 lt"');
  });

  it("8. every published param locale is one of the 5 active locales", () => {
    for (const p of publishedParams()) expect(LOCALES).toContain(p.locale);
    expect(publishedLocales("AE-0001").sort()).toEqual([...LOCALES].sort());
  });
});
