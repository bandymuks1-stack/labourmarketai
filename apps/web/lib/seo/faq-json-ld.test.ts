import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

import { faqPageJsonLd } from "./faq-json-ld";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("faqPageJsonLd", () => {
  it("maps each rendered item to a Question with its accepted Answer", () => {
    const ld = faqPageJsonLd(
      [
        { q: "Is it free?", a: "Yes." },
        { q: "Who follows up?", a: "A person." },
      ],
      "en",
    );
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "en",
      mainEntity: [
        { "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Yes." } },
        { "@type": "Question", name: "Who follows up?", acceptedAnswer: { "@type": "Answer", text: "A person." } },
      ],
    });
  });

  it("is never emitted for a single answer or an incomplete list", () => {
    expect(faqPageJsonLd([], "en")).toBeNull();
    expect(faqPageJsonLd([{ q: "One?", a: "Only one." }], "en")).toBeNull();
    expect(
      faqPageJsonLd(
        [
          { q: "A?", a: "Yes." },
          { q: "B?", a: " " },
        ],
        "en",
      ),
    ).toBeNull();
  });
});

describe("FAQPage appears only where the page renders that Q&A list", () => {
  it("role-enrichment and pricing build it from the same items they render", () => {
    const role = read("components/marketing/role-enrichment.tsx");
    expect(role).toContain("faqPageJsonLd(faq,");
    expect(role).toContain("<FAQAccordion items={faq}");
    const pricing = read("app/[locale]/(marketing)/pricing/page.tsx");
    expect(pricing).toContain("faqPageJsonLd(faq,");
    expect(pricing).toContain("{faq.map((item) =>");
  });

  it("no other file emits FAQPage", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && readFileSync(p, "utf8").includes("FAQPage")) {
          hits.push(p.slice(WEB.length + 1).replace(/\\/g, "/"));
        }
      }
    };
    // Every public page and the code that builds its structured data.
    for (const d of ["app/[locale]/(marketing)", "components/marketing", "lib/seo", "lib/answer-engine"]) walk(join(WEB, d));
    expect(hits.sort()).toEqual(["lib/seo/faq-json-ld.ts"]);
  });

  it("every active catalogue has a real list (2+ complete items) on each page that emits it", () => {
    for (const locale of activeLocales) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      for (const items of [j.pricing.faq, j.companies.faq.items, j.agencies.faq.items]) {
        expect(faqPageJsonLd(items, locale), locale).not.toBeNull();
      }
    }
  });
});
