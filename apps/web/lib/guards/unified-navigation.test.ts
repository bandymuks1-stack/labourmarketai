import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DASHBOARD_MODULES,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import {
  COMMAND_REGISTRY,
  MAX_COMMAND_RESULTS,
  boundedEditDistance,
  matchCommands,
  normalizeForSearch,
  queryMatchesText,
  scoreCommandEntry,
  typoBudget,
  type CommandAudience,
} from "@/lib/navigation/command-registry";
import { candidateMatches } from "@/lib/search/dashboard-search-model";

/**
 * Unified Text & Voice-Ready Navigation v1 guards.
 *
 * What these pins keep true:
 *
 *  1. BIDIRECTIONAL COVERAGE — every dashboard module that declares the
 *     "command" surface has at least one command-registry entry resolving
 *     to its route (a module can never silently drop out of the ONE search).
 *  2. OWNER PHRASES — the owner's real navigation phrases return at least
 *     one result in LT and EN (the languages the owner actually types).
 *  3. ONE PIPELINE — the voice adapter feeds the SAME query state as
 *     typing; there is exactly one object-search fetch path and no second
 *     command model. Mic renders only behind a real capability check —
 *     honest absence, never a dead button or "coming soon".
 *  4. DETERMINISTIC RANKING + BOUNDED TYPO TOLERANCE — exact label beats
 *     prefix beats synonym beats substring beats fuzzy; the in-house
 *     Damerau-Levenshtein budget is ≤1 for tokens ≥5 chars, ≤2 for ≥8;
 *     results are capped at 5 ("max 5 best" owner rule).
 *  5. ONE MATCHING TRUTH — the object search (candidateMatches) uses the
 *     same queryMatchesText the command scoring uses, so a typo finds the
 *     same object it finds the same command.
 *  6. NO DEAD CALCULATOR ROUTE — the project-price calculator ships in a
 *     parallel PR; its registry entry must land IN THAT PR together with
 *     the real page, never here as a dead link.
 */

const ROOT = join(__dirname, "..", "..");
const FINDER = readFileSync(
  join(ROOT, "components", "app", "command-finder.tsx"),
  "utf8",
);
/** Strip comments so scans pin CODE, not the docstrings that honestly name
 *  the forbidden patterns (same convention as universal-search guard). */
const FINDER_CODE = FINDER.replace(/\/\*[\s\S]*?\*\//g, " ").replace(
  /(^|[^:])\/\/[^\n]*/g,
  "$1",
);

/* ────────────────────────────────────────────────────────────────────── */
/* 1. Bidirectional coverage: every command-surface module is findable     */
/* ────────────────────────────────────────────────────────────────────── */

describe("1. every command-surface dashboard module has a registry entry", () => {
  const commandModules = DASHBOARD_MODULES.filter((m) =>
    m.surfaces.includes("command"),
  );

  it("the module catalogue declares command-surface modules (sanity)", () => {
    expect(commandModules.length).toBeGreaterThan(0);
  });

  it.each(commandModules.map((m) => [m.id] as const))(
    "module %s resolves to at least one command entry",
    (id) => {
      const route = getModuleRoute(id);
      const entries = COMMAND_REGISTRY.filter((e) => e.route === route);
      expect(
        entries.length,
        `module "${id}" (route ${route}) has no command-registry entry — it is invisible to the ONE search`,
      ).toBeGreaterThan(0);
    },
  );
});

/* ────────────────────────────────────────────────────────────────────── */
/* 2. Owner phrases resolve in LT and EN                                   */
/* ────────────────────────────────────────────────────────────────────── */

