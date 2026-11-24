/**
 * Answer Engine — non-ASCII slug resolution (real content, no mocks).
 *
 * Regression: Next 15 passes the PERCENT-ENCODED dynamic segment to a page
 * during static prerender, so `/nl/questions/...-privé-...` resolved to null and
 * was prerendered (and served, dynamicParams=false) as a 404. Every published
 * slug must resolve from its raw, percent-encoded and NFD forms alike.
 */
import { describe, it, expect } from "vitest";
import { publishedParams, resolveSlug, normalizeSlug } from "@/lib/answer-engine/publishing";

describe("answer engine — slug encoding", () => {
  const params = publishedParams();

  it("every published slug resolves raw, percent-encoded and NFD", () => {
    for (const p of params) {
      for (const form of [p.slug, encodeURIComponent(p.slug), p.slug.normalize("NFD")]) {
        expect(resolveSlug(form, p.locale)?.canonicalQuestionId, `${p.locale} ${form}`).toBe(p.id);
      }
    }
  });

  it("the known non-ASCII NL slug resolves from its prerender (encoded) form", () => {
    const nl = params.find((p) => p.locale === "nl" && /[^\x00-\x7F]/.test(p.slug));
    expect(nl, "fixture slug still non-ASCII").toBeDefined();
    expect(resolveSlug(encodeURIComponent(nl!.slug), "nl")).not.toBeNull();
  });

  it("a malformed escape does not throw and does not resolve", () => {
    expect(() => normalizeSlug("bad-%E0%A4%A")).not.toThrow();
    expect(resolveSlug("bad-%E0%A4%A", "nl")).toBeNull();
  });
});
