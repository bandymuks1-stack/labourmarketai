import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Locale/theme continuity contract (core-network A–E programme, area D).
 *
 * Rule: changing language changes ONLY the locale. It must never change
 * the chosen theme, the active page, the query string, or the hash.
 *
 * These are source-contract guards: they pin the mechanisms that make the
 * rule true, so a refactor that silently reintroduces the defect (switcher
 * dropping ?query/#hash, a locale-keyed theme store, a missing pre-paint
 * bootstrap) fails CI instead of shipping.
 */

const webRoot = join(__dirname, "..", "..");

const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("locale switcher preserves route context", () => {
  const src = read("components/marketing/locale-switcher.tsx");

  it("carries the live query string AND hash into every locale link", () => {
    // The switcher must read window.location.search + window.location.hash
    // (not usePathname alone, which strips both)…
    expect(src).toMatch(/window\.location\.search\s*\+\s*window\.location\.hash/);
    // …and append it to the pathname it links to.
    expect(src).toMatch(/href=\{`\$\{pathname\}\$\{suffix\}`\}/);
  });

  it("switches locale via next-intl Link (soft navigation, no reload)", () => {
    expect(src).toMatch(/from "@\/lib\/i18n\/navigation"/);
    expect(src).toMatch(/locale=\{l\}/);
  });

  it("does not read or write any theme state on locale switch", () => {
    expect(src).not.toMatch(/dataset\.theme/);
    expect(src).not.toMatch(/localStorage/);
  });
});

describe("theme storage is locale-independent", () => {
  const files = [
    "components/ui/ThemeToggle.tsx",
    "components/app/account-menu.tsx",
    "components/app/theme-reapply.tsx",
  ];

  it("every theme writer/reader uses the single shared 'theme' key", () => {
    for (const f of files) {
      const src = read(f);
      const touchesStorage = /localStorage\.(get|set)Item\(/.test(src);
      if (!touchesStorage) continue;
      // Only the literal shared key — never a locale-derived key.
      const keyUses = src.match(/localStorage\.(?:get|set)Item\(\s*([^,)]+)/g) ?? [];
      expect(keyUses.length).toBeGreaterThan(0);
      for (const use of keyUses) {
        expect(use).toMatch(/localStorage\.(?:get|set)Item\(\s*["']theme["']/);
      }
      expect(src).not.toMatch(/theme[-_]?\$\{/i);
    }
  });
});

describe("pre-paint theme bootstrap", () => {
  const BOOTSTRAP =
    /localStorage\.getItem\('theme'\)[\s\S]*document\.documentElement\.dataset\.theme=t/;

  it("the [locale] layout applies the saved theme before paint", () => {
    expect(read("app/[locale]/layout.tsx")).toMatch(BOOTSTRAP);
  });

  it("the branded 404 re-applies the saved theme synchronously (html remount path)", () => {
    const src = read("app/[locale]/not-found.tsx");
    expect(src).toMatch(BOOTSTRAP);
    // Belt: the post-hydration re-apply stays too.
    expect(src).toMatch(/ThemeReapply/);
  });
});