describe("2. owner navigation phrases return at least one result (lt + en)", () => {
  // Widest honest non-admin audience — what a real signed-in owner-tester
  // with both roles sees. Admin terms are deliberately absent.
  const AUD = new Set<CommandAudience>(["public", "worker", "company"]);

  const PHRASES: ReadonlyArray<readonly [string, string]> = [
    // [lt phrase, en phrase]
    ["mano profilis", "my profile"],
    ["pridėti patirtį", "add experience"],
    ["sukurti cv", "create cv"],
    ["mano dokumentai", "my documents"],
    ["darbo galimybės", "job opportunities"],
    ["paraiškos", "applications"],
    ["susidomėjimai", "interests"],
    ["žinutės", "messages"],
    ["darbuotojų paieška", "worker search"],
    ["įmonės poreikiai", "company needs"],
    ["projektai", "projects"],
    ["darbo žurnalas", "work journal"],
    ["privatumas", "privacy"],
    ["kontakto prašymai", "contact requests"],
    ["nustatymai", "settings"],
    ["rasti komandą", "find a team"],
    ["sukurti darbo poreikį", "create a work need"],
  ];

  it.each(PHRASES)("lt: %s / en: %s", (lt, en) => {
    expect(
      matchCommands(lt, "lt", AUD).length,
      `lt phrase "${lt}" found nothing`,
    ).toBeGreaterThan(0);
    expect(
      matchCommands(en, "en", AUD).length,
      `en phrase "${en}" found nothing`,
    ).toBeGreaterThan(0);
  });

  it("phrases resolve to the RIGHT surface (spot checks)", () => {
    const first = (q: string, locale: "lt" | "en") =>
      matchCommands(q, locale, AUD)[0]?.id;
    expect(first("mano profilis", "lt")).toBe("profile");
    expect(first("darbo žurnalas", "lt")).toBe("work_journal");
    expect(first("kontakto prašymai", "lt")).toBe("contact_requests");
    expect(first("pridėti patirtį", "lt")).toBe("add_experience");
    expect(first("žinutės", "lt")).toBe("messages");
    expect(
      matchCommands("darbuotojų paieška", "lt", AUD).map((e) => e.id),
    ).toContain("find_workers");
    expect(
      matchCommands("sukurti darbo poreikį", "lt", AUD).map((e) => e.id),
    ).toContain("work_demand");
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 3. Voice adapter: ONE pipeline, capability-gated, honest absence        */
/* ────────────────────────────────────────────────────────────────────── */

describe("3. voice input feeds the ONE existing search pipeline", () => {
  it("the transcript handler calls the same setQuery state setter typing uses", () => {
    // The mic result feeds setQuery — the exact state the input's onChange
    // sets, which drives matchCommands AND the object-search effect.
    expect(FINDER).toMatch(/onresult\s*=/);
    expect(FINDER).toMatch(/setQuery\(transcript\)/);
    expect(FINDER).toMatch(/onChange=\{\(e\) => setQuery\(e\.target\.value\)\}/);
  });

  it("no second query pipeline: exactly one fetch path, no new endpoint, no external service", () => {
    const fetchCalls = [...FINDER.matchAll(/\bfetch\s*\(/g)];
    expect(fetchCalls.length, "a second fetch path appeared").toBe(1);
    expect(FINDER).toContain("/api/dashboard-search");
    expect(FINDER).not.toMatch(/\/api\/voice|\/api\/speech|\/api\/transcri/i);
    expect(FINDER).not.toMatch(/new WebSocket|MediaRecorder|openai|whisper/i);
  });

  it("browser-native Web Speech API only, recognition language follows the active locale", () => {
    expect(FINDER).toMatch(/webkitSpeechRecognition/);
    expect(FINDER).toMatch(/SPEECH_LANG\[locale\]/);
    // Every ACTIVE locale carries a recognition language.
    for (const tag of ["lt-LT", "en-US", "ru-RU", "nl-NL", "de-DE"]) {
      expect(FINDER).toContain(`"${tag}"`);
    }
  });

  it("capability check gates the button — honest absence when unsupported", () => {
    expect(FINDER).toMatch(/getSpeechRecognitionCtor/);
    expect(FINDER).toMatch(/\{voiceSupported && \(/);
    // No dead-button hedge anywhere in the finder CODE (comments may
    // honestly name the banned pattern).
    expect(FINDER_CODE.toLowerCase()).not.toContain("coming soon");
    expect(FINDER_CODE.toLowerCase()).not.toContain("netrukus");
    expect(FINDER_CODE).not.toMatch(/disabled=\{[^}]*voice/i);
  });

  it("keyboard accessible + labelled; no transcript persisted", () => {
    expect(FINDER).toMatch(/type="button"/);
    expect(FINDER).toMatch(/aria-label=\{listening \? t\("voiceStop"\) : t\("voiceStart"\)\}/);
    expect(FINDER).toMatch(/aria-pressed=\{listening\}/);
    // The only localStorage write stays the recent-command IDS write.
    const writes = [...FINDER.matchAll(/localStorage\.setItem\(/g)];
    expect(writes.length).toBe(1);
    expect(FINDER).not.toMatch(/setItem\([^)]*transcript/i);
  });

  it("voice copy exists in every active locale", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"]) {
      const msgs = JSON.parse(
        readFileSync(join(ROOT, "messages", `${loc}.json`), "utf8"),
      ) as Record<string, Record<string, string>>;
      for (const key of ["voiceStart", "voiceStop", "voiceListening"]) {
        expect(
          msgs.commandFinder?.[key]?.trim().length,
          `${loc}.json commandFinder.${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 4. Deterministic ranking + bounded typo tolerance                       */
/* ────────────────────────────────────────────────────────────────────── */

describe("4. ranking is deterministic and typo tolerance is bounded", () => {
  const ALL = new Set<CommandAudience>(["public", "worker", "company"]);

  it('"max 5 best" — the cap is 5', () => {
    expect(MAX_COMMAND_RESULTS).toBe(5);
    // A very generic query may match many entries — never more than 5 shown.
    expect(matchCommands("a", "lt", ALL).length).toBeLessThanOrEqual(5);
  });

  it("exact label match ranks first", () => {
    // "darbo žurnalas" is the exact LT label of work_journal AND a substring
    // match for others — exact label must win position 0.
    expect(matchCommands("darbo žurnalas", "lt", ALL)[0]?.id).toBe(
      "work_journal",
    );
    // "dokumentai" is the exact LT label of documents.
    expect(matchCommands("dokumentai", "lt", ALL)[0]?.id).toBe("documents");
  });

  it("scoring tiers are ordered: exact > prefix > synonym > substring > fuzzy", () => {
    const journal = COMMAND_REGISTRY.find((e) => e.id === "work_journal")!;
    const exact = scoreCommandEntry(journal, normalizeForSearch("darbo žurnalas"), "lt");
    const prefix = scoreCommandEntry(journal, normalizeForSearch("darbo žurn"), "lt");
    const synonym = scoreCommandEntry(journal, normalizeForSearch("dienynas"), "lt");
    const substring = scoreCommandEntry(journal, normalizeForSearch("urnal"), "lt");
    const fuzzy = scoreCommandEntry(journal, normalizeForSearch("zurnlas"), "lt");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(synonym);
    expect(synonym).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThan(0);
  });

  it("matching is deterministic — same query, same order, every time", () => {
    const a = matchCommands("darbo", "lt", ALL).map((e) => e.id);
    const b = matchCommands("darbo", "lt", ALL).map((e) => e.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("typo budget: 0 below 5 chars, 1 from 5, 2 from 8", () => {
    expect(typoBudget(4)).toBe(0);
    expect(typoBudget(5)).toBe(1);
    expect(typoBudget(7)).toBe(1);
    expect(typoBudget(8)).toBe(2);
    expect(typoBudget(12)).toBe(2);
  });

  it("bounded Damerau-Levenshtein handles substitution, deletion, transposition", () => {
    expect(boundedEditDistance("zurnalas", "zurnalas", 2)).toBe(0);
    expect(boundedEditDistance("zurnalas", "zurnales", 2)).toBe(1); // substitution
    expect(boundedEditDistance("zurnalas", "zurnlas", 2)).toBe(1); // deletion
    expect(boundedEditDistance("zurnalas", "zunralas", 2)).toBe(1); // transposition
    expect(boundedEditDistance("zurnalas", "kortele", 2)).toBe(3); // > max → max+1
  });

  it("a one-letter typo finds the command (≥5 char tokens only)", () => {
    // "zurnlas" (missing a) → work journal.
    expect(matchCommands("zurnlas", "lt", ALL).map((e) => e.id)).toContain(
      "work_journal",
    );
    // "projektsa" (transposition) → projects.
    expect(matchCommands("projektsa", "lt", ALL).map((e) => e.id)).toContain(
      "objects_projects",
    );
    // Short garbage stays unmatched — no typo budget under 5 chars.
    expect(matchCommands("xqzw", "lt", ALL)).toEqual([]);
  });

  it("multi-word phrases match by tokens without an exact synonym", () => {
    // "rasti darbuotoju" tokens both prefix-match find_workers haystyacks.
    expect(
      matchCommands("rasti darbuotoju", "lt", ALL).map((e) => e.id),
    ).toContain("find_workers");
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 5. ONE matching truth — commands and objects share queryMatchesText     */
/* ────────────────────────────────────────────────────────────────────── */

describe("5. object search shares the command matching truth", () => {
  it("candidateMatches accepts the same typo the command matcher accepts", () => {
    const c = {
      id: "p1",
      label: "Vilniaus objektas",
      href: "/dashboard/projects/p1",
      haystacks: ["Vilniaus objektas"],
    };
    // Substring (diacritics-insensitive) — unchanged behaviour.
    expect(candidateMatches(c, normalizeForSearch("objektas"))).toBe(true);
    // Typo within budget — same in-house distance the commands use, and
    // candidateMatches agrees with the shared truth function directly.
    expect(queryMatchesText("Vilniaus objektas", normalizeForSearch("objektsa"))).toBe(true);
    expect(candidateMatches(c, normalizeForSearch("objektsa"))).toBe(true);
    // Garbage stays out.
    expect(queryMatchesText("Vilniaus objektas", normalizeForSearch("zzz"))).toBe(false);
    expect(candidateMatches(c, normalizeForSearch("zzz"))).toBe(false);
  });

  it("queryMatchesText is the shared choke-point (source pin)", () => {
    const model = readFileSync(
      join(ROOT, "lib", "search", "dashboard-search-model.ts"),
      "utf8",
    );
    expect(model).toMatch(/queryMatchesText/);
    expect(model).toMatch(
      /from "@\/lib\/navigation\/command-registry"/,
    );
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 6. No dead calculator route (parallel-PR contract)                      */
/* ────────────────────────────────────────────────────────────────────── */

describe("6. the calculator entry ships WITH the calculator page, not before", () => {
  it("exactly one calculator entry exists and its real page ships in this branch", () => {
    const calculatorish = COMMAND_REGISTRY.filter(
      (e) =>
        /calculator|skaiciuokle/i.test(e.id) ||
        /calculator|skaiciuokle/i.test(normalizeForSearch(e.route)),
    );
    // The project-cost calculator page ships in this PR, so its registry
    // entry lands here TOGETHER with the real page (never a dead link, and
    // never a second calculator surface).
    expect(calculatorish.map((e) => e.id)).toEqual(["project_cost_calculator"]);
    expect(calculatorish[0]?.route).toBe("/calculators/project-cost");
    expect(
      existsSync(
        join(
          ROOT,
          "app",
          "[locale]",
          "(marketing)",
          "calculators",
          "project-cost",
          "page.tsx",
        ),
      ),
      "registry entry has no real page — dead link",
    ).toBe(true);
  });

  it("the owner's calculator phrases resolve to the entry (lt + en)", () => {
    const AUD = new Set<CommandAudience>(["public", "worker", "company"]);
    for (const q of [
      "skaičiuoklė",
      "projekto kainos skaičiuoklė",
      "apskaičiuoti projekto kainą",
      "sąmata",
    ]) {
      expect(
        matchCommands(q, "lt", AUD).map((e) => e.id),
        `lt phrase "${q}"`,
      ).toContain("project_cost_calculator");
    }
    expect(matchCommands("calculator", "en", AUD).map((e) => e.id)).toContain(
      "project_cost_calculator",
    );
  });
});
