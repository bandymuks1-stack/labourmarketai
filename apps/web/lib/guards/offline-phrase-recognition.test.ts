import { describe, expect, it } from "vitest";

import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import { LANGUAGE_FIXTURES } from "@/lib/structuring/language-packs/fixtures";
import { RECOGNITION_LANGUAGES } from "@/lib/structuring/language-packs/types";

/**
 * OFFLINE PHRASE RECOGNITION — the per-language proof line (owner mandate
 * 2026-07-04, Task 3): every covered language recognises REAL worker
 * sentences from bundled dictionaries alone.
 *
 * Two properties make this stricter than "the slug appeared":
 *  - every expected slug must match via the EXACT or SYNONYM tier — a fuzzy
 *    brush (the measured SV "packade"→"packag" accident) or a locale display
 *    name never counts as language coverage;
 *  - measured false-positive sentences (cross-language collisions, worker-
 *    side vs recruiter-side, tool-mention vs trade) must stay silent.
 *
 * Fixtures live in lib/structuring/language-packs/fixtures/<lang>.ts. A
 * language with `null` fixtures is honestly RED — the audit
 * (runtime/audits/offline-multilingual-skill-recognition-audit-2026-07-04.md)
 * tracks the plan per language.
 */

for (const lang of RECOGNITION_LANGUAGES) {
  const fx = LANGUAGE_FIXTURES[lang];
  if (fx === null) continue;

  describe(`${lang.toUpperCase()} offline phrase pack`, () => {
    for (const c of fx.phrases) {
      it(`recognises: ${c.text}`, () => {
        const got = recognizeSkills(c.text, 10);
        const bySlug = new Map(got.map((s) => [s.slug, s]));
        for (const slug of c.expects) {
          expect(
            bySlug.has(slug),
            `expected '${slug}', got [${got.map((s) => s.slug).join(", ")}]`,
          ).toBe(true);
          expect(
            bySlug.get(slug)!.via,
            `'${slug}' matched only via the fuzzy tier — that is an accident, not ${lang} coverage; add a real needle`,
          ).not.toBe("fuzzy");
        }
        for (const slug of c.forbids ?? []) {
          expect(bySlug.has(slug), `forbidden '${slug}' recognised`).toBe(false);
        }
      });
    }

    for (const c of fx.falsePositives) {
      it(`stays silent on: ${c.text}`, () => {
        const got = recognizeSkills(c.text, 10).map((s) => s.slug);
        for (const slug of c.forbids) {
          expect(got, `false positive '${slug}' from: ${c.text}`).not.toContain(slug);
        }
      });
    }
  });
}
