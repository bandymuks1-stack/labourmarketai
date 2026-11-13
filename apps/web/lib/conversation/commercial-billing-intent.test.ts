import { describe, expect, it } from "vitest";

import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";
import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * ORDERS AND THE PLAN BY SENTENCE (owner P0 2026-11-12 — chat as the one
 * control layer). Both had a page and MCP tools and no sentence. They are
 * ROUTE intents on purpose: a sentence opens the canonical screen and can
 * never create, send, accept, sign, order, pay or cancel anything.
 */

const COMMERCIAL: readonly string[] = [
  "Parodyk mano sutartis",
  "Kur mano sutartys?",
  "Mano užsakymai",
  "Parodyk komercinius pasiūlymus",
  "Show my contracts",
  "List our contracts",
  "My orders",
  "Show my commercial proposals",
  "Покажи мои договоры",
  "Мои заказы",
  "Zeig meine Verträge",
  "Meine Aufträge",
  "Toon mijn contracten",
  "Mijn opdrachten",
  "Pokaż moje umowy",
  "Moje zamówienia",
];

const BILLING: readonly string[] = [
  "Kokia mano prenumerata?",
  "Parodyk mano prenumeratą",
  "Mano mokėjimai",
  "What subscription do I have?",
  "Show my subscription",
  "What paid plan are we on?",
  "My payments",
  "Billing",
  "Какая у меня подписка?",
  "Какой у нас тариф?",
  "Welches Abonnement habe ich?",
  "Meine Zahlungen",
  "Wat is mijn abonnement?",
  "Mijn betalingen",
  "Jaka jest moja subskrypcja?",
  "Moje płatności",
];

describe("orders and the plan are reachable by sentence", () => {
  for (const text of COMMERCIAL) {
    it(`commercial — "${text}"`, () => {
      expect(classifyIntent(text).intent).toBe("commercial");
    });
  }
  for (const text of BILLING) {
    it(`billing-plan — "${text}"`, () => {
      expect(classifyIntent(text).intent).toBe("billing-plan");
    });
  }
});

describe("no sentence can commit money: both are route-class doors", () => {
  it("neither intent is a write or a read with its own engine", () => {
    expect(INTENT_REGISTRY.commercial).toMatchObject({ access: "route", domain: "money" });
    expect(INTENT_REGISTRY["billing-plan"]).toMatchObject({ access: "route", domain: "money" });
  });
});

describe("neighbours keep their own intent", () => {
  const KEEPS: readonly (readonly [string, string])[] = [
    // The credit ledger is its own intent.
    ["Kiek turiu LMC?", "lmc"],
    ["Show my LMC history", "lmc"],
    ["Papildyti LMC", "lmc"],
  ];
  for (const [text, intent] of KEEPS) {
    it(`"${text}" stays ${intent}`, () => {
      expect(classifyIntent(text).intent).toBe(intent);
    });
  }

  const NEVER: readonly string[] = [
    // A contract UPLOADED as a document is not the commercial screen.
    "Įkelk mano darbo sutartį",
    "Upload my employment contract",
    "Pridėk mano sutartį prie dokumentų",
    "Загрузи мой договор",
    // Work, people and planning sentences.
    "Ieškau darbo Vilniuje",
    "I am looking for a job",
    "Reikia 5 suvirintojų",
    "Kas laisvas šią savaitę?",
    "Vakar dirbau 8 valandas",
    "Sukurk projektą Vilniaus biuras",
    "Priimu pasiūlymą",
    "What is the plan for today?",
    "Koks šios dienos planas?",
    "Mano planas?",
  ];
  for (const text of NEVER) {
    it(`"${text}" is neither commercial nor billing-plan`, () => {
      const { intent } = classifyIntent(text);
      expect(intent).not.toBe("commercial");
      expect(intent).not.toBe("billing-plan");
    });
  }
});
