/**
 * GUARD — the native app edits the Living CV through the SAME actions as the
 * web, with the SAME closed value sets (owner order 2026-11-16: one shared
 * client, no parallel backend).
 *
 * - The phone's language codes and levels equal the web model
 *   (`lib/worker/worker-languages-model.ts`, mirroring the DB CHECKs); a code
 *   the phone offered but the server refuses would be a dead control.
 * - Adding work history and a language goes through `worker.add-work-history`
 *   and `worker.add-language`, and the CV is read through `cv.verified.get` —
 *   the canonical capabilities, never a table read from the phone.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WORKER_LANGUAGES, WORKER_LANGUAGE_LEVELS, WORKER_LANGUAGE_NATIVE_NAMES } from "@/lib/worker/worker-languages-model";
import { EDUCATION_TYPE_SLUGS } from "@/lib/worker/worker-education-model";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

/** The string literals of one `export const NAME = [ … ] as const;` array. */
function literalArray(source: string, name: string): string[] {
  const m = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  expect(m, `${name} is declared`).not.toBeNull();
  return [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("mobile Living CV editing", () => {
  const languages = read("apps/mobile/src/worker-languages.ts");

  it("offers exactly the web's language codes and levels", () => {
    expect(literalArray(languages, "WORKER_LANGUAGES")).toEqual([...WORKER_LANGUAGES]);
    expect(literalArray(languages, "WORKER_LANGUAGE_LEVELS")).toEqual([...WORKER_LANGUAGE_LEVELS]);
  });

  it("names each language as the web does", () => {
    for (const code of WORKER_LANGUAGES) {
      expect(languages, code).toContain(`${code}: ${JSON.stringify(WORKER_LANGUAGE_NATIVE_NAMES[code])}`);
    }
  });

  it("offers exactly the web's education types, labelled with the web's own words", () => {
    const types = read("apps/mobile/src/education-types.ts");
    expect(literalArray(types, "EDUCATION_TYPE_SLUGS")).toEqual([...EDUCATION_TYPE_SLUGS]);
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of ["en", "lt", "ru", "nl", "de", "pl", "sv"]) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`)).cvSections.educationTypes as Record<string, string>;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const end = messages.indexOf("\n};", start);
      const block = messages.slice(start, end);
      for (const slug of EDUCATION_TYPE_SLUGS) {
        expect(block, `${locale} ${slug}`).toContain(`"cv.educationType.${slug}": ${JSON.stringify(web[slug])}`);
      }
    }
  });

  it("writes and reads through the canonical capabilities only", () => {
    const work = read("apps/mobile/src/screens/work-history-form.tsx");
    const lang = read("apps/mobile/src/screens/language-form.tsx");
    const edu = read("apps/mobile/src/screens/education-form.tsx");
    const list = read("apps/mobile/src/screens/cv-entries.tsx");
    expect(work).toContain('name: "worker.add-work-history"');
    expect(lang).toContain('name: "worker.add-language"');
    expect(edu).toContain('name: "worker.add-education"');
    expect(list).toContain('useCapability<VerifiedCvGetData>("cv.verified.get")');
    for (const src of [work, lang, edu, list]) {
      expect(src).not.toMatch(/supabase\s*\.\s*from\(/);
    }
  });
});
