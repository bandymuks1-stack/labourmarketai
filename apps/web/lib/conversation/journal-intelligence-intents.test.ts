import { describe, expect, it } from "vitest";

import { INTENT_HINTS } from "./intent-catalogue";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * THE CHAT DOORS TO WORK INTELLIGENCE (issue #1689, re-audit 2026-09-11,
 * owner chat lines 2–7).
 *
 * Measured through this router BEFORE the doors existed: "Kiek programavau?"
 * → unknown; "Kur naudojau programavimo įgūdį?" → `profile` (the profile
 * COMPLETENESS answer — confidently wrong); "Kokia veikla užima daugiausia
 * mano laiko?" → unknown; "Kokius įgūdžius naudoju daugiausia?" → `profile`;
 * "Kas patvirtinta?" → unknown. The data behind every line already sat in
 * the work-in-numbers model; only the sentence could not reach it.
 *
 * These assert the INTENT, not merely "not the fallback" (memory:
 * confident wrong answers need the intent asserted), in every routed
 * locale, and that the neighbours the new rules had to outweigh keep their
 * own doors.
 */
describe("work intelligence by sentence — the owner's lines reach their door", () => {
  it("line 2 — how much of ONE kind of work (the recognizer reads the subject)", () => {
    for (const s of [
      "Kiek programavau?",
      "Kiek klojau plyteles?",
      "kiek valandų klojau plyteles šį mėnesį?",
      "How much did I program?",
      "Сколько я программировал?",
      "Wie viel habe ich programmiert?",
      "Hoeveel heb ik geprogrammeerd?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-skill");
    }
  });

  it("line 3 — WHERE a skill was used is a journal read, not a profile edit", () => {
    for (const s of [
      "Kur naudojau programavimo įgūdį?",
      "kur naudojau programavima",
      "Where did I use tiling?",
      "Где я использовал программирование?",
      "Wo habe ich Fliesenlegen verwendet?",
      "Waar heb ik tegelen gebruikt?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-skill");
    }
  });

  it("line 4 — which activity takes most of the time", () => {
    for (const s of [
      "Kokia veikla užima daugiausia mano laiko šį mėnesį?",
      "Ką daugiausia dirbau?",
      "Kur praleidžiu daugiausia laiko?",
      "Which activity takes most of my time this month?",
      "Какая деятельность занимает больше всего времени?",
      "Welche Tätigkeit nimmt die meiste Zeit?",
      "Welke activiteit kost de meeste tijd?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-activities-top");
    }
  });

  it("line 5 — which skills are used most outranks `profile` and `skill-gap`", () => {
    for (const s of [
      "Kokius įgūdžius naudoju daugiausia?",
      "kokius igudzius naudoju daugiausiai",
      "Which skills do I use most?",
      "Какие навыки я использую больше всего?",
      "Welche Fähigkeiten nutze ich am meisten?",
      "Welke vaardigheden gebruik ik het meest?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-skills-top");
    }
  });

  it("line 7 — what is confirmed", () => {
    for (const s of [
      "Kas patvirtinta?",
      "Kiek valandų patvirtinta?",
      "Kurie įrašai patvirtinti?",
      "What is confirmed?",
      "Что подтверждено?",
      "Was ist bestätigt?",
      "Wat is bevestigd?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-confirmed");
    }
  });

  it("line 6 — 'what did I do' stays the journal read (outputs are added in the answer)", () => {
    expect(classifyIntent("Ką padariau per tą laiką?").intent).toBe("journal-recent");
    expect(classifyIntent("Ką šiandien dariau?").intent).toBe("journal-recent");
  });
});

describe("the neighbours keep their own doors", () => {
  it("the hours question with a dirb- verb stays journal-recent (the period answer)", () => {
    for (const s of [
      "Kiek valandų dirbau šiandien?",
      "Kiek dirbau šiandien?",
      "kiek dirbau vakar?",
      "How many hours did I work today?",
      "Сколько часов я работал сегодня?",
      "Wie viele Stunden habe ich heute gearbeitet?",
      "Hoeveel uur heb ik vandaag gewerkt?",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("journal-recent");
    }
  });

  it("the GAP question stays skill-gap, the profile edit stays profile", () => {
    expect(classifyIntent("kokių įgūdžių man trūksta?").intent).toBe("skill-gap");
    expect(classifyIntent("What skills am I missing?").intent).toBe("skill-gap");
    expect(classifyIntent("Каких навыков мне не хватает?").intent).toBe("skill-gap");
    expect(classifyIntent("Welche Fähigkeiten fehlen mir?").intent).toBe("skill-gap");
    expect(classifyIntent("pridėk kalbą").intent).toBe("profile");
  });

  it("the employer's confirmation door and the figures door are untouched", () => {
    expect(classifyIntent("patvirtink Jono darbą").intent).toBe("confirm-work");
    expect(classifyIntent("ką reikia patvirtinti?").intent).toBe("confirm-work");
    expect(classifyIntent("Show my approved hours").intent).toBe("figures");
    expect(classifyIntent("Prepare this week report").intent).toBe("figures");
  });

  it("a 'how many did I get' question is not a journal read", () => {
    // "Kiek gavau pasiūlymų?" carries a -au verb; the exclusion list keeps
    // it out of the skill door so the offers reading is not stolen.
    expect(classifyIntent("Kiek gavau pasiūlymų?").intent).not.toBe("journal-skill");
    // The future-tense "where can I use my skills" is not a journal read.
    expect(classifyIntent("Where can I use my skills?").intent).not.toBe("journal-skill");
  });
});

describe("the doors are READ intents of the journal domain with a proposer hint", () => {
  it.each(["journal-skill", "journal-skills-top", "journal-activities-top", "journal-confirmed"] as const)(
    "%s",
    (intent) => {
      expect(INTENT_REGISTRY[intent].domain).toBe("journal");
      expect(INTENT_REGISTRY[intent].access).toBe("read");
      expect(INTENT_REGISTRY[intent].handler).toBe("workIntelligence");
      expect(INTENT_HINTS[intent].length).toBeGreaterThan(20);
    },
  );
});
