import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent-router";
import { readProfessionStatement } from "@/lib/structuring/role-label";
import { structureValueStatement } from "@/lib/structuring/value-statement";
import { parseStartDate } from "@/lib/structuring/time-window";
import { getWorkerForm } from "./worker-forms";
import { workerSaveWorkCardSchema } from "./worker-schemas";

/**
 * Window 6 follow-up (production ca96605b, measured 2026-09-06 by the
 * real-person join walk, the company walk and the public-entry probe). Each
 * block pins one sentence family to the door it must reach and keeps the
 * neighbouring sentence on its old route.
 */

describe("A3 — a stated availability reaches the availability door", () => {
  it.each([
    "galiu dirbti nuo spalio 1 d.",
    "galiu dirbti nuo pirmadienio",
    "galiu pradėti nuo lapkričio",
    "esu laisvas nuo rytojaus",
    "galėsiu dirbti nuo kito mėnesio",
    "I am available from October",
    "I can start from Monday",
    "могу работать с 1 октября",
    "ich kann ab Oktober arbeiten",
    "ik kan vanaf oktober werken",
  ])("%s → availability", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("availability");
  });

  it("the parsed date is the one the work card is opened with", () => {
    expect(parseStartDate("galiu dirbti nuo spalio 1 d.", "2026-09-06")).toBe("2026-10-01");
  });

  it("the work card form carries `availableFrom` (ISO day only) to the schema", () => {
    const form = getWorkerForm("worker.save-work-card");
    expect(form?.fields.some((f) => f.name === "availableFrom")).toBe(true);
    const built = form!.build({ availabilityStatus: "available", availableFrom: "2026-10-01" });
    expect(built.availableFrom).toBe("2026-10-01");
    expect(workerSaveWorkCardSchema.safeParse(built).success).toBe(true);
    expect(form!.build({ availableFrom: "spalio 1" }).availableFrom).toBeNull();
  });

  it.each([
    ["galiu dirbti, ieškau darbo", "find-work"],
    ["turiu dvi laisvas dienas kitą savaitę", "offer-value"],
    ["galiu mokytis vakarais", "unknown"],
  ])("%s keeps %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });
});

describe("A4 — a past job with a country and a span is work history", () => {
  it("'dirbau suvirintoju Norvegijoje 3 metus' → profession-statement, past, welder, 3 years", () => {
    expect(classifyIntent("dirbau suvirintoju Norvegijoje 3 metus").intent).toBe("profession-statement");
    expect(readProfessionStatement("dirbau suvirintoju Norvegijoje 3 metus")).toMatchObject({
      label: "Suvirintojas",
      professionSlug: "welder",
      years: 3,
      tense: "past",
    });
  });
  it("a journal day stays a journal day", () => {
    expect(classifyIntent("dirbau vakar 8 valandas objekte").intent).toBe("log-work");
  });
});

describe("G2 — a present-tense trade activity is an offered service, in any context", () => {
  it.each([
    "remontuoju automobilius",
    "kerpu plaukus",
    "dažau butus",
    "valau namus",
    "montuoju baldus",
    "mokau matematikos",
    "siuvame užuolaidas",
    "I repair cars",
    "ремонтирую машины",
    "ich repariere Autos",
    "ik repareer auto's",
  ])("%s → offer-value", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("offer-value");
  });

  it("the structurer reads it as an OFFER of a SERVICE with the person's own echo", () => {
    expect(structureValueStatement("remontuoju automobilius")).toMatchObject({
      axis: "offer",
      subject: "service",
      subjectLabel: "automobilius",
    });
    expect(structureValueStatement("kerpu plaukus namuose")).toMatchObject({
      axis: "offer",
      subject: "service",
    });
  });

  it.each([
    ["remontuoju automobilius, ieškau darbo", "find-work"],
    ["šiandien montavau langus objekte", "log-work"],
    ["reikia 2 valytojų Kaune", "need-workers"],
  ])("%s keeps %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });
});

describe("G3 — a service asked for by its NAME beats a named profession", () => {
  it.each([
    "reikia buhalterio paslaugų",
    "ieškau korepetitoriaus paslaugų",
    "reikia teisininko paslaugų",
    "reikia valymo paslaugų",
    "reikia korepetitoriaus",
  ])("%s → need-service", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("need-service");
  });
  it("the bare profession stays employer demand", () => {
    expect(classifyIntent("reikia buhalterio").intent).toBe("need-workers");
    expect(classifyIntent("Reikia buhalterio Vilniuje").intent).toBe("need-workers");
  });
});

describe("lane F — professional employer demand in every routed locale", () => {
  it.each([
    "Reikia buhalterio Vilniuje",
    "Reikia 2 buhalterių Vilniuje",
    "Ieškome programuotojo į komandą",
    "I need an accountant in Vilnius",
    "We need a developer for our team",
    "Нужен программист",
    "Wir brauchen 2 Buchhalter",
    "wij zoeken een boekhouder",
  ])("%s → need-workers", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("need-workers");
  });

  it("RU 'Ищу сантехника' is the BUYER side, never the person's own job search", () => {
    const r = classifyIntent("Ищу сантехника");
    expect(r.intent).not.toBe("find-work");
    expect(["need-workers", "need-service"]).toContain(r.intent);
  });

  it("the person's own search keeps find-work in DE too", () => {
    expect(classifyIntent("Ich suche Arbeit in Deutschland").intent).toBe("find-work");
  });
});
