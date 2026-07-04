import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";
import {
  LANGUAGE_PACKS,
  BASE_LEXICON_LANGUAGES,
  COVERED_RECOGNITION_LANGUAGES,
} from "@/lib/structuring/language-packs";
import { LANGUAGE_FIXTURES } from "@/lib/structuring/language-packs/fixtures";
import {
  RECOGNITION_LANGUAGES,
  MIN_PHRASES_PER_LANGUAGE,
  MIN_FALSE_POSITIVES_PER_LANGUAGE,
} from "@/lib/structuring/language-packs/types";
import { CORE_PACK_SLUGS } from "@/lib/structuring/language-packs/core-slugs";
import { SKILL_RECOGNITION_STATUS } from "@/lib/structuring/language-packs/recognition-status";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";

/**
 * OFFLINE LANGUAGE-PACK GUARD (owner mandate 2026-07-04, Tasks 5–6).
 *
 * Locks in, permanently:
 *  1. a language counts as covered ONLY with real phrase fixtures — locale
 *     display names are NOT recognition;
 *  2. every registered pack meets the owner minimums (≥15 phrases, ≥5
 *     false-positive cases, non-empty mappings for every core slug);
 *  3. packs can never invent a skill: every pack slug must already exist in
 *     the seeded base lexicon (whose own seeding the installation-chain
 *     guard enforces);
 *  4. recognition runtime is PURE OFFLINE — no fetch/HTTP/remote import in
 *     any recognition module, and recognizing works with network primitives
 *     stubbed to throw;
 *  5. every catalogue skill the recognizer can emit has an EXPLICIT
 *     recognition-status classification (core / deferred+note /
 *     not-text-recognizable) — new skills fail CI until classified.
 */

const HINT_SLUGS = new Set(SKILL_HINTS_LT.map((r) => r.slug));

describe("supported language set", () => {
  it("the recognition language set is exactly the 12 product languages", () => {
    expect([...RECOGNITION_LANGUAGES].sort()).toEqual(
      ["da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv"].sort(),
    );
  });

  it("every pack language is unique, supported, and not a base-lexicon language", () => {
    const seen = new Set<string>();
    for (const pack of LANGUAGE_PACKS) {
      expect(RECOGNITION_LANGUAGES).toContain(pack.language);
      expect(
        BASE_LEXICON_LANGUAGES.includes(pack.language),
        `${pack.language}: base-lexicon languages keep needles in keywords.ts, not a pack`,
      ).toBe(false);
      expect(seen.has(pack.language), `duplicate pack for ${pack.language}`).toBe(false);
      seen.add(pack.language);
    }
  });
});

describe("coverage claims require phrase fixtures (display names never count)", () => {
  for (const lang of COVERED_RECOGNITION_LANGUAGES) {
    it(`${lang}: has a fixture set meeting the owner minimums`, () => {
      const fx = LANGUAGE_FIXTURES[lang];
      expect(fx, `${lang} is claimed covered but has NO fixtures`).not.toBeNull();
      expect(fx!.phrases.length).toBeGreaterThanOrEqual(MIN_PHRASES_PER_LANGUAGE);
      expect(fx!.falsePositives.length).toBeGreaterThanOrEqual(
        MIN_FALSE_POSITIVES_PER_LANGUAGE,
      );
      for (const p of fx!.phrases) {
        expect(p.expects.length, `phrase without expectations: ${p.text}`).toBeGreaterThan(0);
      }
    });
  }

  it("every fixture language is actually covered (no orphan fixtures)", () => {
    for (const lang of RECOGNITION_LANGUAGES) {
      if (LANGUAGE_FIXTURES[lang] === null) continue;
      expect(
        COVERED_RECOGNITION_LANGUAGES.includes(lang),
        `${lang} has fixtures but no pack/base lexicon`,
      ).toBe(true);
    }
  });
});

describe("packs extend the ONE canonical catalogue (no invented skills)", () => {
  for (const pack of LANGUAGE_PACKS) {
    it(`${pack.language}: every slug exists in the seeded base lexicon`, () => {
      for (const slug of Object.keys(pack.skills)) {
        expect(
          HINT_SLUGS.has(slug),
          `${pack.language} pack maps '${slug}' which is NOT in SKILL_HINTS_LT — packs must never invent skills`,
        ).toBe(true);
      }
    });

    it(`${pack.language}: covers every core slug with non-empty exact needles`, () => {
      for (const slug of CORE_PACK_SLUGS) {
        const set = pack.skills[slug];
        expect(set, `${pack.language} pack is missing core slug '${slug}'`).toBeTruthy();
        expect(
          set!.exact.length,
          `${pack.language} pack has EMPTY needles for core slug '${slug}'`,
        ).toBeGreaterThan(0);
        for (const n of [...set!.exact, ...(set!.synonyms ?? [])]) {
          expect(n.trim().length, `${pack.language}/${slug}: blank needle`).toBeGreaterThan(2);
        }
      }
    });
  }

  it("every core slug is part of the seeded base lexicon", () => {
    for (const slug of CORE_PACK_SLUGS) {
      expect(HINT_SLUGS.has(slug), `core slug '${slug}' not in SKILL_HINTS_LT`).toBe(true);
    }
  });
});

