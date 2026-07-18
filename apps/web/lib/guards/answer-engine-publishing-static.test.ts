/**
 * Answer Engine — Publishing Engine STATIC/scan guards (real modules, no mocks).
 * Behavior-neutral. Covers the source-scan + real-content invariants; the
 * fixture-driven logic + render proofs live in answer-engine-publishing.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ANSWER_ENGINE_LOCALES } from "@/lib/answer-engine/contract";
import { CHROME, CATEGORY_LABELS, CTA_FOR_CAPABILITY } from "@/lib/answer-engine/chrome";
import { RESERVED_QUESTION_SLUGS, publishedParams } from "@/lib/answer-engine/publishing";
import { ANSWER_SITEMAP_MAX } from "@/lib/answer-engine/answer-seo";
import { PILOT_ANSWERS } from "@/content/answer-engine/pilot-answers";
import { ANSWER_QUESTIONS } from "@/lib/answer-engine/registry";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

const ACTIVE = ["de", "en", "lt", "nl", "ru"];
const registryById = new Map(ANSWER_QUESTIONS.map((q) => [q.canonicalQuestionId, q]));

describe("publishing engine — static invariants", () => {
  it("14. every CTA points at a real existing public marketing route", () => {
    for (const [cap, cta] of Object.entries(CTA_FOR_CAPABILITY)) {
      if (!cta) continue;
      expect(cta.href.startsWith("/"), `${cap} href`).toBe(true);
      const seg = cta.href.replace(/^\//, "");
      const p = resolve(webRoot, "app/[locale]/(marketing)", seg, "page.tsx");
      expect(existsSync(p), `route for ${cap}: ${cta.href}`).toBe(true);
    }
  });

  it("15/16. no single answer page uses QAPage, and no FAQPage misuse", () => {
    for (const rel of [
      "components/marketing/answer-article.tsx",
      "lib/answer-engine/answer-seo.ts",
      "app/[locale]/(marketing)/questions/page.tsx",
      "app/[locale]/(marketing)/questions/category/[category]/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/QAPage/);
      expect(src).not.toMatch(/FAQPage/);
    }
    // The single-answer JSON-LD is an Article.
    expect(read("lib/answer-engine/answer-seo.ts")).toMatch(/"@type":\s*"Article"/);
  });

  it("18. structured data has no fake author / review / rating", () => {
    const src = read("lib/answer-engine/answer-seo.ts");
    expect(src).not.toMatch(/aggregateRating|reviewCount|ratingValue|"review"/i);
    // author/publisher are the Organization, never a fabricated person.
    expect(src).toMatch(/author:\s*\{\s*"@type":\s*"Organization"/);
  });

  it("22. no locale-key leakage: chrome + category labels cover all 5 active locales", () => {
    for (const [k, map] of Object.entries(CHROME)) {
      expect(Object.keys(map).sort(), `CHROME.${k}`).toEqual(ACTIVE);
    }
    for (const [k, map] of Object.entries(CATEGORY_LABELS)) {
      expect(Object.keys(map).sort(), `CATEGORY_LABELS.${k}`).toEqual(ACTIVE);
    }
  });

  it("23. analytics payload carries only bounded, PII-free keys", () => {
    for (const rel of [
      "components/marketing/answer-analytics.tsx",
      "components/marketing/answer-tracked-link.tsx",
    ]) {
      const src = read(rel);
      const calls = src.match(/recordEvent\([^;]*?\)/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(c).toMatch(/surface:\s*"answer_page"/);
        expect(c).not.toMatch(/skill|profile|cv|question|answer[A-Z]|email|name|phone/i);
      }
    }
  });

  it("24. IndexNow adapter is server-only with no hardcoded key, not in any client bundle", () => {
    const src = read("lib/answer-engine/indexnow.ts");
    expect(src).toMatch(/^import "server-only";/m);
    expect(src).toMatch(/process\.env\.INDEXNOW_KEY/);
    // No hardcoded key assignment.
    expect(src).not.toMatch(/INDEXNOW_KEY\s*=\s*["'][^"']+["']/);
    // No "use client" file imports the adapter.
    for (const rel of [
      "components/marketing/answer-analytics.tsx",
      "components/marketing/answer-tracked-link.tsx",
    ]) {
      expect(read(rel)).not.toMatch(/answer-engine\/indexnow/);
    }
  });

  it("25. robots does not block the questions surface (and it is public)", () => {
    const robots = read("app/robots.ts");
    expect(robots).not.toMatch(/disallow[^]*questions/i);
    expect(robots).toContain('allow: "/"');
    // The routes live under (marketing) — public, not behind the auth disallow.
    expect(existsSync(resolve(webRoot, "app/[locale]/(marketing)/questions/page.tsx"))).toBe(true);
  });

  it("27. category route is prefixed and 'category' is a reserved question slug (no collision)", () => {
    expect(RESERVED_QUESTION_SLUGS.has("category")).toBe(true);
    expect(RESERVED_QUESTION_SLUGS.has("sitemap")).toBe(true);
    // No category key can be taken as a question slug.
    for (const key of Object.keys(CATEGORY_LABELS)) {
      expect(RESERVED_QUESTION_SLUGS.has(key)).toBe(false); // categories live under /category/<key>
    }
    expect(existsSync(resolve(webRoot, "app/[locale]/(marketing)/questions/category/[category]/page.tsx"))).toBe(true);
  });

  it("28. no second professions/skills taxonomy is declared", () => {
    for (const rel of [
      "lib/answer-engine/publishing.ts",
      "lib/answer-engine/chrome.ts",
      "lib/answer-engine/answer-seo.ts",
    ]) {
      expect(read(rel)).not.toMatch(/\bPROFESSION_SKILLS\b\s*[:=]|const\s+PROFESSIONS\s*[:=]/);
    }
  });

  it("29. pilot content stays within the Wave 1 limit (<=10 questions, <=50 pages)", () => {
    const ids = new Set(PILOT_ANSWERS.map((a) => a.canonicalQuestionId));
    expect(ids.size).toBeLessThanOrEqual(10);
    expect(PILOT_ANSWERS.length).toBeLessThanOrEqual(50);
  });

  it("30. no HIGH-risk question is in the Wave 1 pilot", () => {
    for (const a of PILOT_ANSWERS) {
      const q = registryById.get(a.canonicalQuestionId);
      expect(q, a.canonicalQuestionId).toBeTruthy();
      expect(q?.riskLevel, a.canonicalQuestionId).not.toBe("HIGH");
    }
  });

  it("sitemap lists every indexable page (no truncation) within the sitemaps.org limit; 5 active locales", () => {
    // The cap is a safety ceiling (sitemaps.org 50,000/file), not a content cap:
    // it must never truncate the real published set.
    expect(ANSWER_SITEMAP_MAX).toBeLessThanOrEqual(50000);
    expect(ANSWER_SITEMAP_MAX).toBeGreaterThanOrEqual(publishedParams().length);
    expect([...ANSWER_ENGINE_LOCALES].sort()).toEqual(ACTIVE);
  });
});
