import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * A CTA THAT NAVIGATES IS THE ANCHOR — NEVER A <button> INSIDE ONE.
 *
 * The acquisition funnel shipped `<Link><Button>label</Button></Link>` at 14
 * call sites. Measured on /lt/create-cv at 320-1440px (2026-08-11):
 *
 *     a      "Kurti mano CV — nemokamai →"  264x20   display:inline
 *     button "Kurti mano CV — nemokamai →"  264x44   display:inline-flex
 *
 * The 44px-looking control is a <button> that navigates nothing. The element
 * that actually navigates — announced as the link, and the FIRST of the two
 * tab stops the pair creates — was a 20px inline box with no focus-visible
 * ring, because every style sat on the button inside it. Interactive content
 * inside an <a> is invalid HTML too, so the DOM the browser builds is not the
 * one the JSX suggests.
 *
 * WHY THIS GUARD EXISTS SEPARATELY FROM THE BROWSER SPEC.
 * tests/e2e/acquisition-cta-touch-floor.spec.ts measures the real thing at
 * eight widths in two locales — but CI runs vitest only (.github/workflows/
 * quality.yml: typecheck, lint, `pnpm -F web test`, guards, build; no
 * Playwright step). That spec is therefore developer proof, NOT a merge gate.
 * Without this file the regression could return through CI untouched.
 *
 * WHY IT RENDERS INSTEAD OF GREPPING. A source-text guard would certify a
 * class string, not a DOM. These assertions run the components through
 * `renderToStaticMarkup` and inspect the MARKUP THAT RESULTS, so a refactor
 * that reintroduces the nesting by a different spelling still fails.
 */

vi.mock("@/lib/i18n/navigation", () => ({
  // The real Link is next-intl's locale-aware wrapper and needs request
  // context; for structure the only thing that matters is that it renders an
  // <a> carrying the className it was given, which is exactly the property
  // under test.
  Link: ({ href, children, ...rest }: Record<string, unknown>) =>
    createElement("a", { href: String(href), ...rest }, children as never),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((k: string) => `t:${k}`, {
    raw: (k: string) => `raw:${k}`,
  }),
}));

/**
 * Anchors in the rendered markup, with whatever they contain.
 *
 * The components under test render flat, non-nested anchors, so a
 * non-greedy `<a ...>…</a>` scan is exact here. Any interactive tag found
 * BETWEEN an anchor's open and close is the defect.
 */
function anchorsWithNestedInteractive(html: string): string[] {
  const out: string[] = [];
  const anchor = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const inner = m[1];
    if (/<(button|a)\b/i.test(inner)) {
      out.push(m[0].slice(0, 120));
    }
  }
  return out;
}

/** Sanity: the scan can actually SEE the defect it is meant to catch. */
describe("the detector itself", () => {
  it("flags a button nested in an anchor", () => {
    const bad = '<a href="/x" class="w-full"><button class="p">Go</button></a>';
    expect(anchorsWithNestedInteractive(bad)).toHaveLength(1);
  });

  it("passes an anchor that is the control", () => {
    const good = '<a href="/x" class="inline-flex min-h-11">Go</a>';
    expect(anchorsWithNestedInteractive(good)).toEqual([]);
  });
});

describe("FinalCtaBand — the landing's four CTAs", () => {
  it("renders four anchors, none of them wrapping a control", async () => {
    const { FinalCtaBand, FINAL_CTA_LINKS } = await import(
      "@/components/marketing/final-cta-band"
    );
    const html = renderToStaticMarkup(await FinalCtaBand());

    const anchors = html.match(/<a\b/gi) ?? [];
    expect(
      anchors.length,
      "one anchor per FINAL_CTA_LINKS entry",
    ).toBe(FINAL_CTA_LINKS.length);

    expect(
      anchorsWithNestedInteractive(html),
      "a landing CTA wraps a control instead of being one",
    ).toEqual([]);
    expect(html, "no <button> may be rendered by this band").not.toMatch(
      /<button\b/i,
    );
  });

  it("each CTA anchor carries the 44px floor and centres its own content", async () => {
    const { FinalCtaBand } = await import(
      "@/components/marketing/final-cta-band"
    );
    const html = renderToStaticMarkup(await FinalCtaBand());

    for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
      // `min-h-11` is 44px and comes from buttonLinkClassName; the flex pair
      // is what makes that height actually contain the label rather than the
      // label sitting on an inline baseline.
      expect(tag, "CTA anchor must hold the 44px floor").toContain("min-h-11");
      expect(tag, "CTA anchor must centre its label").toContain("items-center");
    }
  });
});

describe("PageHero — the shared sub-page CTA", () => {
  const render = (ctaKind: "signup" | "companyNeed") =>
    import("@/components/marketing/page-hero").then(({ PageHero }) =>
      renderToStaticMarkup(
        createElement(PageHero, {
          eyebrow: "e",
          title: "t",
          accent: "a",
          subcopy: "s",
          ctaKind,
          ctaLabel: "Do the thing",
          ctaSource: "guard_hero",
        }),
      ),
    );

  for (const kind of ["signup", "companyNeed"] as const) {
    it(`${kind} CTA is an anchor, not an anchor around a button`, async () => {
      const html = await render(kind);
      expect(anchorsWithNestedInteractive(html)).toEqual([]);
      expect(html).not.toMatch(/<button\b/i);
      const tag = (html.match(/<a\b[^>]*>/i) ?? [""])[0];
      expect(tag, "hero CTA must hold the 44px floor").toContain("min-h-11");
    });
  }
});

describe("the shared CTA grammar", () => {
  it("buttonLinkClassName always carries the floor, for every variant/size", async () => {
    const { buttonLinkClassName } = await import("@/components/ui/Button");
    // `sm` is the case that was actually short in production: 8+20+8 = 36px on
    // the header signup CTA at every width >= 768px.
    for (const variant of ["primary", "secondary", "ghost"] as const) {
      for (const size of ["sm", "md"] as const) {
        const cls = buttonLinkClassName(variant, size);
        expect(cls, `${variant}/${size} must hold the 44px floor`).toContain(
          "min-h-11",
        );
        expect(cls, `${variant}/${size} must lay out as a box`).toMatch(
          /inline-flex/,
        );
        expect(
          cls,
          `${variant}/${size} must keep a visible focus ring`,
        ).toContain("focus-visible:ring-2");
      }
    }
  });
});
