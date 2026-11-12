import { describe, expect, it } from "vitest";

import { readAvailabilityDay } from "@/lib/conversation/availability-day";
import { isPlainAffirmation } from "@/lib/conversation/conversation-goal";
import { readCorrectionAsk } from "@/lib/conversation/correct-work-model";
import { guessDocumentType } from "@/lib/conversation/document-type-guess";
import { educationModeFromText } from "@/lib/conversation/education-question";
import { readRole } from "@/lib/conversation/evidence-goal";
import { readFileIntent } from "@/lib/conversation/file-subject";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { parseJournalPeriodPhrase } from "@/lib/conversation/journal-period-phrase";
import { readStatedLanguages } from "@/lib/conversation/language-statement";
import { readRenameTarget } from "@/lib/conversation/organization-rename-phrase";
import { pastWorkOwnWords, readPastWorkPeriod } from "@/lib/conversation/past-work-period";
import { payPrefill, readPayStatement } from "@/lib/conversation/pay-statement";
import { readStatedProgress } from "@/lib/conversation/progress-status-phrase";
import { projectTitleFromSentence } from "@/lib/conversation/project-title-from-sentence";
import { readSkillStatement } from "@/lib/conversation/skill-statement";
import { readStatedProfessions } from "@/lib/conversation/stated-professions";
import { asksForPersonalWorkspace } from "@/lib/conversation/workspace-reference";
import { fold } from "@/lib/conversation/intent-router";
import { matchPeopleByName } from "@/lib/communication/person-name-match";
import { asksAboutAWeek } from "@/lib/planning/week-question";
import { cardModeFromText } from "@/lib/player-card/card-mode-from-text";
import { applyCorrection } from "@/lib/structuring/apply-correction";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { readNeedHeadcount } from "@/lib/structuring/need-headcount";
import {
  SV_TRADE_STEM_SOURCE,
  TRADE_STEM_SOURCE,
  readProfessionStatement,
  readRoleLabel,
} from "@/lib/structuring/role-label";
import { readTeamComposition, structureNeed } from "@/lib/structuring/structure-need";
import {
  parseDurationDays,
  parseEndDate,
  parseStartDate,
  parseTimeWindow,
  stripEndDatePhrase,
} from "@/lib/structuring/time-window";
import { structureValueStatement } from "@/lib/structuring/value-statement";
import { findWordNumbers } from "@/lib/structuring/word-numbers";

/**
 * SWEDISH: THE ROUTER UNDERSTANDS IT — DOES THE READER? (sv activation, 2026-11-12)
 *
 * Routing is step one. After `classifyIntent` names the intent, the chat
 * handler hands the SAME sentence to a deterministic reader that pulls the
 * facts out of it. A code review found "Jag talar svenska och engelska"
 * routed to `language-statement` while the reader returned [], so the chat
 * asked which languages the person had just named.
 *
 * Every case below is the two-step journey for one intent: the router gives
 * the intent AND the reader returns the facts. The readers are the shared
 * ones — the Swedish words sit beside the Polish and German ones — so each
 * block ends with controls that the other languages read exactly as before.
 *
 * Thursday 2026-11-12 is "today" throughout.
 */
const TODAY = "2026-11-12";
const intentOf = (s: string) => classifyIntent(s).intent;

describe("language-statement → readStatedLanguages", () => {
  it("reads the languages a Swedish sentence names", () => {
    expect(intentOf("Jag talar svenska och engelska")).toBe("language-statement");
    expect(readStatedLanguages("Jag talar svenska och engelska")).toEqual([
      { lang: "sv", level: null },
      { lang: "en", level: null },
    ]);
    expect(intentOf("Jag talar engelska och tyska")).toBe("language-statement");
    expect(readStatedLanguages("Jag talar engelska och tyska").map((l) => l.lang)).toEqual(["en", "de"]);
  });

  it("knows every language the reader supports, by its Swedish name", () => {
    const all =
      "engelska, ryska, litauiska, lettiska, estniska, nederländska, tyska, danska, norska, svenska, polska";
    expect(readStatedLanguages(`Jag talar ${all}`).map((l) => l.lang)).toEqual([
      "en", "ru", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl",
    ]);
    expect(readStatedLanguages("Jag pratar holländska").map((l) => l.lang)).toEqual(["nl"]);
  });

  it("reads a level only when one is said — CEFR or mother tongue, never 'flytande'", () => {
    expect(readStatedLanguages("Jag pratar flytande svenska, engelska B2 och lite polska")).toEqual([
      { lang: "sv", level: null },
      { lang: "en", level: "B2" },
      { lang: "pl", level: null },
    ]);
    expect(readStatedLanguages("Svenska är mitt modersmål")).toEqual([{ lang: "sv", level: "native" }]);
  });

  it("controls: the other languages read as before, and Swedish stems open on nothing else", () => {
    expect(readStatedLanguages("Kalbu angliškai ir rusiškai.").map((l) => l.lang)).toEqual(["en", "ru"]);
    expect(readStatedLanguages("I speak English and German").map((l) => l.lang)).toEqual(["en", "de"]);
    expect(readStatedLanguages("Mówię po angielsku i niemiecku").map((l) => l.lang)).toEqual(["en", "de"]);
    expect(readStatedLanguages("Ich spreche Deutsch und Polnisch").map((l) => l.lang)).toEqual(["de", "pl"]);
    // `rysk` is Lithuanian "ryškiai" folded; `dansk` is inside "Gdańsk".
    expect(readStatedLanguages("Kalbu aiškiai ir ryškiai")).toEqual([]);
    expect(readStatedLanguages("Pracuję w Gdańsku")).toEqual([]);
    expect(readStatedLanguages("Išmokau skaityti techninius brėžinius.")).toEqual([]);
  });
});

