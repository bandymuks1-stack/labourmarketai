/**
 * Public trust-positioning guard.
 *
 * Locks the approved public framing so the landing cannot drift back to a
 * construction-only / closed-intermediary / demo character, and pins the footer
 * attribution. Complements the existing honesty guards (whole-labour-market-copy
 * for the tagline, product-copy-forbidden-terms for "demo", no-legal-guarantee-
 * copy, public-no-fake-claims). Source of truth:
 * docs/product/public-trust-positioning.md.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

const webRoot = resolve(__dirname, "..", "..");
function msg(locale: string): {
  hero: Record<string, string>;
  footer: Record<string, string>;
} {
  return JSON.parse(
    readFileSync(resolve(webRoot, "messages", `${locale}.json`), "utf-8"),
  );
}

// Forbidden public-positioning phrasings (the demo / legal-guarantee bans live
// in their own guards; these are the positioning-specific ones).
const FORBIDDEN: RegExp[] = [
  /instant hire/i,
  /guaranteed (match|worker)/i,
  /verified workers/i,
  /licensed employment agency/i,
  /through our company/i,
  /only through us/i,
  /(everyone|all)[^.]{0,30}go through us/i,
  /construction[- ]only/i,
  /\bfor construction\b/i,
  /мы посредник/i,
  /tarpininkas statybose/i,
];

describe("public trust positioning — approved general-platform framing", () => {
  it("EN hero frames a general labour-market platform", () => {
    const h = msg("en").hero;
    const text = `${h.chip} ${h.headline} ${h.headlineAccent} ${h.subcopy}`.toLowerCase();
    expect(text).toContain("general labour-market platform");
  });
  it("LT hero frames a general labour-market platform", () => {
    const h = msg("lt").hero;
    expect(`${h.chip} ${h.headline}`.toLowerCase()).toContain("bendra darbo rinkos platforma");
  });
  it("RU hero frames a general labour-market platform", () => {
    const h = msg("ru").hero;
    expect(`${h.chip} ${h.headline}`.toLowerCase()).toContain("общая платформа рынка труда");
  });
});

describe("public copy avoids forbidden positioning", () => {
  it.each([...activeLocales])("%s hero + footer carry no forbidden framing", (l) => {
    const m = msg(l);
    const text = [
      m.hero.chip, m.hero.headline, m.hero.headlineAccent, m.hero.subcopy,
      m.footer.tagline, m.footer.operatedBy,
    ].join(" ");
    for (const re of FORBIDDEN) {
      expect(re.test(text), `${l}: forbidden positioning matched ${re}`).toBe(false);
    }
  });
});

describe("footer legal statement + rights", () => {
  // The "built together" credit was removed on the owner's decision of
  // 2026-11-13 (pinned in legal-entity-truth.test.ts). What every footer must
  // still carry is the legal statement and the reserved-rights line.
  it.each([...activeLocales])("%s footer names the operator, carries no credit line, and reserves rights", (l) => {
    const f = msg(l).footer;
    expect(f.rexora, `${l} footer.rexora`).toBeUndefined();
    expect(f.operatedBy, `${l} footer.operatedBy`).toMatch(/Nonstop Group/);
    expect(typeof f.rights === "string" && f.rights.length > 0, `${l} footer.rights`).toBe(true);
  });
});