describe("every catalogue skill has an explicit recognition-status classification", () => {
  it("every SKILL_HINTS_LT slug is classified (new skills fail until classified)", () => {
    for (const slug of HINT_SLUGS) {
      const status = SKILL_RECOGNITION_STATUS[slug];
      expect(
        status,
        `'${slug}' has recognition needles but NO status classification — add it to language-packs/recognition-status.ts (core / deferred+note / not-text-recognizable)`,
      ).toBeTruthy();
      if (status && status.kind !== "core") {
        expect(
          status.note.trim().length,
          `'${slug}' is ${status.kind} but carries no audit note`,
        ).toBeGreaterThan(10);
      }
    }
  });

  it("no stale classification for slugs the recognizer no longer emits", () => {
    for (const slug of Object.keys(SKILL_RECOGNITION_STATUS)) {
      expect(
        HINT_SLUGS.has(slug),
        `recognition-status classifies '${slug}' which no longer exists in SKILL_HINTS_LT`,
      ).toBe(true);
    }
  });

  it("every 'core' slug has needles in EVERY registered language pack", () => {
    for (const [slug, status] of Object.entries(SKILL_RECOGNITION_STATUS)) {
      if (status.kind !== "core") continue;
      for (const pack of LANGUAGE_PACKS) {
        expect(
          (pack.skills[slug]?.exact.length ?? 0) > 0,
          `'${slug}' is classified core but the ${pack.language} pack has no needles for it`,
        ).toBe(true);
      }
    }
  });

  it("every core-slugs.ts entry is classified core (single source of truth)", () => {
    for (const slug of CORE_PACK_SLUGS) {
      expect(SKILL_RECOGNITION_STATUS[slug]?.kind, slug).toBe("core");
    }
  });
});

describe("recognition runtime is pure offline (no remote calls, ever)", () => {
  const STRUCTURING_DIR = join(__dirname, "..", "structuring");
  const RUNTIME_FILES: string[] = [
    join(STRUCTURING_DIR, "skill-recognition.ts"),
    join(STRUCTURING_DIR, "keywords.ts"),
    join(STRUCTURING_DIR, "synonyms.ts"),
    join(STRUCTURING_DIR, "normalize.ts"),
  ];
  // every file in language-packs/, recursively
  const stack = [join(STRUCTURING_DIR, "language-packs")];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (entry.endsWith(".ts")) RUNTIME_FILES.push(p);
    }
  }

  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\baxios\b/,
    /WebSocket/,
    /https?:\/\//i,
    /\bimport\s*\(/, // dynamic import — recognition data must be bundled
    /require\s*\(/,
    /node:fs|node:net|node:http/,
    /supabase/i, // recognition never reads the DB at runtime
    /skill-names\.json|professions\.json|messages\//, // display names ≠ needles
  ];

  /** Comments legitimately reference locale JSON paths (e.g. keywords.ts
   *  documents the slug registry) — only CODE must be network/JSON-free. */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

  it("no recognition module contains a network/remote-loading primitive", () => {
    for (const file of RUNTIME_FILES) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const re of FORBIDDEN) {
        expect(
          re.test(src),
          `${file} matches forbidden pattern ${re} — recognition must be fully offline, bundled, display-name-free`,
        ).toBe(false);
      }
    }
  });

  it("recognition works with network primitives stubbed to THROW (offline proof)", () => {
    const g = globalThis as { fetch?: unknown; XMLHttpRequest?: unknown };
    const origFetch = g.fetch;
    const origXhr = g.XMLHttpRequest;
    const boom = () => {
      throw new Error("network disabled — offline recognition must not touch it");
    };
    g.fetch = boom;
    g.XMLHttpRequest = boom;
    try {
      for (const lang of COVERED_RECOGNITION_LANGUAGES) {
        const fx = LANGUAGE_FIXTURES[lang];
        expect(fx, lang).not.toBeNull();
        const sample = fx!.phrases[0];
        const got = recognizeSkills(sample.text, 10).map((s) => s.slug);
        for (const slug of sample.expects) {
          expect(got, `${lang} offline: ${sample.text}`).toContain(slug);
        }
      }
    } finally {
      g.fetch = origFetch;
      g.XMLHttpRequest = origXhr;
    }
  });
});
