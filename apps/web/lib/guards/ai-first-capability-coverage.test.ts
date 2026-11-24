import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import {
  COMMAND_REGISTRY,
  matchCommands,
  type CommandAudience,
} from "@/lib/navigation/command-registry";

/**
 * `matchCommands` takes a SET of audiences, not a string. Passing "worker"
 * made every lookup throw, and all 40 assertions failed - INCLUDING the
 * negative control, which is the only reason the harness was suspected before
 * the product was. A control that fails alongside everything else is telling
 * you about your tool.
 */
const AUDIENCES: ReadonlySet<CommandAudience> = new Set<CommandAudience>([
  "public",
  "worker",
  "company",
]);

/**
 * AI-FIRST COVERAGE — can a user ASK for a capability without knowing a route?
 *
 * The owner's P0-K names the capabilities that must be reachable by ordinary
 * intent. This file measures that, capability by capability, and it measures
 * TWO layers because the product has two and they are not interchangeable:
 *
 *   1. the conversation INTENT ROUTER — a sentence typed at the chat becomes a
 *      classified intent, which the chat turns into a form, a projection or a
 *      real domain action;
 *   2. the COMMAND REGISTRY — deterministic text→destination matching, used by
 *      the search control the shell carries at every width.
 *
 * A capability is reachable if EITHER answers, and the distinction matters:
 * doctrine says use rules and search before a model. "How much LMC do I have"
 * is a balance lookup — there is nothing for a model to interpret, and routing
 * it through the registry answers it in every locale at zero cost and zero
 * egress. Requiring an LLM intent for it would be worse, not better.
 *
 * WHAT THIS FILE IS NOT. It does not assert that a capability WORKS — the E2E
 * specs do that. It asserts only that a person who does not know route names
 * can ask for it and arrive somewhere real. A capability that is reachable and
 * broken fails elsewhere; a capability that WORKS and cannot be asked for fails
 * here, and that failure is invisible to every other test in the suite.
 */

type Phrase = { text: string; locale: "lt" | "en" | "ru" };

/** Reachable by the conversation router, the command finder, or both. */
function reach(p: Phrase): { intent: string; score: number; commands: string[] } {
  const m = classifyIntent(p.text);
  const commands = matchCommands(p.text, p.locale, AUDIENCES).map((c) => c.id);
  return { intent: m.intent, score: m.score, commands };
}

function isReachable(p: Phrase): boolean {
  const r = reach(p);
  return r.intent !== "unknown" || r.commands.length > 0;
}

/**
 * The capability list, verbatim from the owner's P0-K, with the phrases a real
 * person types. Lithuanian first — it is what a worker on a site actually
 * writes — plus English and Russian for the two other active pilot languages.
 */