describe("profession-statement → readProfessionStatement", () => {
  it.each([
    ["Jag är redovisningsekonom", "Redovisningsekonom", "present"],
    ["Jag jobbar som svetsare", "Svetsare", "present"],
    ["Jag arbetar som sjuksköterska", "Sjuksköterska", "present"],
    ["Jag är utbildad elektriker", "Elektriker", "present"],
    ["Jag är lastbilschaufför", "Lastbilschaufför", "present"],
    ["Jag jobbade som snickare", "Snickare", "past"],
  ] as const)("%s", (sentence, label, tense) => {
    expect(intentOf(sentence)).toBe("profession-statement");
    expect(readProfessionStatement(sentence)).toMatchObject({ label, tense });
  });

  it("reads the catalogue profession and the years when they are said", () => {
    expect(readProfessionStatement("Jag jobbar som svetsare")?.professionSlug).toBe("welder");
    expect(intentOf("Jag har jobbat som snickare i 5 år")).toBe("profession-statement");
    expect(readProfessionStatement("Jag har jobbat som snickare i 5 år")).toMatchObject({
      label: "Snickare",
      professionSlug: "carpenter",
      years: 5,
      tense: "past",
    });
    expect(readProfessionStatement("Mitt yrke är svetsare")?.label).toBe("Svetsare");
  });

  it("reads several professions joined with 'och'", () => {
    expect(readStatedProfessions("Jag är svetsare och elektriker").map((r) => r.professionSlug)).toEqual([
      "welder",
      "electrician",
    ]);
  });

  it("reads a compound whose head comes last, but not a word that merely contains a noun", () => {
    expect(readProfessionStatement("Jag är förskollärare")?.label).toBe("Förskollärare");
    expect(readProfessionStatement("Jag jobbar som byggnadssnickare")?.label).toBe("Byggnadssnickare");
    // "klarare" (clearer) holds "lärare" after one letter.
    expect(readProfessionStatement("Jag är klarare nu")).toBeNull();
    expect(intentOf("Jag är klarare nu")).not.toBe("profession-statement");
  });

  it("states nothing when the sentence denies it or names no occupation", () => {
    expect(readProfessionStatement("Jag är inte svetsare")).toBeNull();
    expect(readProfessionStatement("Jag är trött idag")).toBeNull();
    expect(readProfessionStatement("Jag är ekonomiskt oberoende")).toBeNull();
    expect(readProfessionStatement("Jag är här")).toBeNull();
  });

  it("the router and the reader share ONE Swedish trade list", () => {
    expect(TRADE_STEM_SOURCE).toContain(SV_TRADE_STEM_SOURCE);
    expect(SV_TRADE_STEM_SOURCE).toContain("svetsar");
  });

  it("controls: the other languages read exactly as before", () => {
    expect(readProfessionStatement("I am an accountant")?.label).toBe("Accountant");
    expect(readProfessionStatement("Ich bin Buchhalter")?.label).toBe("Buchhalter");
    expect(readProfessionStatement("Ik ben boekhouder")?.label).toBe("Boekhouder");
    expect(readProfessionStatement("я инженер")?.label).toBe("Инженер");
    expect(readProfessionStatement("esu buhalteris")?.label).toBe("Buhalteris");
    expect(readProfessionStatement("dirbau projektų vadovu 5 metus")).toMatchObject({ years: 5, tense: "past" });
    expect(readProfessionStatement("Ich bin Hans")).toBeNull();
    // A Swedish noun does not become readable behind another language's anchor.
    expect(readProfessionStatement("I am a svetsare")).toBeNull();
    // Lithuanian "ar" (or) is not the Swedish "år".
    expect(readProfessionStatement("esu suvirintojas 5 ar 6 metus")?.years).toBe(6);
  });
});

