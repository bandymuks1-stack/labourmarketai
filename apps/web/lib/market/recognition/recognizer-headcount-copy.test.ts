import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { recognizeIntent } from "./index";

const WEB = join(__dirname, "..", "..", "..");
const LOCALES = ["lt", "en", "ru", "de", "pl", "nl"] as const;
const messages = (locale: string) =>
  JSON.parse(readFileSync(join(WEB, "messages", `${locale}.json`), "utf8")) as Record<string, unknown>;

/** The message files are read as plain JSON (that is the point: the copy on
 *  disk is what is checked), so the translator is typed as a plain lookup. */
type LooseTranslator = (key: string, values?: Record<string, string | number>) => string;
function translator(locale: string, namespace: string): LooseTranslator {
  const make = createTranslator as unknown as (options: {
    locale: string;
    messages: Record<string, unknown>;
    namespace: string;
  }) => LooseTranslator;
  return make({ locale, messages: messages(locale), namespace });
}

/**
 * The recognize page shows HOW MANY workers it read — "Darbuotojų: 1" for
 * one singular occupation, "Darbuotojų: 12 (3 brigados po 4)" for teams of a
 * stated size — and ASKS when teams are not sized. Every line is real copy in
 * all six active locales.
 */
describe("recognize page headcount copy, six locales", () => {
  const expected: Record<(typeof LOCALES)[number], { one: string; teams: string }> = {
    lt: { one: "Darbuotojų: 1", teams: "Darbuotojų: 12 (3 brigados po 4)" },
    en: { one: "Workers: 1", teams: "Workers: 12 (3 teams of 4)" },
    ru: { one: "Работников: 1", teams: "Работников: 12 (3 бригады по 4)" },
    de: { one: "Arbeitskräfte: 1", teams: "Arbeitskräfte: 12 (3 Teams à 4)" },
    pl: { one: "Pracowników: 1", teams: "Pracowników: 12 (3 brygady po 4)" },
    nl: { one: "Werknemers: 1", teams: "Werknemers: 12 (3 ploegen van 4)" },
  };

  it.each(LOCALES)("%s", (locale) => {
    const t = translator(locale, "marketRecognition");
    expect(t("headcount.total", { count: 1 })).toBe(expected[locale].one);
    expect(t("headcount.teams", { total: 12, teams: 3, perTeam: 4 })).toBe(expected[locale].teams);
    for (const code of ["team_count_range", "per_team_range", "team_size_missing", "team_count_missing"] as const) {
      expect(t(`clarify.${code}`).length, `${locale} clarify.${code}`).toBeGreaterThan(10);
    }
    expect(t("clarify.title").length).toBeGreaterThan(3);

    const chat = translator(locale, "conversation.chat.valueIntent");
    expect(chat("teams", { teams: 3, perTeam: 4 })).toMatch(/3 .* 4$/u);
    expect(chat("ask.team_size").length).toBeGreaterThan(10);
  });

  it("the page renders the count and the clarifying prompt from the card", () => {
    const src = readFileSync(join(WEB, "components", "app", "market", "offer-demand-recognizer.tsx"), "utf8");
    expect(src).toContain('data-testid="recognizer-headcount"');
    expect(src).toContain('t("headcount.total", { count: card.headcount.total })');
    expect(src).toContain('t("headcount.teams", {');
    expect(src).toContain('data-testid="recognizer-clarify"');
    expect(src).toContain("t(`clarify.${card.headcount.clarification}`)");
  });

  it("the card carries what the page renders", () => {
    expect(recognizeIntent("need_workers", { rawText: "Reikia suvirintojo Vilniuje" }).headcount?.total).toBe(1);
    expect(recognizeIntent("need_workers", { rawText: "Reikia 3 brigadų po 4 žmones" }).headcount).toMatchObject({ total: 12, teams: 3, perTeam: 4 });
    expect(recognizeIntent("need_workers", { rawText: "Reikia 3–4 brigadų" }).headcount).toMatchObject({ total: null, clarification: "team_count_range" });
    expect(recognizeIntent("have_project", { rawText: "Reikia brigados" }).headcount?.clarification).toBe("team_size_missing");
  });
});
