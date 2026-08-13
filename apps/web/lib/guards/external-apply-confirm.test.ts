import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ExternalApplyConfirm,
  ExternalApplyConfirmedBlock,
  externalApplyHref,
} from "@/components/app/external-apply-confirm";

/**
 * External-apply confirmation step (V8 W4-B item 3, owner decision V8
 * addendum §4): click → the person is TOLD the application continues on the
 * publisher's portal → confirm → open. This guard pins:
 *
 *   1. no surface renders a DIRECT external application anchor any more —
 *      the confirm component is the only place such an anchor may live;
 *   2. the initial render carries no external href at all (nothing to
 *      middle-click past the notice);
 *   3. the revealed anchor keeps the exact link contract the direct control
 *      had: https-normalised href, target _blank, rel noopener noreferrer
 *      nofollow, and the surface's existing data-testid;
 *   4. the copy exists in the 5 routed locales.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const PROPS = {
  url: "arbetsformedlingen.se/ad/123",
  openLabel: "open-original",
  noticeText: "continues-on-another-portal",
  continueLabel: "continue-label",
  dismissLabel: "dismiss-label",
  anchorTestId: "external-vacancy-original-link",
};

describe("the confirm step gates the external anchor", () => {
  it("the initial state renders the trigger and NO external href", () => {
    const html = renderToStaticMarkup(
      createElement(ExternalApplyConfirm, { ...PROPS, variant: "card" }),
    );
    expect(html).toContain("external-vacancy-original-link-confirm");
    expect(html).toContain("open-original");
    expect(html).not.toContain("href");
    expect(html).not.toContain("arbetsformedlingen.se");
    // The informing sentence belongs to the revealed state, not the trigger.
    expect(html).not.toContain("continues-on-another-portal");
  });

  it("the revealed state carries the sentence, the REAL anchor and a dismiss control", () => {
    const html = renderToStaticMarkup(
      createElement(ExternalApplyConfirmedBlock, PROPS),
    );
    expect(html).toContain("continues-on-another-portal");
    // The anchor contract is EXACTLY what the direct control had.
    expect(html).toContain('href="https://arbetsformedlingen.se/ad/123"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('data-testid="external-vacancy-original-link"');
    expect(html).toContain("continue-label");
    expect(html).toContain('data-testid="external-vacancy-original-link-dismiss"');
    expect(html).toContain("dismiss-label");
  });

  it("normalises the href the same way the direct anchors did", () => {
    expect(externalApplyHref("example.org/x")).toBe("https://example.org/x");
    expect(externalApplyHref("http://example.org/x")).toBe("https://example.org/x");
    expect(externalApplyHref("https://example.org/x")).toBe("https://example.org/x");
  });
});

describe("no surface bypasses the confirm step with a direct anchor", () => {
  const SURFACES = [
    "components/app/external-vacancies-section.tsx",
    "components/app/workspace/opportunities-result.tsx",
  ] as const;

  for (const rel of SURFACES) {
    it(`${rel} mounts ExternalApplyConfirm and holds no external anchor of its own`, () => {
      const src = read(rel);
      expect(src).toContain(
        'from "@/components/app/external-apply-confirm"',
      );
      expect(src).toContain("<ExternalApplyConfirm");
      // The direct-anchor shape must not come back: no _blank anchor, no
      // nofollow rel, no inline https-normalisation outside the component.
      expect(src).not.toMatch(/target="_blank"/);
      expect(src).not.toMatch(/nofollow/);
      expect(src).not.toMatch(/https:\/\/\$\{/);
    });
  }

  it("the confirm component holds exactly one anchor, inside the revealed block", () => {
    const src = read("components/app/external-apply-confirm.tsx");
    const anchors = [...src.matchAll(/<a\s/g)];
    expect(anchors).toHaveLength(1);
    expect(src).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("the confirm copy exists in the 5 routed locales", () => {
  const KEYS = ["confirmNotice", "confirmContinue", "confirmDismiss"] as const;
  for (const locale of ["lt", "en", "ru", "nl", "de"] as const) {
    it(`${locale}: opportunities.external confirm keys are real strings`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        opportunities?: { external?: Record<string, unknown> };
      };
      const ext = json.opportunities?.external ?? {};
      for (const key of KEYS) {
        const v = ext[key];
        expect(
          typeof v === "string" && v.trim().length > 0 && !v.startsWith("[EN]"),
          `${locale}: opportunities.external.${key}`,
        ).toBe(true);
      }
    });
  }
});