describe("need-workers / offer-capacity / offer-value → the value and need readers", () => {
  it("reads role, headcount, place and start from a Swedish need", () => {
    const s = "Vi behöver 5 svetsare i Göteborg från 1 december i 3 veckor";
    expect(intentOf(s)).toBe("need-workers");
    const v = structureValueStatement(s, TODAY);
    expect(v).toMatchObject({
      axis: "seek",
      subject: "workforce",
      headcount: 5,
      workType: "welder",
      country: "SE",
      city: "Göteborg",
    });
    expect(v.window).toMatchObject({ kind: "from_date", startIso: "2026-12-01", endIso: "2026-12-21" });
    expect(structureNeed({ description: s })).toMatchObject({ workType: "welder", country: "SE", teamSize: 5 });
  });

  it("reads a number written as a word, and 'next month'", () => {
    expect(structureValueStatement("Vi behöver två elektriker i Stockholm", TODAY)).toMatchObject({
      headcount: 2,
      workType: "electrician",
      city: "Stockholm",
    });
    expect(findWordNumbers("två tre fyra fem sju åtta nio tio tolv tjugo").map((n) => n.value)).toEqual([
      2, 3, 4, 5, 7, 8, 9, 10, 12, 20,
    ]);
    expect(intentOf("Vi behöver personal nästa månad")).toBe("need-workers");
    expect(structureValueStatement("Vi behöver personal nästa månad", TODAY).window).toMatchObject({
      kind: "next_month",
      startIso: "2026-12-01",
    });
  });

  it("reads one, several and a team composition", () => {
    expect(readNeedHeadcount("Vi behöver 5 svetsare")?.total).toBe(5);
    expect(readNeedHeadcount("Vi behöver en svetsare")).toMatchObject({ total: 1, basis: "singular_occupation" });
    expect(readNeedHeadcount("Vi behöver några svetsare")?.clarification).toBe("headcount_unclear");
    expect(readTeamComposition("3 lag om 4 personer")).toMatchObject({ status: "known", total: 12 });
  });

  it("names a profession the catalogue lacks, in the person's own word", () => {
    expect(intentOf("Vi behöver en redovisningsekonom")).toBe("need-workers");
    expect(readRoleLabel("Vi behöver en redovisningsekonom")?.label).toBe("Redovisningsekonom");
    expect(structureValueStatement("Vi behöver en redovisningsekonom", TODAY)).toMatchObject({
      axis: "seek",
      subject: "workforce",
      roleLabel: "Redovisningsekonom",
    });
  });

  it("a person looking for work is never read as an employer's need", () => {
    expect(readRoleLabel("Jag söker jobb som svetsare")).toBeNull();
    expect(readRoleLabel("Jag söker extrajobb som ekonom")).toBeNull();
    expect(intentOf("Jag söker jobb som svetsare")).not.toBe("need-workers");
    expect(intentOf("Jag söker tjänst som ekonom")).not.toBe("need-workers");
    // A compound job noun is still the person's own search.
    expect(intentOf("Jag söker sommarjobb som kock")).toBe("find-work");
    expect(intentOf("Jag söker jobb i Sverige")).toBe("find-work");
  });

  it("reads supply and a sale", () => {
    expect(intentOf("Vi har 20 svetsare tillgängliga.")).toBe("offer-capacity");
    expect(structureValueStatement("Vi har 20 svetsare tillgängliga.", TODAY)).toMatchObject({
      axis: "offer",
      subject: "work_capacity",
      headcount: 20,
      workType: "welder",
    });
    expect(intentOf("Jag vill sälja 500 träpallar")).toBe("offer-value");
    expect(structureValueStatement("Jag vill sälja 500 träpallar", TODAY)).toMatchObject({
      axis: "offer",
      subject: "goods",
      subjectLabel: "träpallar",
      offerMode: "sale",
      quantity: { value: 500 },
    });
    expect(intentOf("Behöver någon som kan laga taket")).toBe("need-service");
    expect(structureValueStatement("Behöver någon som kan laga taket", TODAY).axis).toBe("seek");
  });

  it("a correction of the value just stated is read ('inte … utan …')", () => {
    const prev = structureValueStatement("Jag vill sälja 500 träpallar", TODAY);
    const fixed = applyCorrection(prev, "Inte 500 utan 300", TODAY);
    expect(fixed?.statement.quantity?.value).toBe(300);
  });

  it("controls: other languages, and the words Swedish shares with them", () => {
    expect(structureValueStatement("We need 5 welders in Rotterdam from Monday", TODAY)).toMatchObject({
      axis: "seek",
      headcount: 5,
      workType: "welder",
      city: "Rotterdam",
    });
    expect(structureValueStatement("Potrzebujemy 5 spawaczy w Warszawie", TODAY)).toMatchObject({
      headcount: 5,
      workType: "welder",
      city: "Warszawa",
    });
    // English "personal" is not the Swedish staff noun.
    expect(structureValueStatement("I sell 5 personal computers", TODAY).headcount).toBeNull();
    // Dutch "om 4 uur" is a clock time, not four people per team.
    expect(readTeamComposition("ploeg om 4 uur")?.status).not.toBe("known");
    expect(readTeamComposition("3 teams of 4 people")).toMatchObject({ status: "known", total: 12 });
    // `sex` is an English word and is deliberately not the Swedish six.
    expect(findWordNumbers("sex").length).toBe(0);
    expect(readRoleLabel("We need an accountant")?.label).toBe("Accountant");
    expect(readRoleLabel("Wir brauchen 2 Buchhalter")?.label).toBe("Buchhalter");
    expect(readRoleLabel("We need 3 welders")).toBeNull();
  });
});

