import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";
import { helpChipsFor, readHelpTopic } from "./product-help";
import { HELP_TOPICS, HELP_TOPIC_IDS, type HelpTopicId } from "./product-help-topics";

const WEB = join(__dirname, "..", "..");
const LOCALES = ["lt", "en", "ru", "de", "nl", "pl", "da", "et", "lv", "no", "sv"] as const;

/** One sentence per topic per router locale. */
const SENTENCES: Record<HelpTopicId, string[]> = {
  projectUse: [
    "Kaip naudotis šiuo projektu?",
    "How do I use this project?",
    "Как пользоваться этим проектом?",
    "Hoe gebruik ik dit project?",
    "Wie benutze ich dieses Projekt?",
    "Jak korzystać z tego projektu?",
  ],
  addPerson: [
    "Kaip pridėti žmogų?",
    "How do I add a person?",
    "Как добавить человека?",
    "Hoe voeg ik een persoon toe?",
    "Wie füge ich eine Person hinzu?",
    "Jak dodać osobę?",
  ],
  hours: [
    "Kur mano valandos?",
    "Where are my hours?",
    "Где мои часы?",
    "Waar zijn mijn uren?",
    "Wo sind meine Stunden?",
    "Gdzie są moje godziny?",
  ],
  offerService: [
    "Kaip pasiūlyti paslaugą?",
    "How do I offer a service?",
    "Как предложить услугу?",
    "Hoe bied ik een dienst aan?",
    "Wie biete ich eine Dienstleistung an?",
    "Jak zaoferować usługę?",
  ],
  warning: [
    "Kodėl atsirado šis perspėjimas?",
    "Why did I get this warning?",
    "Почему появилось это предупреждение?",
    "Waarom zie ik deze waarschuwing?",
    "Warum erscheint diese Warnung?",
    "Dlaczego pojawiło się to ostrzeżenie?",
  ],
  forecast: [
    "Ką reiškia ši prognozė?",
    "What does this forecast mean?",
    "Что означает этот прогноз?",
    "Wat betekent deze prognose?",
    "Was bedeutet diese Prognose?",
    "Co oznacza ta prognoza?",
  ],
  scheduleWorker: [
    "Kaip suplanuoti darbuotoją?",
    "How do I schedule a worker?",
    "Как запланировать сотрудника?",
    "Hoe plan ik een medewerker in?",
    "Wie plane ich einen Mitarbeiter ein?",
    "Jak zaplanować pracownika?",
  ],
  doneWork: [
    "Kur matau atliktą darbą?",
    "Where can I see the completed work?",
    "Где посмотреть выполненную работу?",
    "Waar zie ik het uitgevoerde werk?",
    "Wo sehe ich die erledigte Arbeit?",
    "Gdzie zobaczę wykonaną pracę?",
  ],
};

describe("product-help sentences route to product-help and read back the same topic", () => {
  for (const id of HELP_TOPIC_IDS) {
    it.each(SENTENCES[id])(`%s -> ${id}`, (sentence) => {
      expect(classifyIntent(sentence).intent).toBe("product-help");
      expect(readHelpTopic(sentence)?.id).toBe(id);
    });
  }
});

describe("neighbouring intents keep their routes (opposite-direction controls)", () => {
  it.each([
    ["Kur mano komanda?", "my-team"],
    ["Kaip rasti partnerius?", "find-partners"],
    ["Ieškau darbo", "find-work"],
    ["Parodyk mano projektus", "projects"],
    ["Šiandien dirbau nuo 8 iki 17", "log-work"],
    ["Ką čia galiu padaryti?", "capabilities"],
    ["Ką galiu padaryti šioje paskyroje?", "capabilities"],
  ])("%s -> %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });

  it("statements and unrelated questions are not product-help", () => {
    for (const s of ["Pridėjau žmogų į komandą", "Valandos buvo 8", "Kaip sekasi?", "Noriu paslaugos"]) {
      expect(classifyIntent(s).intent, s).not.toBe("product-help");
    }
  });
});

describe("suppliers, subcontractors and service providers are business-side, not hiring or jobs", () => {
  it.each([
    "Ieškau tiekėjų",
    "Noriu rasti tiekėjų savo įmonei",
    "Reikia subrangovų",
    "Noriu rasti paslaugų teikėją",
    "find a supplier",
    "We are looking for subcontractors",
    "I need a service provider",
    "Ищу поставщиков",
    "Ich suche Lieferanten",
    "Ik zoek een leverancier",
    "Szukam dostawców",
  ])("%s -> find-partners", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("find-partners");
  });

  it("a job search or a hire that merely mentions work keeps its route", () => {
    expect(classifyIntent("Ieškau darbo pas tiekėją").intent).toBe("find-work");
    expect(classifyIntent("Reikia suvirintojų").intent).not.toBe("find-partners");
  });
});

describe("every topic answers in every locale, in plain words, with a door", () => {
  const FORBIDDEN = [/\/dashboard/i, /\brls\b/i, /\bsupabase\b/i, /\broute\b/i, /\bclassif/i, /\bcapability\b/i, /\bintent\b/i, /\[EN\]/];
  for (const loc of LOCALES) {
    it(`${loc}: texts and chip labels exist and leak no internals`, () => {
      const doc = JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"));
      const help = doc.conversation.chat.productHelp as Record<string, unknown>;
      for (const id of HELP_TOPIC_IDS) {
        const text = help[id];
        expect(typeof text, `${loc}.${id}`).toBe("string");
        for (const bad of FORBIDDEN) expect(text as string, `${loc}.${id} ${bad}`).not.toMatch(bad);
      }
      const chips = help.chips as Record<string, string>;
      const own = new Set(
        HELP_TOPICS.flatMap((t) => t.chips.map((c) => c.label)).filter((k) => k.startsWith("chipHelp")),
      );
      for (const key of own) expect(typeof chips[key], `${loc}.chips.${key}`).toBe("string");
    });
  }

  it("every topic offers at least one chip in each identity (never prose alone)", () => {
    for (const topic of HELP_TOPICS) {
      expect(helpChipsFor(topic, "company").length, `${topic.id} company`).toBeGreaterThan(0);
      expect(helpChipsFor(topic, "person").length, `${topic.id} person`).toBeGreaterThan(0);
    }
  });
});
