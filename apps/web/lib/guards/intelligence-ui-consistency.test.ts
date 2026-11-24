import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — CONTEXTUAL INTELLIGENCE UI consistency (Contextual UI v1).
 *
 * Pins the three honesty/consistency rules the contextual layer introduced:
 *  (a) ONE badge design language: the chip base class and every tone map
 *      live ONLY in components/intelligence/badge-styles.ts — no other
 *      intelligence component may re-declare the chip class literal, so
 *      confidence/freshness/source/conflict/status badges cannot drift;
 *  (b) never "coming soon": no intelligence-namespace string in ANY locale
 *      may promise vaguely — unavailable states must explain why/what/
 *      which-source/after-activation instead;
 *  (c) conflicts are never averaged in the UI: the trust card renders BOTH
 *      conflict values verbatim and contains no averaging arithmetic.
 *
 * Pure source assertions. Runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
const INTEL_COMPONENTS = join(APP_ROOT, "components", "intelligence");
const read = (p: string) => readFileSync(p, "utf8");
/** Strip block + line comments so scans check real CODE only. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

// ── (a) one badge design language ────────────────────────────────────────────

const CHIP_LITERAL = "inline-flex items-center rounded-full border";

describe("(a) badge design language lives only in badge-styles.ts", () => {
  it("badge-styles.ts exists and defines the chip base class", () => {
    const stylesPath = join(INTEL_COMPONENTS, "badge-styles.ts");
    expect(existsSync(stylesPath)).toBe(true);
    expect(read(stylesPath)).toContain(CHIP_LITERAL);
  });

  it("no other intelligence component re-declares the chip class literal", () => {
    const offenders = readdirSync(INTEL_COMPONENTS)
      .filter((f) => /\.tsx?$/.test(f) && f !== "badge-styles.ts")
      .filter((f) => code(read(join(INTEL_COMPONENTS, f))).includes(CHIP_LITERAL));
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

// ── (b) never "coming soon" ──────────────────────────────────────────────────

/** Vague-promise phrases per language (the locales this product ships). */
const COMING_SOON = [
  /coming soon/i, // en
  /netrukus|jau greitai/i, // lt
  /скоро появится|уже скоро/i, // ru
  /binnenkort beschikbaar/i, // nl
  /demnächst verfügbar|kommt bald/i, // de
  /wkrótce dostępn/i, // pl
  /kommer snart/i, // da/no/sv
  /varsti saadaval/i, // et
  /drīzumā/i, // lv
];

function stringLeaves(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object")
    for (const v of Object.values(node as Record<string, unknown>))
      stringLeaves(v, out);
  return out;
}

describe('(b) no intelligence string ever says "coming soon"', () => {
  const messagesDir = join(APP_ROOT, "messages");
  const locales = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
  it(`scans the intelligence namespace of ${locales.length} locale files`, () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
    const offenders: string[] = [];
    for (const file of locales) {
      const messages = JSON.parse(read(join(messagesDir, file))) as Record<
        string,
        unknown
      >;
      for (const value of stringLeaves(messages["intelligence"])) {
        if (COMING_SOON.some((re) => re.test(value))) {
          offenders.push(`${file}: "${value}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the detectors are real", () => {
    expect(COMING_SOON.some((re) => re.test("Coming soon!"))).toBe(true);
    expect(COMING_SOON.some((re) => re.test("Jau greitai"))).toBe(true);
  });
});

// ── (c) conflict UI shows both values, never an average ─────────────────────

describe("(c) the trust card exposes both conflict values and averages nothing", () => {
  const cardPath = join(INTEL_COMPONENTS, "trust-insight-card.tsx");
  it("renders conflict.a and conflict.b verbatim", () => {
    const src = read(cardPath);
    expect(src).toContain("conflict.a.valueNumeric");
    expect(src).toContain("conflict.b.valueNumeric");
  });

  it("contains no averaging arithmetic over the conflict values", () => {
    const src = code(read(cardPath));
    expect(src).not.toMatch(/valueNumeric\s*\+\s*\w+\.valueNumeric/);
    expect(src).not.toMatch(/\/\s*2\b/);
    expect(src).not.toMatch(/\baverag/i);
  });
});
