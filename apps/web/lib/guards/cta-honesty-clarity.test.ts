import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for CTA Honesty Clarity v1.
 *
 * Buttons, hero CTAs, cta-bands, pilot/request CTAs and dashboard action copy
 * must not promise things the product does not do today: a guaranteed job or
 * result, instant hiring, live AI matching, automatic/AI skill verification or
 * proof, or a paid/premium/checkout flow (billing is not wired). This guard
 * scans every user-facing string in the two canonical launch locales (LT + EN)
 * and fails if any carries such an affirmative claim. Runs in CI via
 * `pnpm -F web test`.
 *
 * It complements the (un-wired) SR-2/5/6 scripts by giving CTA-claim honesty
 * real CI teeth, and is consistent with the journal / empty-state / admin
 * clarity guards. It does NOT touch honest conversion CTAs that lead to real
 * routes — only fake CLAIMS are forbidden.
 *
 * Patterns match the CLAIM affirmatively. The repo convention (see the journal
 * and anti-claim guards) is to phrase any honest disclaimer AFFIRMATIVELY
 * ("Matching is not offered yet", "Billing is never started for you") so it
 * never reads as the very claim being forbidden. LT patterns avoid \b (which
 * silently fails next to ąčęėįšųūž) and use diacritic-safe fragments.
 */

const APP_ROOT = join(__dirname, "..", "..");
const CANONICAL_LOCALES = ["lt", "en"] as const;

function flatten(
  obj: unknown,
  prefix = "",
  acc: Record<string, string> = {},
): Record<string, string> {
  if (obj == null || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const np = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, np, acc);
    else if (typeof v === "string") acc[np] = v;
  }
  return acc;
}

function loadAllStrings(locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  const mono = join(APP_ROOT, "messages", `${locale}.json`);
  Object.assign(out, flatten(JSON.parse(readFileSync(mono, "utf8")), locale));
  const dir = join(APP_ROOT, "messages", locale);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      Object.assign(
        out,
        flatten(
          JSON.parse(readFileSync(join(dir, f), "utf8")),
          `${locale}/${f}`,
        ),
      );
    }
  }
  return out;
}

// Affirmative fake-claim patterns. EN + LT (LT is diacritic-safe, no \b).
const FORBIDDEN: { name: string; rx: RegExp }[] = [
  // guaranteed job / result / placement / income
  { name: "guaranteed job/result (EN)", rx: /\bguarantee(?:d|s)?\s+(?:a\s+|your\s+|the\s+)?(?:job|jobs|results?|placement|hire[sd]?|income|earnings|work)\b/i },
  { name: "we guarantee (EN)", rx: /\bwe\s+guarantee\b/i },
  { name: "garantuojame darbą/rezultatą (LT)", rx: /garantuo(?:jame|tas|tą|ja|ti|tum)[^.]{0,20}(?:darb|rezultat|įdarbin|pajam|atlyg)/i },
  // instant hiring
  { name: "instant hiring (EN)", rx: /\binstant(?:ly)?\s+(?:hir(?:e|ing)|get\s+hired|hired)\b/i },
  { name: "iškart įdarbina (LT)", rx: /(?:iškart|akimirksniu|nedelsiant)[^.]{0,15}(?:įdarbin|priim)/i },
  // AI matching presented as a live feature
  { name: "AI matching (EN)", rx: /\bAI[\s-]*match(?:ing|es|ed)?\b/i },
  { name: "AI-powered matching (EN)", rx: /\bAI[\s-]+powered\s+matching\b/i },
  { name: "DI/AI suderinimas (LT)", rx: /(?:\bDI\b|dirbtin\w*\s+intelekt\w*|\bAI\b)[^.]{0,12}suderin/i },
  // automatic / AI / instant verification or proof
  { name: "automatic/AI/instant verification (EN)", rx: /\b(?:automatic(?:ally)?|AI|instantly)[\s-]*verif/i },
  { name: "automatic proof (EN)", rx: /\bautomatic(?:ally)?\s+proof\b/i },
  { name: "automatiškai patvirtinta (LT)", rx: /automatiškai\s+patvirtin/i },
  { name: "automatinis įrodymas (LT)", rx: /automatin\w*\s+įrodym/i },
  // paid / premium / checkout while billing is not wired
  { name: "paid plan active (EN)", rx: /\bpaid\s+plan\s+active\b/i },
  { name: "buy now (EN)", rx: /\bbuy\s+now\b/i },
  { name: "subscribe now (EN)", rx: /\bsubscribe\s+now\b/i },
  { name: "checkout now/to (EN)", rx: /\bcheck\s?out\s+(?:now|to)\b/i },
  { name: "upgrade to premium/pro/paid (EN)", rx: /\bupgrade\s+to\s+(?:premium|pro|paid)\b/i },
  { name: "pirkti dabar (LT)", rx: /pirkti\s+dabar/i },
  { name: "atsiskaityti / checkout (LT)", rx: /atsiskaity\w*/i },
];

describe("Guard: CTA copy makes no fake/unsupported claims (LT + EN)", () => {
  for (const locale of CANONICAL_LOCALES) {
    const strings = loadAllStrings(locale);
    it(`${locale} message copy carries no fake-claim CTA phrase`, () => {
      const hits: string[] = [];
      for (const [key, value] of Object.entries(strings)) {
        for (const { name, rx } of FORBIDDEN) {
          if (rx.test(value)) hits.push(`[${name}] ${key}: "${value}"`);
        }
      }
      expect(
        hits,
        `Fake/unsupported CTA claim(s) in ${locale} copy — rephrase honestly:\n  ${hits.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  it("scans a non-trivial corpus in both locales (guard is not a no-op)", () => {
    for (const locale of CANONICAL_LOCALES) {
      expect(Object.keys(loadAllStrings(locale)).length).toBeGreaterThan(500);
    }
  });
});
