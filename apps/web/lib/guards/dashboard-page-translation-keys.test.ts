import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every translation key a page ASKS FOR must EXIST.
 *
 * This guard exists because of a real, shipped regression. PR #1060 moved the
 * last three live `marketplaceHub.*` keys into `network.organizations.*` and
 * wrote the namespace with an object literal — which REPLACED the namespace
 * instead of extending it, deleting the `network.organizations.title` string
 * ("My companies") that the page's own section heading renders. The heading
 * shipped to `main` as the raw key `NETWORK.ORGANIZATIONS.TITLE`.
 *
 * Nothing caught it:
 *   - `i18n-lt-en-parity` compares locales to EACH OTHER, and all five active
 *     catalogs lost the key symmetrically, so parity stayed perfect;
 *   - `check:i18n-debt` counts `[EN]` shells, and a MISSING key is not a shell;
 *   - typecheck cannot see a string key crossing the `next-intl` boundary.
 *
 * The missing half was always "does the key the CODE asks for exist at all".
 * This guard reads the pages' own `t("…")` call sites and resolves each one
 * against every active catalog, so a deleted or renamed key fails here rather
 * than rendering as shouting dotted text on a real screen.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Locales that really route (lib/i18n/config.ts `activeLocales`). */
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

/**
 * Pages whose namespace usage is simple enough to verify statically: ONE
 * `getTranslations("ns")` bound to `t`, then literal `t("a.b")` calls.
 * Deliberately a short list — a page with several namespaces or computed
 * keys needs its own assertion, not a silently-skipped scan.
 */
const PAGES: readonly { file: string; binding: string; namespace: string }[] = [
  {
    file: "app/[locale]/dashboard/network/page.tsx",
    binding: "t",
    namespace: "network",
  },
  {
    file: "app/[locale]/dashboard/reports/page.tsx",
    binding: "t",
    namespace: "reports",
  },
];

/** Read a dotted path; undefined when any segment is missing or non-string. */
function lookup(root: unknown, path: string): string | undefined {
  let cur: unknown = root;
  for (const segment of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Literal keys passed to `<binding>("…")` in the source. */
function usedKeys(source: string, binding: string): string[] {
  const re = new RegExp(`\\b${binding}\\(\\s*"([^"$]+)"\\s*\\)`, "g");
  const keys = new Set<string>();
  for (const m of source.matchAll(re)) keys.add(m[1]);
  return [...keys].sort();
}

const catalogs = Object.fromEntries(
  ACTIVE.map((l) => [l, JSON.parse(read(`messages/${l}.json`)) as unknown]),
) as Record<(typeof ACTIVE)[number], unknown>;

describe("every key a dashboard page asks for resolves in every active locale", () => {
  for (const page of PAGES) {
    const source = read(page.file);
    const keys = usedKeys(source, page.binding);

    it(`${page.file} — the scan actually found keys`, () => {
      // A scan that silently matches nothing would pass forever. If the page
      // stops binding its namespace to `t`, this fails and the entry above
      // must be corrected rather than quietly doing nothing.
      expect(source).toMatch(
        new RegExp(
          `const ${page.binding} = await getTranslations\\("${page.namespace}"\\)`,
        ),
      );
      expect(keys.length).toBeGreaterThan(5);
    });

    for (const locale of ACTIVE) {
      it(`${page.file} — all ${page.binding}() keys exist in ${locale}`, () => {
        const missing = keys.filter(
          (k) => lookup(catalogs[locale], `${page.namespace}.${k}`) === undefined,
        );
        expect(
          missing,
          `${locale}: missing ${page.namespace}.{${missing.join(", ")}}`,
        ).toEqual([]);
      });
    }
  }
});

describe("the exact key PR #1060 deleted is back", () => {
  for (const locale of ACTIVE) {
    it(`${locale}: network.organizations.title is a real string`, () => {
      const value = lookup(catalogs[locale], "network.organizations.title") ?? "";
      expect(value.trim(), `${locale} network.organizations.title`).not.toBe("");
      // It must not have come back as an [EN] shell in an active locale.
      expect(value.startsWith("[EN]")).toBe(false);
    });

    it(`${locale}: the keys #1060 moved are still there beside it`, () => {
      // The regression was a REPLACEMENT, so proving the restored key exists
      // is not enough — the three moved keys must survive the restore too.
      for (const key of ["noCompanyCta", "noCompanyDesc", "individualDesc"]) {
        expect(
          (lookup(catalogs[locale], `network.organizations.${key}`) ?? "").trim(),
          `${locale} network.organizations.${key}`,
        ).not.toBe("");
      }
    });
  }
});
