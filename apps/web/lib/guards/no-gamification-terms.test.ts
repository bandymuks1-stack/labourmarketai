import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NO GAME OR SPORTS VOCABULARY IN THE PUBLIC PRODUCT (owner decision
 * 2026-09-30, "REBUILD /lt/about. REMOVE GAMIFICATION COMPLETELY").
 *
 * LabourMarket.ai is not a game. These are real people, professions,
 * companies, projects, working hours, evidence and income, so no user-facing
 * string may describe workers, employers, projects, skills or labour-market
 * participation with a game or sports metaphor: player / player card, playing
 * field, division, league, leaderboard, gamification.
 *
 * WHAT IS SCANNED: every string VALUE in every locale catalogue
 * (`messages/*.json` and `messages/<locale>/*.json`). Key NAMES are internal
 * identifiers (`playerCard`, `league`) and are not user-facing, so they are not
 * scanned; renaming them would only churn code.
 *
 * WHAT IS NOT BANNED, on purpose: "score" / "rating" / "ranking" appear in
 * honest NEGATIONS ("no scores, no rankings") and in technical measurement
 * labels ("stored confidence score"); banning them would delete the very
 * sentences that promise the platform does not rank people. Those are audited
 * by `project-staffing-model.test.ts` and the honesty guards instead.
 */

const MESSAGES = join(process.cwd(), "messages");

/** A whole word with UNICODE-aware boundaries. `\b` treats "ą" as a non-letter,
 *  so it would match "lygos" inside "sąlygos" (conditions) — a false positive. */
const W = (word: string) => `(?<!\\p{L})${word}(?!\\p{L})`;

/** Game / sports vocabulary, per language. Whole-word where a stem is ambiguous.
 *  "leaderboard" is NOT listed: `about.trust.no` states "no worker leaderboards"
 *  as a promise, and banning the word would ban the promise. */
const BANNED = new RegExp(
  [
    // EN
    "player[ -]?cards?",
    "playing field",
    "field of play",
    W("leagues?"),
    W("divisions?"),
    "gamif",
    "sports (vocabulary|model)",
    // LT
    "žaidėj",
    "žaidim",
    "divizion",
    W("lyga"),
    W("lygos"),
    W("lygą"),
    // RU
    "игрок",
    "игров",
    "карточк\\p{L}* игрок",
    W("лиг[аиуе]"),
    "дивизион",
    // DE
    "spielerkarte",
    "spielfeld",
    // "liga" alone is also Lithuanian for "sickness", so only the compound forms
    // (Länderliga, Arbeitsmarkt-Liga, Landsliga) and the known phrases are banned.
    // ("-liga" is also a Swedish adjective ending: verkliga, ärliga.)
    "länderliga",
    "arbeitsmarkt-liga",
    "landsliga",
    "arbejdsmarkedsliga",
    "liga-(daten|data)",
    "liga (krajów|rynku)",
    W("ligen"),
    // NL
    "spelerskaart",
    "speelveld",
    "competitie",
    // PL
    "karta zawodnika",
    "karta gracza",
    "karty gracza",
    "boisko",
    "dywizj",
    // Nordic / Baltic
    "spillerkort",
    "spillefelt",
    "spelarkort",
    "spelplan",
    "mängija",
    "mänguväli",
    "spēlētāj",
    "spēles laukum",
    "pelaaja",
    "pelikenttä",
  ].join("|"),
  "iu",
);

function jsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function* strings(node: unknown, path = ""): Generator<[string, string]> {
  if (typeof node === "string") yield [path, node];
  else if (Array.isArray(node)) for (const [i, v] of node.entries()) yield* strings(v, `${path}[${i}]`);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) yield* strings(v, path ? `${path}.${k}` : k);
}