describe("availability / add-task / add-document → the date readers", () => {
  it("reads a Swedish start date", () => {
    expect(intentOf("Jag kan jobba från oktober")).toBe("availability");
    expect(parseStartDate("Jag kan jobba från oktober", TODAY)).toBe("2027-10-01");
    expect(parseStartDate("Jag kan jobba från och med den 1 december", TODAY)).toBe("2026-12-01");
    expect(parseStartDate("Jag är ledig från 3 mars", TODAY)).toBe("2027-03-03");
    expect(parseStartDate("från den 15 augusti", TODAY)).toBe("2027-08-15");
    expect(parseStartDate("Jag kan börja i morgon", TODAY)).toBe("2026-11-13");
    expect(parseStartDate("Jag kan börja imorgon", TODAY)).toBe("2026-11-13");
  });

  it("reads a Swedish end date and takes it out of the task title", () => {
    const s = "Lägg till en uppgift i projektet: montera ställningen till den 20 december";
    expect(intentOf(s)).toBe("add-task");
    expect(parseEndDate(s, TODAY, null)).toBe("2026-12-20");
    expect(stripEndDatePhrase("montera ställningen till den 20 december")).toBe("montera ställningen");
    expect(parseEndDate("montera ställningen senast 20 december", TODAY, null)).toBe("2026-12-20");
    expect(parseEndDate("till och med den 20 december", TODAY, null)).toBe("2026-12-20");
    expect(parseEndDate("från 3 till 7 mars", TODAY, null)).toBe("2027-03-07");
    const doc = "Jag har ett nytt certifikat som gäller till 2027-05-01";
    expect(intentOf(doc)).toBe("add-document");
    expect(parseEndDate(doc, TODAY, null)).toBe("2027-05-01");
  });

  it("reads Swedish durations and coarse windows", () => {
    expect(parseDurationDays("i 3 veckor")).toBe(21);
    expect(parseDurationDays("i två månader")).toBe(60);
    expect(parseDurationDays("i 2 år")).toBe(730);
    expect(parseTimeWindow("nästa vecka", TODAY)).toMatchObject({ kind: "next_week", startIso: "2026-11-16" });
    expect(parseTimeWindow("den här veckan", TODAY).kind).toBe("this_week");
    expect(parseTimeWindow("under 10 dagar", TODAY)).toMatchObject({ kind: "days_count", days: 10 });
  });

  it("controls: other languages unchanged; Lithuanian 'ar' is not a Swedish year", () => {
    expect(parseStartDate("I am available from October", TODAY)).toBe("2027-10-01");
    expect(parseStartDate("Mogę pracować od października", TODAY)).toBe("2027-10-01");
    expect(parseStartDate("nuo spalio 5", TODAY)).toBe("2027-10-05");
    expect(parseEndDate("until 20 December", TODAY, null)).toBe("2026-12-20");
    expect(parseEndDate("do 20 grudnia", TODAY, null)).toBe("2026-12-20");
    expect(parseDurationDays("for 3 weeks")).toBe(21);
    expect(parseDurationDays("reikia žmonių į 2 ar 3 objektus")).toBeNull();
    expect(stripEndDatePhrase("erect the scaffold until 20 December")).toBe("erect the scaffold");
  });
});

describe("who-available → readAvailabilityDay", () => {
  it.each([
    ["Vem är ledig i morgon?", "2026-11-13"],
    ["Vem är ledig imorgon?", "2026-11-13"],
    ["Vem är ledig idag?", "2026-11-12"],
    ["Vem är ledig i övermorgon?", "2026-11-14"],
    ["Vem är tillgänglig på måndag?", "2026-11-16"],
    ["Vem är ledig på fredag?", "2026-11-13"],
    ["Vem är ledig nästa torsdag?", "2026-11-19"],
  ])("%s", (sentence, day) => {
    expect(intentOf(sentence)).toBe("who-available");
    expect(readAvailabilityDay(sentence, TODAY)).toBe(day);
  });

  it("a week is not a day; controls read as before", () => {
    expect(readAvailabilityDay("Vem är ledig den här veckan?", TODAY)).toBeNull();
    expect(readAvailabilityDay("Who is available tomorrow?", TODAY)).toBe("2026-11-13");
    expect(readAvailabilityDay("Kto jest dostępny jutro?", TODAY)).toBe("2026-11-13");
    expect(readAvailabilityDay("Wer ist am Montag frei?", TODAY)).toBe("2026-11-16");
    expect(readAvailabilityDay("Who is available this week?", TODAY)).toBeNull();
  });
});

