import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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

/**
 * 5. PROFESSIONAL LANGUAGE (window 6, production ca96605b measured 2026-09-06).
 *    Six of eleven employer sentences ("Reikia buhalterio.", "reikia
 *    inžinieriaus", "reikia teisininko", "reikia dizainerio", "ieškome
 *    pardavimų specialisto", "Reikia projektų vadovo.") opened the need form
 *    with the role EMPTY — or, for the project manager, the projects list.
 *    "esu programuotojas" / "dirbu inžinieriumi" answered nothing;
 *    "dirbau projektų vadovu 5 metus" opened the projects list. The fixes
 *    live in ONE reader (`lib/structuring/role-label.ts`) that the value
 *    structurer, the intent router and the chat all read from.
 */
describe("5. a profession outside both catalogues still reaches the form, honestly", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
  const router = read("lib", "conversation", "intent-router.ts");
  const value = read("lib", "structuring", "value-statement.ts");
  const registry = read("lib", "conversation", "intent-registry.ts");

  it("the value statement carries roleLabel from the ONE reader; the catalogues keep precedence", () => {
    expect(value).toMatch(/import \{ readRoleLabel \} from "\.\/role-label";/);
    expect(value).toMatch(/readonly roleLabel: string \| null;/);
    expect(value).toMatch(/const role = readRoleLabel\(raw\);/);
  });

  it("demandPrefill offers the person's own word only after the work type and the catalogue profession", () => {
    const fn = chat.slice(chat.indexOf("const demandPrefill = useCallback("), chat.indexOf("[workTypeLabels, countryLabels, tProfessions]"));
    const wt = fn.indexOf("if (roleLabel) out.role = roleLabel;");
    const prof = fn.indexOf("else if (v.professionSlug && tProfessions.has(v.professionSlug))");
    const own = fn.indexOf("else if (v.roleLabel)");
    expect(wt).toBeGreaterThan(-1);
    expect(prof).toBeGreaterThan(wt);
    expect(own).toBeGreaterThan(prof);
    // The free-text label never sets a canonical column.
    expect(fn).not.toMatch(/out\.workType = v\.roleLabel/);
    expect(fn).not.toMatch(/out\.professionSlug/);
    // A coarse window's first day is offered as the editable start.
    expect(fn).toMatch(/if \(v\.window\.startIso\) out\.startDate = v\.window\.startIso;/);
  });

  it("the router composes its occupation patterns from the reader's sources (no second list)", () => {
    expect(router).toMatch(/from "@\/lib\/structuring\/role-label";/);
    for (const name of [
      "SEEK_VERB_SOURCE",
      "ROLE_SUFFIX_GENITIVE_SOURCE",
      "ROLE_NOUN_EXCLUSION_SOURCE",
      "OCCUPATION_STEM_SOURCE",
      "PROFESSION_STATEMENT_ANCHOR_SOURCE",
    ]) {
      expect(router, name).toContain(`\${${name}}`);
    }
    // The service noun must not read as the care assistant in the router either.
    expect(router).toContain("(?<!pa)slaug");
  });

  it("profession-statement is registered and handled with the EXISTING doors only", () => {
    expect(registry).toMatch(/"profession-statement": \{ domain: "profile", access: "read", handler: "professionStatement"/);
    const handler = chat.slice(chat.indexOf("professionStatement: () => {"), chat.indexOf("skillGap: () =>"));
    expect(handler).toMatch(/readProfessionStatement\(text\)/);
    expect(handler).toContain('id: "link:/dashboard/profile"');
    expect(handler).toContain('id: "f:worker.add-work-history"');
    expect(handler).toMatch(/openForm\("worker\.add-work-history", undefined, undefined, \{ title: stated\.label \}\)/);
    // Nothing is persisted from the sentence itself.
    expect(handler).not.toMatch(/dispatch|execute|\.from\(/);
    // An unreadable sentence degrades to the honest menu, never to a guess.
    expect(handler).toMatch(/if \(!stated\) \{\s*assistant\(fallbackText, starterChips\);/);
  });

  it("'esu buhalteris, ieškau darbo' reads the profession BEFORE the search runs (G-A1)", () => {
    const handler = chat.slice(chat.indexOf("findWork: () => {"), chat.indexOf("professionStatement: () => {"));
    expect(handler.indexOf("readProfessionStatement(text)")).toBeGreaterThan(-1);
    expect(handler.indexOf('t("professionStatement.readBesideSearch"')).toBeLessThan(handler.indexOf("runWorkflow(() => runFindWork(text))"));
  });

  it("every locale carries the professionStatement copy", () => {
    const locales = readdirSync(join(WEB, "messages")).filter((f) => f.endsWith(".json"));
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const file of locales) {
      const json = JSON.parse(read("messages", file)) as { conversation?: { chat?: { professionStatement?: Record<string, string> } } };
      const block = json.conversation?.chat?.professionStatement;
      expect(block, file).toBeDefined();
      for (const key of ["understood", "inCatalogue", "notInCatalogue", "pastJob", "readBesideSearch", "chipSetProfession", "chipRecordExperience"]) {
        expect(typeof block?.[key], `${file}: ${key}`).toBe("string");
      }
      expect(block?.understood).toContain("{label}");
      expect(block?.pastJob).toContain("{label}");
      expect(block?.readBesideSearch).toContain("{label}");
    }
  });
});
