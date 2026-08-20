import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Non-landing public copy honesty guard (launch repair Scope B + G).
 *
 * The public product pages must not claim capabilities that do not exist
 * today: automatic/AI matching, real-time market data, guarantees. First-
 * stage matching is operator-coordinated; availability comes from profile
 * declarations, not live feeds. This guard keeps the fixed claims from
 * regressing in three places the older SR-2/SR-5 guards do not cover:
 *   1. public marketing i18n namespaces (positive "real-time" claims),
 *   2. inline copy in non-landing marketing page files,
 *   3. curated SEO copy in lib/seo/metadata.ts.
 * It also pins the always-visible "Example" frame on the three /for-* demo
 * previews so fabricated preview data can never render unlabelled again.
 *
 * The landing page (app/[locale]/page.tsx) is FROZEN and guarded
 * separately by landing-freeze.test.ts — it is exempt here.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/** Public marketing namespaces rendered on non-landing public pages. */
const PUBLIC_NAMESPACES = [
  "companies",
  "workers",
  "agencies",
  "pages",
  "about",
  "pricing",
  "companyNeed",
  "workerIntake",
  "workAbroad",
  "footer",
  "nav",
] as const;

/** Positive real-time / automation claims that are not true today. */
const BANNED_IN_MESSAGES: RegExp[] = [
  /real[- ]?time/i,
  /realaus laiko|realiu laiku/i,
  /в реальном времени|в режиме реального времени/i,
  /AI match/i,
  /guaranteed (match|hiring|job|worker)/i,
];

const flatten = (
  obj: Record<string, unknown>,
  prefix: string,
  out: Record<string, string>,
): Record<string, string> => {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k}`;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object")
      flatten(v as Record<string, unknown>, key, out);
  }
  return out;
};

describe("public marketing i18n copy makes no false capability claims", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}.json public namespaces are clean`, () => {
      const catalog = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const leaves: Record<string, string> = {};
      for (const ns of PUBLIC_NAMESPACES) {
        const subtree = catalog[ns];
        if (subtree && typeof subtree === "object")
          flatten(subtree as Record<string, unknown>, ns, leaves);
      }
      const offenders = Object.entries(leaves)
        .filter(([, v]) => BANNED_IN_MESSAGES.some((re) => re.test(v)))
        .map(([k, v]) => `${k}: ${v.slice(0, 80)}`);
      expect(offenders).toEqual([]);
    });
  }
});

describe("inline copy in non-landing marketing pages is clean", () => {
  const marketingDir = join(WEB_ROOT, "app", "[locale]", "(marketing)");
  const collect = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...collect(full));
      else if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  };

  const BANNED_INLINE: RegExp[] = [
    /Labma\b/,
    /Construction OS/i,
    /real[- ]?time/i,
    /is matched against/i,
    /AI match/i,
  ];

  it("no banned claim appears in any non-landing marketing .tsx", () => {
    const offenders: string[] = [];
    for (const file of collect(marketingDir)) {
      const rel = relative(marketingDir, file).split(sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const re of BANNED_INLINE) {
        if (re.test(src)) offenders.push(`${rel} ~ ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("curated SEO copy stays honest", () => {
  const seo = read("lib/seo/metadata.ts");

  it("PAGE_SEO promises no automatic matching / real-time data / guarantees", () => {
    for (const re of [
      /get matched/i,
      /AI match/i,
      /real[- ]?time/i,
      /guaranteed/i,
      /gauk atitikimą/i,
      /получайте подбор/i,
    ]) {
      expect(seo).not.toMatch(re);
    }
  });
});

describe("demo previews on /for-* pages carry the always-visible Example frame", () => {
  const PAGES = [
    "app/[locale]/(marketing)/for-workers/page.tsx",
    "app/[locale]/(marketing)/for-companies/page.tsx",
    "app/[locale]/(marketing)/for-agencies/page.tsx",
  ];

  it("every fabricated preview is wrapped in ExamplePreviewFrame", () => {
    for (const rel of PAGES) {
      const src = read(rel);
      expect(src, rel).toMatch(/<ExamplePreviewFrame>/);
    }
  });

  it("the frame renders chip + note without hover/tooltip", () => {
    const frame = read("components/marketing/example-preview-frame.tsx");
    expect(frame).toMatch(/conceptChip/);
    expect(frame).toMatch(/conceptNote/);
    // Code only (doc comments legitimately mention the words):
    const code = frame.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/title=|tooltip|hover:/i);
  });

  it("conceptNote exists in every active locale", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const catalog = JSON.parse(read(`messages/${locale}.json`)) as {
        shared?: { preview?: { conceptNote?: string } };
      };
      const note = catalog.shared?.preview?.conceptNote;
      expect(typeof note, `${locale} shared.preview.conceptNote`).toBe("string");
      expect((note ?? "").length).toBeGreaterThan(10);
    }
  });
});