describe("pay-statement → readPayStatement", () => {
  it("reads a euro expectation said in Swedish", () => {
    const s = "Min löneförväntan är 3000 till 3500 euro";
    expect(intentOf(s)).toBe("pay-statement");
    expect(readPayStatement(s)).toEqual({ kind: "range", min: 3000, max: 3500 });
    expect(readPayStatement("Mitt löneanspråk är mellan 3 000 och 3 500 euro")).toEqual({
      kind: "range",
      min: 3000,
      max: 3500,
    });
    expect(readPayStatement("Jag vill ha minst 3200 euro i månaden")).toEqual({ kind: "min", min: 3200 });
    expect(readPayStatement("Högst 4000 euro per månad")).toEqual({ kind: "max", max: 4000 });
    expect(readPayStatement("Jag vill ha 250 euro i veckan")).toEqual({ kind: "not-monthly" });
    expect(readPayStatement("Jag vill ha 150 euro per dag")).toEqual({ kind: "not-monthly" });
  });

  it("NEVER copies kronor into the work card's euro field", () => {
    // The card stores `salary_min_eur` / `salary_max_eur`. 30 000 kr written
    // into it would state a pay expectation roughly eleven times too high.
    const s = "Min löneförväntan är 30000 till 35000 kr";
    expect(intentOf(s)).toBe("pay-statement");
    const pay = readPayStatement(s);
    expect(pay).toEqual({ kind: "other-currency", currency: "kr" });
    expect(payPrefill(pay)).toEqual({});
    expect(readPayStatement("Jag vill ha minst 32000 kronor i månaden").kind).toBe("other-currency");
    expect(readPayStatement("SEK 32000 per månad").kind).toBe("other-currency");
    expect(readPayStatement("Jag vill ha 200 kr i timmen")).toEqual({ kind: "not-monthly" });
  });

  it("controls: euro sentences in the other languages read as before", () => {
    expect(readPayStatement("My salary expectation is 2500 to 3500 EUR")).toEqual({ kind: "range", min: 2500, max: 3500 });
    expect(readPayStatement("Moje wynagrodzenie od 2500 do 3500 euro")).toEqual({ kind: "range", min: 2500, max: 3500 });
    expect(readPayStatement("Mano atlyginimo lūkestis nuo 2500 iki 3500 eurų")).toEqual({ kind: "range", min: 2500, max: 3500 });
    expect(readPayStatement("I want at least 3000 EUR per month")).toEqual({ kind: "min", min: 3000 });
    expect(readPayStatement("salary 150 eur per day")).toEqual({ kind: "not-monthly" });
    expect(readPayStatement("atlyginimas 15 €/val.")).toEqual({ kind: "none" });
  });
});

describe("correct-work → readCorrectionAsk", () => {
  it("reads the corrected hours and the corrected day", () => {
    expect(intentOf("Inte 5 utan 6 timmar")).toBe("correct-work");
    expect(readCorrectionAsk("Inte 5 utan 6 timmar")).toEqual({ kind: "hours", from: 5, to: 6 });
    expect(readCorrectionAsk("Inte 5 timmar utan 6,5")).toEqual({ kind: "hours", from: 5, to: 6.5 });
    expect(readCorrectionAsk("Det var i går")).toEqual({ kind: "day", day: "yesterday" });
    expect(readCorrectionAsk("Det var igår")).toEqual({ kind: "day", day: "yesterday" });
    expect(readCorrectionAsk("Det var i förrgår")).toEqual({ kind: "day", day: "day-before" });
  });

  it("controls", () => {
    expect(readCorrectionAsk("Not 5 but 6 hours")).toEqual({ kind: "hours", from: 5, to: 6 });
    expect(readCorrectionAsk("Nie 5, a 6 godzin")).toEqual({ kind: "hours", from: 5, to: 6 });
    expect(readCorrectionAsk("To było wczoraj")).toEqual({ kind: "day", day: "yesterday" });
    // Lithuanian "į garažą" is not the Swedish "i går".
    expect(readCorrectionAsk("Nuvažiavau į garažą")).toEqual({ kind: "unspecified" });
  });
});