const CAPABILITIES: { group: string; capability: string; phrases: Phrase[] }[] = [
  // ── WORKER ───────────────────────────────────────────────────────────────
  {
    group: "worker",
    capability: "record work",
    phrases: [
      { text: "Įrašyti šiandienos darbą", locale: "lt" },
      { text: "Record today's work", locale: "en" },
      { text: "Записать сегодняшнюю работу", locale: "ru" },
    ],
  },
  {
    group: "worker",
    capability: "show/update profile",
    phrases: [
      { text: "Parodyk mano profilį", locale: "lt" },
      { text: "Show my profile", locale: "en" },
      { text: "Покажи мой профиль", locale: "ru" },
    ],
  },
  {
    group: "worker",
    capability: "show Living CV",
    phrases: [
      { text: "Parodyk mano CV", locale: "lt" },
      { text: "Show my CV", locale: "en" },
      { text: "Покажи моё резюме", locale: "ru" },
    ],
  },
  {
    group: "worker",
    capability: "find opportunities",
    phrases: [
      { text: "Rask man darbo galimybių", locale: "lt" },
      { text: "Find me work opportunities", locale: "en" },
      { text: "Найди мне возможности работы", locale: "ru" },
    ],
  },
  {
    group: "worker",
    capability: "show calendar / tomorrow",
    phrases: [
      { text: "Parodyk mano rytojaus planą", locale: "lt" },
      { text: "Show my plan for tomorrow", locale: "en" },
      { text: "Покажи мой план на завтра", locale: "ru" },
    ],
  },
  // ── EMPLOYER ─────────────────────────────────────────────────────────────
  {
    group: "employer",
    capability: "express workforce need",
    phrases: [
      { text: "Reikia 4 suvirintojų Vokietijoje", locale: "lt" },
      { text: "We need 4 welders in Germany", locale: "en" },
      { text: "Нужны 4 сварщика в Германии", locale: "ru" },
    ],
  },
  {
    group: "employer",
    capability: "see matches / candidates",
    phrases: [
      { text: "Surask darbuotojų", locale: "lt" },
      { text: "Find workers for me", locale: "en" },
      { text: "Найди работников", locale: "ru" },
    ],
  },
  {
    group: "employer",
    capability: "who raised a hand",
    phrases: [
      { text: "Kas susidomėjo mano poreikiu?", locale: "lt" },
      { text: "Who is interested in my need?", locale: "en" },
      { text: "Кто заинтересовался?", locale: "ru" },
    ],
  },
  // ── ORGANIZATION ─────────────────────────────────────────────────────────
  {
    group: "organization",
    capability: "create organization",
    phrases: [
      { text: "Sukurk įmonės profilį", locale: "lt" },
      { text: "Create a company profile", locale: "en" },
      { text: "Создай профиль компании", locale: "ru" },
    ],
  },
  {
    group: "organization",
    capability: "open my organization",
    phrases: [
      { text: "Kas vyksta mano įmonėje?", locale: "lt" },
      { text: "What is happening in my company?", locale: "en" },
      { text: "Что происходит в моей компании?", locale: "ru" },
    ],
  },
  // ── LMC ──────────────────────────────────────────────────────────────────
  {
    group: "lmc",
    capability: "balance",
    phrases: [
      { text: "Kiek turiu LMC?", locale: "lt" },
      { text: "How much LMC do I have?", locale: "en" },
      { text: "Сколько у меня LMC?", locale: "ru" },
    ],
  },
  {
    group: "lmc",
    capability: "history",
    phrases: [
      { text: "Parodyk mano LMC istoriją", locale: "lt" },
      { text: "Show my LMC history", locale: "en" },
      { text: "Покажи историю LMC", locale: "ru" },
    ],
  },
  {
    group: "lmc",
    capability: "top up",
    phrases: [
      { text: "Papildyti LMC", locale: "lt" },
      { text: "Top up LMC", locale: "en" },
      { text: "Пополнить LMC", locale: "ru" },
    ],
  },
];

describe("AI-first coverage — every named capability is reachable by intent", () => {
  for (const c of CAPABILITIES) {
    for (const p of c.phrases) {
      it(`[${c.group}] ${c.capability} — ${p.locale}: "${p.text}"`, () => {
        const r = reach(p);
        expect(
          isReachable(p),
          `"${p.text}" reaches nothing: intent=${r.intent} score=${r.score} commands=[${r.commands.join(",")}]`,
        ).toBe(true);
      });
    }
  }

  /**
   * NEGATIVE CONTROL. The test above is only worth its length if a sentence
   * the product genuinely cannot serve comes back as unreachable. Without this,
   * a router that classified everything as `log-work` would score 100%.
   */
  it("a sentence the product cannot serve is NOT claimed as reachable", () => {
    for (const text of [
      "Kokia rytoj bus oro temperatūra Vilniuje",
      "Book me a flight to Tokyo next Tuesday",
      "Расскажи анекдот про программиста",
    ]) {
      const r = classifyIntent(text);
      const commands = matchCommands(text, "lt", AUDIENCES);
      expect(
        r.intent === "unknown" && commands.length === 0,
        `"${text}" was claimed as ${r.intent} / [${commands.map((c) => c.id).join(",")}]`,
      ).toBe(true);
    }
  });

  /**
   * The command registry is the deterministic half, and it only counts as
   * coverage while its destinations are real. `command-finder.test.ts` proves
   * every route resolves to a page; this pins that the LMC entry specifically
   * survives, because the LMC capabilities above lean on it entirely.
   */
  it("the deterministic half has a real destination for LMC", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "lmc_balance");
    expect(entry?.route).toBe("/dashboard/account#lmc");
  });
});
