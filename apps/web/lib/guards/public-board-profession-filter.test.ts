import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A WORKER MUST BE ABLE TO SEARCH IN THEIR OWN LANGUAGE.
 *
 * The supply is 100% Swedish and the free-text search matches the publisher's
 * own words, so before this filter existed a Lithuanian welder had to guess
 * "svetsare" to reach the 252 welding ads the categorizer had ALREADY
 * classified. Every piece was in place — `search_public_vacancy_previews_v1`
 * takes `p_profession_slug`, the read layer forwards it, 17,145 browsable rows
 * carry a slug, all 49 professions are translated in all five active locales —
 * and the board simply never passed the argument.
 *
 * These pins keep the wiring, the closed set, and the honesty of a zero result.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const ACTIVE_LOCALES = ["en", "lt", "ru", "nl", "de"] as const;
const BOARD = ["app", "[locale]", "(marketing)", "jobs", "page.tsx"] as const;

describe("the board passes the profession filter it always could have", () => {
  it("the search call forwards the slug", () => {
    const page = read(...BOARD);
    expect(page).toContain("professionSlug: profession");
  });

  it("the slug comes from the closed catalogue set, never from raw input", () => {
    // The value reaches a SQL function argument. An unknown string must become
    // "no filter" rather than be forwarded.
    const page = read(...BOARD);
    expect(page).toContain("readProfessionSlugParam(sp.profession)");
    const mod = read("lib", "vacancy-store", "public-vacancy-professions.ts");
    expect(mod).toContain("SLUG_SET.has(slug) ? slug : null");
  });

  it("pagination carries the filter — page 2 must not widen the result set", () => {
    const page = read(...BOARD);
    const fn = page.slice(page.indexOf("const pageHref"));
    expect(fn.slice(0, 400)).toContain('qs.set("profession", profession)');
  });
});

describe("the option list is the catalogue, not a copy of it", () => {
  it("slugs are read from the profession catalogue (doctrine §10)", () => {
    // A hardcoded array here would drift: lib/skills/skill-groups.ts already
    // carries a partial mirror missing eleven professions that have live ads.
    const mod = read("lib", "vacancy-store", "public-vacancy-professions.ts");
    expect(mod).toContain('from "../../messages/en/professions.json"');
    expect(mod).not.toMatch(/PUBLIC_VACANCY_PROFESSION_SLUGS[^=]*=\s*\[/);
  });

  it("every catalogue profession is named in every ACTIVE locale", () => {
    // An option with no label would render its raw slug — English-ish
    // snake_case in a Lithuanian select.
    const en = JSON.parse(read("messages", "en", "professions.json")) as Record<
      string,
      string
    >;
    const slugs = Object.keys(en);
    expect(slugs.length).toBeGreaterThan(40);
    for (const loc of ACTIVE_LOCALES) {
      const cat = JSON.parse(
        read("messages", loc, "professions.json"),
      ) as Record<string, string>;
      const missing = slugs.filter((s) => !cat[s]?.trim());
      expect(missing, `${loc} is missing: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("options are labelled through next-intl, so the select is localized", () => {
    const page = read(...BOARD);
    expect(page).toContain('getTranslations("professions")');
    expect(page).toContain("PUBLIC_VACANCY_PROFESSION_SLUGS.map");
  });
});

describe("a zero result is an answer, not a blank", () => {
  it("an empty filtered page names the profession and offers a way out", () => {
    const page = read(...BOARD);
    expect(page).toContain("EMPTY_FOR_PROFESSION[active](professionName(profession))");
    expect(page).toContain("CLEAR_FILTER[active]");
  });

  it("when BOTH filters are applied, both are named", () => {
    // The RPC ANDs them. Naming only the profession would claim "there are no
    // welder jobs" when the truth is "no welder job also matched your words" —
    // a false statement about the supply, from an empty state that forgot half
    // of what was asked.
    const page = read(...BOARD);
    expect(page).toContain("profession && query");
    expect(page).toContain("EMPTY_FOR_PROFESSION_AND_QUERY[active](");
  });

  it("both empty states exist in all five active locales", () => {
    const page = read(...BOARD);
    for (const block of [
      "EMPTY_FOR_PROFESSION",
      "EMPTY_FOR_PROFESSION_AND_QUERY",
      "PROFESSION_ANY",
      "CLEAR_FILTER",
    ]) {
      const start = page.indexOf(`const ${block}`);
      expect(start, `${block} not found`).toBeGreaterThan(-1);
      const body = page.slice(start, page.indexOf("};", start));
      for (const loc of ACTIVE_LOCALES) {
        expect(body, `${block} missing ${loc}`).toContain(`${loc}:`);
      }
    }
  });
});

describe("publisher text is marked with the language it is written in", () => {
  it("the card sets lang from sourceLanguage on the publisher's own words", () => {
    // WCAG 3.1.2: without this a screen reader speaks Swedish with the
    // reader's phonetics, which is unintelligible rather than merely accented.
    const card = read("components", "marketing", "public-vacancy-card.tsx");
    expect(card).toContain("lang={sourceLang}");
    expect(card).toContain("vacancy.sourceLanguage");
  });

  it("a malformed language value yields no attribute rather than bad markup", () => {
    const card = read("components", "marketing", "public-vacancy-card.tsx");
    expect(card).toContain(": undefined;");
    expect(card).toMatch(/\^\[a-z\]\{2,3\}/);
  });

  it("the DETAIL page marks the same three fields, description included", () => {
    // The description is the longest run of publisher text on the platform and
    // therefore the worst case for a screen reader — fixing only the card
    // would leave the half that matters most unmarked.
    const page = readFileSync(
      join(WEB, "app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("preview.sourceLanguage");
    const marked = page.match(/lang=\{sourceLang\}/g) ?? [];
    expect(marked.length, "title, occupation and description").toBe(3);
  });

  it("OUR text is not mislabelled as the publisher's language", () => {
    const card = read("components", "marketing", "public-vacancy-card.tsx");
    // The chips and the date are translated by us and must carry no lang.
    const chipBlock = card.slice(card.indexOf("{chips.map("));
    expect(chipBlock).not.toContain("lang={sourceLang}");
  });
});