describe("skill-statement → readSkillStatement", () => {
  it("reads the skill in the person's own words", () => {
    expect(intentOf("Jag har lärt mig läsa ritningar")).toBe("skill-statement");
    expect(readSkillStatement("Jag har lärt mig läsa ritningar")?.phrase).toBe("läsa ritningar");
    expect(readSkillStatement("Jag lärde mig köra truck")?.phrase).toBe("köra truck");
    expect(readSkillStatement("Jag behärskar TIG-svetsning")?.phrase).toBe("TIG-svetsning");
  });

  it("controls", () => {
    expect(readSkillStatement("I learned to read blueprints")?.phrase).toBe("to read blueprints");
    expect(readSkillStatement("Nauczyłem się czytać rysunki")?.phrase).toBe("czytać rysunki");
    expect(readSkillStatement("Idag jobbade jag 8 timmar")).toBeNull();
  });
});

describe("rename-organization → readRenameTarget", () => {
  it("reads the new name", () => {
    expect(intentOf("Byt namn på mitt företag till Nonstop Group")).toBe("rename-organization");
    expect(readRenameTarget("Byt namn på mitt företag till Nonstop Group")).toBe("Nonstop Group");
    expect(readRenameTarget("Döp om företaget till Nonstop Group AB")).toBe("Nonstop Group AB");
    expect(readRenameTarget("Ändra företagets namn till Nordisk Bygg AB, tack")).toBe("Nordisk Bygg AB");
  });

  it("controls", () => {
    expect(readRenameTarget("Rename my company to Nonstop Group UAB")).toBe("Nonstop Group UAB");
    expect(readRenameTarget("Zmień nazwę firmy na Nonstop Group")).toBe("Nonstop Group");
    expect(readRenameTarget("Zmień nazwę firmy na Byt Sp. z o.o.")).toBe("Byt Sp. z o.o.");
  });
});

describe("profession-statement with years → readPastWorkPeriod", () => {
  it("reads a Swedish work-history period instead of opening today's journal", () => {
    const s = "2019–2022 jobbade jag på företaget X i Tyskland";
    expect(intentOf(s)).toBe("profession-statement");
    expect(readPastWorkPeriod(s, 2026)).toEqual({ startYear: 2019, endYear: 2022, isCurrent: false });
    expect(pastWorkOwnWords(s)).toBe("på företaget X i Tyskland");
    expect(intentOf("Jag arbetade på Volvo 2015 till 2020")).toBe("profession-statement");
    expect(readPastWorkPeriod("Jag arbetade på Volvo 2015 till 2020", 2026)).toEqual({
      startYear: 2015,
      endYear: 2020,
      isCurrent: false,
    });
    expect(readPastWorkPeriod("Jag jobbade som snickare 2019–2022", 2026)?.startYear).toBe(2019);
    expect(readPastWorkPeriod("Jag har jobbat på Skanska från 2020 till nu", 2026)).toEqual({
      startYear: 2020,
      endYear: null,
      isCurrent: true,
    });
  });

  it("a calendar date is still a work entry; controls", () => {
    expect(intentOf("2026-11-10 jobbade jag 5 timmar")).toBe("log-work");
    expect(readPastWorkPeriod("2026-11-10 jobbade jag 5 timmar", 2026)).toBeNull();
    expect(readPastWorkPeriod("Idag jobbade jag från 8 till 17", 2026)).toBeNull();
    expect(readPastWorkPeriod("2019-2022 I worked at company X in Germany", 2026)).toEqual({
      startYear: 2019,
      endYear: 2022,
      isCurrent: false,
    });
    expect(pastWorkOwnWords("2019-2022 I worked at company X in Germany")).toBe("at company X in Germany");
  });
});

