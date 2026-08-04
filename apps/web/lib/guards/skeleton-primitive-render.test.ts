import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SkeletonBlock,
  SkeletonCardGrid,
  SkeletonScreen,
  SkeletonText,
} from "@/components/app/skeleton";
import DashboardSectionLoading from "@/app/[locale]/dashboard/loading";
import CvLoading from "@/app/[locale]/cv/loading";
import OnboardingLoading from "@/app/[locale]/onboarding/loading";

/**
 * RENDER PROOF for the skeleton primitive and the three real route loaders.
 *
 * The source-scanning guard (skeleton-loading-primitive.test.ts) proves the
 * route files COMPOSE the primitive. This one proves what a browser actually
 * receives — a source scan cannot tell you whether the accessibility contract
 * survives into the DOM, and "the component looks right in isolation" has been
 * wrong in this repo before.
 */

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el);

/** A SkeletonScreen holding one block — the shape every caller uses. */
const screen = (
  props: Omit<Parameters<typeof SkeletonScreen>[0], "children">,
) => createElement(SkeletonScreen, props, createElement(SkeletonBlock, {}));

describe("SkeletonScreen accessibility contract, as rendered", () => {
  it("UNLABELLED: hides itself entirely rather than claiming an empty status", () => {
    const out = html(
      screen({}),
    );
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain('role="status"');
    expect(out).not.toContain("aria-live");
  });

  it("LABELLED: announces a polite busy status WITH real text", () => {
    const out = html(
      screen({ label: "Kraunama jūsų sritis" }),
    );
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('class="sr-only"');
    expect(out).toContain("Kraunama jūsų sritis");
    // The container announces; it must not also be hidden from AT.
    expect(out).not.toContain('aria-hidden="true"><span class="sr-only"');
  });

  it("a whitespace-only label is treated as no label — never an empty announcement", () => {
    const out = html(
      screen({ label: "   " }),
    );
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain('role="status"');
    expect(out).not.toContain("sr-only");
  });

  it("carries the pulse animation and the caller's layout classes", () => {
    const out = html(
      screen({ className: "mx-auto max-w-3xl" }),
    );
    expect(out).toContain("animate-pulse");
    expect(out).toContain("mx-auto max-w-3xl");
  });
});

describe("blocks are decorative and bounded", () => {
  it("every block hides itself from assistive technology", () => {
    const out = html(createElement(SkeletonBlock, { size: "panel" }));
    expect(out).toContain('aria-hidden="true"');
  });

  it("SkeletonText ends on a short line so it reads as prose, not a table", () => {
    const out = html(createElement(SkeletonText, { lines: 3 }));
    expect(out.match(/w-full/g)?.length).toBe(2);
    expect(out).toContain("w-2/3");
  });

  it("SkeletonText clamps an absurd line count instead of rendering it", () => {
    const out = html(createElement(SkeletonText, { lines: 500 }));
    expect((out.match(/rounded-md/g) ?? []).length).toBeLessThanOrEqual(12);
  });

  it("SkeletonText renders at least one line for a zero or negative count", () => {
    for (const lines of [0, -3]) {
      const out = html(createElement(SkeletonText, { lines }));
      expect((out.match(/rounded-md/g) ?? []).length).toBe(1);
    }
  });

  it("SkeletonCardGrid clamps its count too", () => {
    const out = html(createElement(SkeletonCardGrid, { count: 99 }));
    expect((out.match(/rounded-lg/g) ?? []).length).toBeLessThanOrEqual(12);
  });
});