describe("no game or sports vocabulary in any public locale catalogue", () => {
  const files = jsonFiles(MESSAGES);

  it("scans every locale catalogue (11 main files plus the per-locale modules)", () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it("finds no banned term in any string value", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const json = JSON.parse(readFileSync(file, "utf8"));
      for (const [path, value] of strings(json)) {
        if (BANNED.test(value)) offenders.push(`${file.slice(MESSAGES.length + 1)} · ${path} · ${value.slice(0, 80)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the /about namespace no longer carries a sports model", () => {
    for (const file of files.filter((f) => /[\\/](lt|en|ru|nl|de|pl)\.json$/.test(f))) {
      const about = JSON.parse(readFileSync(file, "utf8")).about;
      expect(about?.sportsModel, file).toBeUndefined();
    }
  });

  it("the guard itself catches what it claims to (negative controls)", () => {
    for (const bad of [
      "Your player card",
      "Žaidėjo kortelė",
      "žaidimo aikštė",
      "Divizionai / lygos",
      "Darbo rinkos lyga",
      "Labour market league",
      "Карточка игрока",
      "Spielerkarte",
      "Arbeitsmarkt-Liga",
      "spelerskaart",
      "karta zawodnika",
    "karta gracza",
      "Spillerkort",
      "Karta zawodnika (karta pracy)",
    ]) {
      expect(BANNED.test(bad), bad).toBe(true);
    }
    for (const fine of [
      "Professional profile",
      "Profesinis profilis",
      "No scores, no rankings.",
      "Darbo sąlygos",
      "Kortelė",
      "Playlist",
      "Country labour market",
    ]) {
      expect(BANNED.test(fine), fine).toBe(false);
    }
  });
});

/**
 * Copy that is NOT in a message catalogue: the command finder labels and
 * synonyms are user-visible in every locale and live in a TS registry, so the
 * catalogue scan above cannot see them.
 */
describe("no game or sports vocabulary in the command finder registry", () => {
  it("labels and synonyms carry no banned term", async () => {
    const { COMMAND_REGISTRY } = await import("@/lib/navigation/command-registry");
    const offenders: string[] = [];
    for (const e of COMMAND_REGISTRY) {
      const texts = [
        ...Object.values(e.labels),
        ...Object.values(e.synonyms).flat(),
      ];
      for (const t of texts) if (BANNED.test(t)) offenders.push(`${e.id}: ${t}`);
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

/**
 * "Data model" is system vocabulary: a person using the journal does not need
 * to know there is one. Banned in every locale outside operator namespaces.
 */
describe("no 'data model' wording in user-facing copy (any locale)", () => {
  const RE =
    /duomenų model|data model|datenmodell|datamodel|модел[ьи] данных|model danych|tietomalli|datu modeļ|andmemudel/i;
  const OPERATOR = /^(admin|adminLaunchReadiness|adminPilots|agentOs|intelligence|vacancySources|evidenceImport|crmPipeline|projectOps|salesIntake|telemetry)$/;
  it("finds none", () => {
    const offenders: string[] = [];
    for (const file of jsonFiles(MESSAGES)) {
      const json = JSON.parse(readFileSync(file, "utf8"));
      for (const [path, value] of strings(json)) {
        if (OPERATOR.test(path.split(".")[0])) continue;
        if (RE.test(value)) offenders.push(`${file.slice(MESSAGES.length + 1)} · ${path}`);
      }
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

/**
 * Internal-mechanics leaks: user-facing copy must not explain deployment
 * internals ("not enabled in this environment", "the update is not applied",
 * "this database"). Say what the person can do, not how the system is
 * deployed. Operator namespaces are exempt, and `assist` carries the pinned
 * honest AI-state copy (assist-centre.test.ts).
 */
describe("no deployment-internals wording in user-facing English copy", () => {
  const EXEMPT =
    /^(admin|agentOs|intelligence|vacancySources|evidenceImport|talentPreview|crmPipeline|projectOps|salesIntake|assist)$/;
  it("en.json user namespaces carry no environment/migration wording", () => {
    const en = JSON.parse(readFileSync(join(MESSAGES, "en.json"), "utf8"));
    const re = /in this environment|(not|isn.t) applied|this database|reviewed and applied|switched on/i;
    const offenders: string[] = [];
    for (const [path, value] of strings(en)) {
      if (EXEMPT.test(path.split(".")[0])) continue;
      // Honest AI-state lines are pinned by llm-proposal-reasons.test.ts.
      if (/aiNotConfigured$|companyWorkHistory\.provenance$/.test(path)) continue;
      if (re.test(value)) offenders.push(`${path}: ${value.slice(0, 80)}`);
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});