describe("journal questions → the period, week and skill readers", () => {
  it("reads the period a Swedish journal question names", () => {
    const s = "Vilken aktivitet tar mest av min tid den här månaden?";
    expect(intentOf(s)).toBe("journal-activities-top");
    expect(parseJournalPeriodPhrase(s)).toBe("month");
    expect(parseJournalPeriodPhrase("Vad gjorde jag förra veckan?")).toBe("week");
    expect(parseJournalPeriodPhrase("Vad har jag gjort idag?")).toBe("today");
    expect(parseJournalPeriodPhrase("Vad gjorde jag i går?")).toBe("yesterday");
    expect(parseJournalPeriodPhrase("Hur mycket har jag jobbat i år?")).toBe("year");
    expect(parseJournalPeriodPhrase("Hur mycket har jag jobbat totalt?")).toBe("all");
    expect(intentOf("Vad gjorde jag den här veckan?")).toBe("journal-recent");
    expect(asksAboutAWeek("Vad gjorde jag den här veckan?")).toBe(true);
  });

  it("reads the skill a Swedish journal question asks about", () => {
    expect(intentOf("Hur mycket har jag svetsat?")).toBe("journal-skill");
    expect(extractJournalSuggestions("Hur mycket har jag svetsat?").skillSlugs).toContain("welding-blueprint");
    expect(extractJournalSuggestions("Var använde jag plattsättning?").skillSlugs).toContain("tiling");
    expect(extractJournalSuggestions("Hur mycket har jag programmerat?").skillSlugs).toContain("programming");
  });

  it("reads the hours a Swedish work sentence states", () => {
    expect(intentOf("Idag svetsade jag rör i 6 timmar")).toBe("log-work");
    const read = extractJournalSuggestions("Idag svetsade jag rör i 6 timmar");
    expect(read.time).toEqual({ value: 6, unitSlug: "hours" });
    expect(read.skillSlugs).toContain("welding-blueprint");
    expect(extractJournalSuggestions("Målade väggar i 2 dagar").time).toEqual({ value: 2, unitSlug: "days" });
    expect(extractJournalSuggestions("Today I welded pipes for 6 hours").time).toEqual({ value: 6, unitSlug: "hours" });
    // "Tim" is a name, not an hour.
    expect(extractJournalSuggestions("Helped 2 Tim brothers move").time).toBeNull();
  });

  it("controls: Lithuanian 'ar' is no year, the other languages read as before", () => {
    expect(parseJournalPeriodPhrase("Ar daug dirbau?")).toBeNull();
    expect(parseJournalPeriodPhrase("Show my entries this week")).toBe("week");
    expect(parseJournalPeriodPhrase("Kiek dirbau šį mėnesį?")).toBe("month");
    expect(asksAboutAWeek("Co robiłem w tym tygodniu?")).toBe(true);
    expect(asksAboutAWeek("Show my card")).toBe(false);
  });
});

describe("task-status / stage-status → readStatedProgress", () => {
  it("a blocked or started Swedish task is not written down as done", () => {
    expect(intentOf("Uppgiften montera ställningen är klar")).toBe("task-status");
    expect(readStatedProgress("Uppgiften montera ställningen är klar")).toBe("done");
    expect(intentOf("Uppgiften montera ställningen är blockerad")).toBe("task-status");
    expect(readStatedProgress("Uppgiften montera ställningen är blockerad")).toBe("blocked");
    expect(readStatedProgress("Uppgiften montera ställningen är påbörjad")).toBe("in_progress");
    expect(intentOf("Etappen grundläggning är klar")).toBe("stage-status");
    expect(readStatedProgress("Etappen grundläggning är klar")).toBe("done");
    expect(readStatedProgress("Etappen grundläggning har fastnat")).toBe("blocked");
    expect(readStatedProgress("Etappen tak sitter fast")).toBe("blocked");
    expect(readStatedProgress("Vi började på etappen tak")).toBe("in_progress");
    expect(readStatedProgress("Etappen tak är igång")).toBe("in_progress");
  });

  it("controls: the six earlier languages, and English 'fast' is not 'stuck'", () => {
    expect(readStatedProgress("Stage foundations is done")).toBe("done");
    expect(readStatedProgress("Task install scaffolding is blocked")).toBe("blocked");
    expect(readStatedProgress("Užduotis pradėta")).toBe("in_progress");
    expect(readStatedProgress("Aufgabe ist blockiert")).toBe("blocked");
    expect(readStatedProgress("Задача заблокирована")).toBe("blocked");
    expect(readStatedProgress("Zadanie zablokowane")).toBe("blocked");
    expect(readStatedProgress("The task was done fast")).toBe("done");
  });
});

describe("add-document → guessDocumentType", () => {
  it.each([
    ["Jag har ett nytt certifikat", "professional_certificate"],
    ["Jag har ett nytt pass", "id_document"],
    ["Jag har fått arbetstillstånd", "work_permit"],
    ["Jag har ett nytt uppehållstillstånd", "residence_permit"],
    ["Jag har ett nytt anställningsavtal", "employment_contract"],
    ["Jag har ett nytt truckkort", "professional_certificate"],
    ["Jag har ett nytt A1-intyg", "a1_certificate"],
  ])("%s", (sentence, slug) => {
    expect(guessDocumentType(sentence)).toBe(slug);
  });

  it("controls: 'pass' stands alone, the other languages read as before", () => {
    expect(guessDocumentType("Det passar mig bra")).toBeNull();
    expect(guessDocumentType("En kompass")).toBeNull();
    expect(guessDocumentType("I have a new passport")).toBe("id_document");
    expect(guessDocumentType("I have a new VCA certificate")).toBe("health_safety_card");
    expect(guessDocumentType("Mam nowe zaświadczenie A1")).toBe("a1_certificate");
    expect(guessDocumentType("turiu naują pažymą")).toBe("professional_certificate");
  });
});

