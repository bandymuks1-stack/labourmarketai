import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Real-user fitness walk on production, 2026-09-06 — the FIRST screen and the
 * FIRST sentences. Each pin names a measured production behaviour:
 *
 *   1. The worker board's generic vacancy query seq-scanned 47k rows and
 *      top-N sorted them (6.9 s; mean 2.85 s over 897 calls; max 7.9 s against
 *      the 8 s statement timeout) because `ORDER BY published_at DESC` is
 *      NULLS FIRST and the partial index is `DESC NULLS LAST`. With NULLS LAST
 *      the same query walks the index in 2.8 ms. The country and profession
 *      indexes are plain DESC, so only the generic path flips.
 *   2. When that read timed out (57014) the throw reached the server action
 *      and every sentence over the board answered the not-understood menu.
 *      A failed external feed is an UNAVAILABLE source, never a broken board.
 *   3. The opening brief (a slow read) landed AFTER the person's first
 *      sentence and took the answer's chip row. Once the person has spoken,
 *      their question owns the thread.
 *   4. "reikia 2 mechanikų" opened the need form with the role EMPTY: the
 *      closed work-type set is 43 manual trades. The value statement now
 *      carries the canonical profession through the ONE lexicon matching and
 *      the profile extractor already share, and the form offers its name.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("1. the generic vacancy page walks its index", () => {
  const src = read("lib", "vacancy-store", "vacancy-read.ts");
  it("searchPublicVacancies orders NULLS LAST on the generic path only", () => {
    expect(src).toMatch(/const genericPath = !filters\.country && !filters\.professionSlug;/);
    expect(src).toMatch(/\.order\("published_at", \{ ascending: false, nullsFirst: !genericPath \}\)/);
  });
});

describe("2. a failed external feed degrades to 'not available', never a broken board", () => {
  const src = read("lib", "opportunities", "external-vacancies.ts");
  it("both searchPublicVacancies calls catch vacancy_search_failed and return the unavailable state", () => {
    const catches = src.match(/e\.message\.startsWith\("vacancy_search_failed"\)/g) ?? [];
    expect(catches.length).toBe(2);
    expect(src).toMatch(/return \{ status: "not_provisioned", vacancies: \[\], hasMore: false \} as const;/);
    // Anything else still throws — no blanket swallow.
    expect((src.match(/throw e;/g) ?? []).length).toBe(2);
  });
});

describe("3. the opening brief never lands after the person's first sentence", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
  it("the user callback marks that the person spoke, and the brief checks it before pushing", () => {
    expect(chat).toMatch(/const userSpokeRef = useRef\(false\);/);
    expect(chat).toMatch(/userSpokeRef\.current = true;\s*pushMessage\(\{ id: nid\(\), role: "user"/);
    const effect = chat.slice(chat.indexOf("const openedWithStateRef"), chat.indexOf("Kokie kriterijai pas mane"));
    expect(effect).toMatch(/if \(userSpokeRef\.current\) return;\s*pushMessage\(/);
  });
});

describe("4. a named profession reaches the need form's role field", () => {
  it("the value statement carries professionSlug from the ONE lexicon (no second list)", () => {
    const src = read("lib", "structuring", "value-statement.ts");
    expect(src).toMatch(/import \{ detectNeedProfession \} from "@\/lib\/market\/need-skills";/);
    expect(src).toMatch(/readonly professionSlug: string \| null;/);
    expect(src).toMatch(/const professionSlug = workType\s*\?\s*null\s*:\s*detectNeedProfession\(maskServiceNoun\(folded\)\);/);
  });

  it("demandPrefill offers the localized profession name only as a fallback and only when the catalogue has it", () => {
    const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
    expect(chat).toMatch(/const tProfessions = useTranslations\("professions"\);/);
    const fn = chat.slice(chat.indexOf("const demandPrefill = useCallback("), chat.indexOf("[workTypeLabels, countryLabels, tProfessions]"));
    expect(fn).toMatch(/else if \(v\.professionSlug && tProfessions\.has\(v\.professionSlug\)\)/);
    // The canonical work-type column is never set from a profession guess.
    expect(fn).not.toMatch(/out\.workType = v\.professionSlug/);
  });
});
