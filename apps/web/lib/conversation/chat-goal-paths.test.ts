import { describe, expect, it } from "vitest";

import { readCompoundStatement } from "./compound-statement";
import { guessDocumentType } from "./document-type-guess";
import { classifyIntent } from "./intent-router";
import { targetOccupationFromSentence } from "./target-occupation-gap";
import { readHelpTopic } from "./product-help";

/**
 * A PERSON WHO STATES A GOAL REACHES ITS ANSWER, IN EVERY LANGUAGE
 * (chat path check 2026-11-19).
 *
 * Six everyday goals, written the way a person types them, in the seven
 * product languages. On main, "I want to retrain as an electrician" was
 * `unknown` in all seven, "I need 3 warehouse workers from Monday" in German
 * and Dutch, and "How do I delete my account?" in German, Dutch and Swedish:
 * each got the generic "What can I do here?" instead of its answer.
 *
 * The intents are the existing ones and lead to existing results: the job
 * search, the demand intake, the journal entry, the target-occupation gap
 * (the skills between the person and the occupation they name), the CV and
 * the privacy page.
 */
const GOALS = {
  lt: {
    job: "Ieškau suvirintojo darbo Kaune",
    hire: "Man reikia 3 sandėlio darbuotojų nuo pirmadienio",
    record: "Šiandien dirbau 8 valandas, dažiau sienas",
    retrain: "Noriu persikvalifikuoti į elektriką",
    cv: "Noriu susitvarkyti savo CV",
    privacy: "Kaip ištrinti paskyrą?",
  },
  en: {
    job: "I'm looking for a welding job in Kaunas",
    hire: "I need 3 warehouse workers from Monday",
    record: "Today I worked 8 hours painting walls",
    retrain: "I want to retrain as an electrician",
    cv: "I want to sort out my CV",
    privacy: "How do I delete my account?",
  },
  ru: {
    job: "Ищу работу сварщика в Каунасе",
    hire: "Мне нужны 3 работника склада с понедельника",
    record: "Сегодня работал 8 часов, красил стены",
    retrain: "Хочу переквалифицироваться в электрика",
    cv: "Хочу привести в порядок своё резюме",
    privacy: "Как удалить аккаунт?",
  },
  pl: {
    job: "Szukam pracy jako spawacz w Kownie",
    hire: "Potrzebuję 3 pracowników magazynu od poniedziałku",
    record: "Dzisiaj pracowałem 8 godzin, malowałem ściany",
    retrain: "Chcę przekwalifikować się na elektryka",
    cv: "Chcę uporządkować swoje CV",
    privacy: "Jak usunąć konto?",
  },
  de: {
    job: "Ich suche eine Stelle als Schweißer in Kaunas",
    hire: "Ich brauche ab Montag 3 Lagerarbeiter",
    record: "Heute habe ich 8 Stunden Wände gestrichen",
    retrain: "Ich möchte mich zum Elektriker umschulen",
    cv: "Ich möchte meinen Lebenslauf ordnen",
    privacy: "Wie lösche ich mein Konto?",
  },
  nl: {
    job: "Ik zoek werk als lasser in Kaunas",
    hire: "Ik heb vanaf maandag 3 magazijnmedewerkers nodig",
    record: "Vandaag heb ik 8 uur muren geschilderd",
    retrain: "Ik wil me omscholen tot elektricien",
    cv: "Ik wil mijn cv op orde brengen",
    privacy: "Hoe verwijder ik mijn account?",
  },
  sv: {
    job: "Jag söker jobb som svetsare i Kaunas",
    hire: "Jag behöver 3 lagerarbetare från måndag",
    record: "Idag arbetade jag 8 timmar och målade väggar",
    retrain: "Jag vill omskola mig till elektriker",
    cv: "Jag vill ordna mitt CV",
    privacy: "Hur raderar jag mitt konto?",
  },
} as const;

const EXPECTED = {
  job: "find-work",
  hire: "need-workers",
  record: "log-work",
  retrain: "skill-gap",
  cv: "cv-choose",
  privacy: "product-help",
} as const;

describe("every stated goal reaches its intent in all seven languages", () => {
  for (const [lang, goals] of Object.entries(GOALS)) {
    for (const [goal, sentence] of Object.entries(goals)) {
      it(`${lang} · ${goal}: "${sentence}"`, () => {
        expect(classifyIntent(sentence).intent).toBe(EXPECTED[goal as keyof typeof EXPECTED]);
      });
    }
    it(`${lang} · the deletion question opens the privacy page, not settings`, () => {
      expect(readHelpTopic(goals.privacy)?.id).toBe("privacy");
    });
  }
});

describe("the retraining answer measures against the occupation the person names", () => {
  for (const [lang, goals] of Object.entries(GOALS)) {
    it(`${lang}: "${goals.retrain}" names the electrician`, () => {
      expect(targetOccupationFromSentence(goals.retrain)).toBe("electrician");
    });
  }
});

describe("a number that is not people opens no demand form", () => {
  for (const sentence of [
    "Ich brauche ab Montag 3 Stunden frei",
    "Ich brauche für das Projekt 500 Euro",
    "Ik heb volgende week 2 dagen vrij nodig",
    "Ik heb voor de huur 500 euro nodig",
    "Ik heb voor het dak 40 stuks nodig",
  ]) {
    it(`"${sentence}" is not need-workers`, () => {
      expect(classifyIntent(sentence).intent).not.toBe("need-workers");
    });
  }
  it('"Ik heb een baan nodig" (I need a job) stays out of the demand intake', () => {
    expect(classifyIntent("Ik heb een baan nodig").intent).not.toBe("need-workers");
  });
});

describe("a wish to retrain is not a claim to hold a qualification", () => {
  // "persikvalifikuoti" contains "kvalifik", the Lithuanian certificate
  // needle: the chat answered "Certificate: you said you have it".
  it("names no document", () => {
    expect(guessDocumentType("Noriu persikvalifikuoti į elektriką")).toBeNull();
  });
  it("is not read as several stated facts, so the retraining answer owns it", () => {
    expect(readCompoundStatement("Noriu persikvalifikuoti į elektriką").isCompound).toBe(false);
  });
  it("a stated qualification is still a certificate", () => {
    expect(guessDocumentType("Turiu elektriko kvalifikaciją")).toBe("professional_certificate");
  });
});