describe("the smaller readers", () => {
  it("player-card: which side of the card a Swedish sentence asks for", () => {
    expect(intentOf("Visa mitt kort")).toBe("player-card");
    expect(cardModeFromText("Visa mitt kort")).toBe("identity");
    expect(cardModeFromText("Visa historiken för mitt kort")).toBe("history");
    expect(cardModeFromText("Visa mina färdigheter på kortet")).toBe("skills");
    expect(cardModeFromText("Show my card history")).toBe("history");
    expect(cardModeFromText("Show my card")).toBe("identity");
  });

  it("programmes: create / cohort / assign", () => {
    expect(intentOf("Skapa ett utbildningsprogram")).toBe("programmes");
    expect(educationModeFromText("Skapa ett utbildningsprogram")).toBe("create");
    expect(educationModeFromText("Skapa en ny grupp")).toBe("cohort");
    expect(educationModeFromText("Tilldela en student till programmet")).toBe("assign");
    expect(educationModeFromText("Mina program")).toBe("list");
    expect(educationModeFromText("Create a cohort")).toBe("cohort");
    expect(educationModeFromText("Utwórz program")).toBe("list");
    expect(educationModeFromText("Sukurk programą")).toBe("create");
  });

  it("switch-context: the personal space, and a company whose NAME says 'Personal'", () => {
    expect(intentOf("Byt till mitt personliga konto")).toBe("switch-context");
    expect(asksForPersonalWorkspace("Byt till mitt personliga konto", fold)).toBe(true);
    expect(asksForPersonalWorkspace("Växla till privat", fold)).toBe(true);
    expect(asksForPersonalWorkspace("Byt till mitt företag", fold)).toBe(false);
    // Swedish "personal" means staff — a staffing company's name is not a request.
    expect(asksForPersonalWorkspace("Byt till Nordisk Personal AB", fold, ["Nordisk Personal AB"])).toBe(false);
    expect(asksForPersonalWorkspace("Switch to personal", fold)).toBe(true);
    expect(asksForPersonalWorkspace("Grįžk į mano asmeninį profilį.", fold)).toBe(true);
  });

  it("create-project: a named project", () => {
    expect(intentOf("Skapa ett nytt projekt i Göteborg")).toBe("create-project");
    expect(structureValueStatement("Skapa ett nytt projekt i Göteborg", TODAY).city).toBe("Göteborg");
    expect(projectTitleFromSentence("Skapa ett projekt som heter Hamntornet")).toBe("Hamntornet");
    expect(projectTitleFromSentence("Create a project called Harbour Tower")).toBe("Harbour Tower");
  });

  it("open-conversation: 'med' is a preposition, not somebody's name", () => {
    const people = [
      { name: "Jonas Berg", item: "jonas" },
      { name: "Medina Ali", item: "medina" },
    ];
    expect(intentOf("Öppna en konversation med Jonas")).toBe("open-conversation");
    expect(matchPeopleByName("Öppna en konversation med Jonas", people)).toEqual(["jonas"]);
    expect(matchPeopleByName("Open a conversation with Jonas", people)).toEqual(["jonas"]);
    expect(matchPeopleByName("Skriv till Medina", people)).toEqual(["medina"]);
  });

  it("a file handed over in Swedish is read before the intent path", () => {
    expect(readFileIntent("Ladda upp mitt CV")).toMatchObject({ subject: "self", kind: "cv" });
    expect(readFileIntent("Här är 30 kandidaters CV")?.subject).toBe("many_people");
    expect(readFileIntent("Jag vill ladda upp ett foto av mitt arbete")).toMatchObject({
      subject: "self",
      kind: "work_evidence",
    });
    // A question about a file, and a read-back, hand nothing over.
    expect(readFileIntent("Visa mitt CV")).toBeNull();
    expect(readFileIntent("Visa fotot jag laddade upp")).toBeNull();
    expect(readFileIntent("Upload my resume")).toMatchObject({ subject: "self", kind: "cv" });
    expect(readFileIntent("Noriu pamatyti savo CV")).toBeNull();
  });

  it("a plain yes, and a role in a piece of work", () => {
    for (const yes of ["ja", "okej", "japp", "visst", "absolut", "ja tack"]) {
      expect(isPlainAffirmation(yes), yes).toBe(true);
    }
    expect(isPlainAffirmation("nej")).toBe(false);
    expect(isPlainAffirmation("yes")).toBe(true);
    expect(isPlainAffirmation("taip")).toBe(true);
    expect(readRole("Jag gjorde det själv")).toBe("performed");
    expect(readRole("Jag ledde arbetslaget")).toBe("led");
    expect(readRole("Jag hjälpte till")).toBe("assisted");
    expect(readRole("I did it myself")).toBe("performed");
  });
});