describe("no element ever carries two competing utilities", () => {
  /** Tailwind resolves `h-44 h-32` by STYLESHEET order, not attribute order,
   *  so an override appended beside a preset silently loses. Nothing the
   *  primitive renders may contain a duplicate height or radius. */
  const collides = (markup: string, prefix: string): string[] => {
    const bad: string[] = [];
    for (const cls of markup.match(/class="([^"]*)"/g) ?? []) {
      const names = cls.slice(7, -1).split(/\s+/).filter(Boolean);
      const hits = names.filter((n) => new RegExp(`^${prefix}-`).test(n));
      if (hits.length > 1) bad.push(hits.join(" + "));
    }
    return bad;
  };

  it("an explicit height REPLACES the size preset instead of fighting it", () => {
    const out = html(
      createElement(SkeletonBlock, {
        size: "panel",
        height: "h-32",
        variant: "surface",
      }),
    );
    expect(out).toContain("h-32");
    expect(out).not.toContain("h-44");
    expect(collides(out, "h")).toEqual([]);
  });

  it("an explicit radius REPLACES the variant's radius", () => {
    const out = html(
      createElement(SkeletonBlock, { radius: "rounded-full" }),
    );
    expect(out).toContain("rounded-full");
    expect(out).not.toContain("rounded-md");
    expect(collides(out, "rounded")).toEqual([]);
  });

  it("the real route loaders render no colliding height or radius", () => {
    for (const [name, Loader] of [
      ["dashboard", DashboardSectionLoading],
      ["cv", CvLoading],
      ["onboarding", OnboardingLoading],
    ] as const) {
      const out = html(createElement(Loader));
      expect(collides(out, "h"), `${name} height`).toEqual([]);
      expect(collides(out, "rounded"), `${name} radius`).toEqual([]);
    }
  });

  it("the collision detector is real", () => {
    expect(collides('<div class="h-44 h-32 w-full" />', "h")).toEqual([
      "h-44 + h-32",
    ]);
    expect(collides('<div class="h-32 w-full" />', "h")).toEqual([]);
  });
});

describe("the migration preserved each loader's original rhythm", () => {
  /** The heights the three loaders shipped before they were composed from the
   *  primitive. A refactor that changes what the user sees is not a refactor. */
  const ORIGINAL_HEIGHTS: Record<string, readonly string[]> = {
    dashboard: ["h-6", "h-9", "h-44", "h-28", "h-28", "h-28", "h-32"],
    cv: ["h-8", "h-24", "h-40", "h-40"],
    onboarding: ["h-9", "h-4", "h-36", "h-36"],
  };

  const loaders = {
    dashboard: DashboardSectionLoading,
    cv: CvLoading,
    onboarding: OnboardingLoading,
  } as const;

  for (const [name, expected] of Object.entries(ORIGINAL_HEIGHTS)) {
    it(`${name}: renders exactly the same block heights, in order`, () => {
      const out = html(createElement(loaders[name as keyof typeof loaders]));
      const heights = [...out.matchAll(/class="(h-[\w./]+)\s/g)].map(
        (m) => m[1],
      );
      expect(heights).toEqual(expected);
    });
  }
});

describe("the three real route loaders render as honest placeholders", () => {
  const loaders = [
    ["dashboard", DashboardSectionLoading, "dashboard-section-loading"],
    ["cv", CvLoading, "cv-loading"],
    ["onboarding", OnboardingLoading, "onboarding-loading"],
  ] as const;

  for (const [name, Loader, testId] of loaders) {
    it(`${name}: keeps its data-testid, pulses, and is hidden from AT`, () => {
      const out = html(createElement(Loader));
      expect(out).toContain(`data-testid="${testId}"`);
      expect(out).toContain("animate-pulse");
      expect(out).toContain('aria-hidden="true"');
    });

    it(`${name}: renders NO words — a placeholder shows no content`, () => {
      const out = html(createElement(Loader));
      // Collect the text nodes (anything between a `>` and the next `<`)
      // rather than stripping tags with a replace. A tag-stripping replace is
      // the shape of an incomplete sanitizer — CodeQL flags it as one, and it
      // is genuinely unreliable on nested or malformed markup. Detecting is
      // both safer and a better failure message: it names the offending text.
      const textNodes = [...out.matchAll(/>([^<]+)</g)]
        .map((m) => m[1].trim())
        .filter((text) => text.length > 0);
      expect(
        textNodes,
        `${name} rendered text: ${JSON.stringify(textNodes)}`,
      ).toEqual([]);
    });

    it(`${name}: renders only div elements — no images, no inputs, no links`, () => {
      const out = html(createElement(Loader));
      const tags = [...out.matchAll(/<([a-z]+)/g)].map((m) => m[1]);
      expect([...new Set(tags)]).toEqual(["div"]);
    });
  }
});
