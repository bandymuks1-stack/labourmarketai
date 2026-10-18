import { describe, expect, it } from "vitest";

import {
  ACTION_FLOOR,
  looksLikeReference,
  understand,
} from "@/lib/conversation/utterance-understanding";
import { classifyIntent } from "@/lib/conversation/intent-router";

describe("THE DEFECT: a name is not a command", () => {
  it('"Baltic Staffing Group" never becomes need-workers again', () => {
    // The exact production sentence. It scored 3 on the single keyword
    // "staffing" and opened an employer DEMAND intake — SEP-4 inverted.
    expect(classifyIntent("Baltic Staffing Group").intent).toBe("need-workers");
    const u = understand("Baltic Staffing Group");
    expect(u.kind).toBe("reference");
    if (u.kind !== "reference") throw new Error("unreachable");
    expect(u.suppressed).toBe("need-workers");
  });

  it('"UAB Statybos Meistrai" never becomes log-work', () => {
    expect(classifyIntent("UAB Statybos Meistrai").intent).toBe("log-work");
    expect(understand("UAB Statybos Meistrai").kind).toBe("reference");
  });

  it("other organisation- and person-shaped names are references, not actions", () => {
    for (const name of [
      "Nonstop Group",
      "Approved Staffing Ltd",
      "Acme Solutions Ltd",
      "Jonas Petraitis",
      "Vilniaus Technologijos",
      "De Vries Bouw",
      "Bau-Firma GmbH",
      "Real Verified OÜ",
    ]) {
      const u = understand(name);
      expect(u.kind, `${name} was read as an action`).not.toBe("intent");
    }
  });
});

describe("legitimate short commands are untouched", () => {
  // Each of these is a real sentence from the product's own corpus. If the
  // floor or the shape test ever starts eating one, this is where it shows.
  const COMMANDS: ReadonlyArray<readonly [string, string]> = [
    ["mano CV", "cv-choose"],
    ["Mano CV", "cv-choose"],
    ["my CV", "cv-choose"],
    ["My CV", "cv-choose"],
    ["моё резюме", "cv-choose"],
    ["Моё CV", "cv-choose"],
    ["CV", "cv-choose"],
    ["rodyk CV", "cv-view"],
    ["Rodyk CV", "cv-view"],
    ["parodyk CV", "cv-view"],
    ["show CV", "cv-view"],
    ["Show CV", "cv-view"],
    ["покажи резюме", "cv-view"],
    ["Покажи резюме", "cv-view"],
    ["ieškau darbo", "find-work"],
    ["Ieškau darbo", "find-work"],
    ["ищу работу", "find-work"],
    ["reikia 8 pastolininkų", "need-workers"],
    ["Reikia 8 Pastolininkų", "need-workers"],
    ["ką galiu padaryti?", "capabilities"],
    ["Ką galiu padaryti?", "capabilities"],
    ["Player Card", "player-card"],
    ["Papildyti LMC", "lmc"],
  ];

  for (const [sentence, expected] of COMMANDS) {
    it(`"${sentence}" still reaches ${expected}`, () => {
      const u = understand(sentence);
      expect(u.kind, `"${sentence}" was demoted`).toBe("intent");
      if (u.kind !== "intent") throw new Error("unreachable");
      expect(u.intent).toBe(expected);
    });
  }
});

describe("the shape test", () => {
  it("a possessive means the phrase is about the speaker, in every locale", () => {
    // JS `\b` is ASCII-derived, so a word-boundary regex silently fails on
    // Cyrillic — "Моё CV" leaked through the first draft. Token comparison.
    for (const s of ["Mano CV", "My CV", "Моё CV", "Mijn CV", "Mein CV", "Наши Проекты"]) {
      expect(looksLikeReference(s), `${s} read as a reference`).toBe(false);
    }
  });

  it("a question is an instruction however it is capitalised", () => {
    expect(looksLikeReference("Ką Galiu Padaryti?")).toBe(false);
  });

  it("a quantity is never a name", () => {
    expect(looksLikeReference("Reikia 8 Pastolininkų")).toBe(false);
  });

  it("one token is never enough to be sure", () => {
    expect(looksLikeReference("CV")).toBe(false);
    expect(looksLikeReference("Nonstop")).toBe(false);
  });

  it("prose is not a name", () => {
    expect(looksLikeReference("Baltic Staffing Group Of Northern Europe Region Ltd")).toBe(false);
  });

  it("a lowercase token means somebody was typing, not naming", () => {
    expect(looksLikeReference("Baltic staffing group")).toBe(false);
    expect(looksLikeReference("Baltic Staffing Group")).toBe(true);
  });
});

describe("the floor is a safety belt, not the separator", () => {
  it("a reference-shaped phrase at or above the floor stays an action", () => {
    // "Rodyk CV" and "Show CV" ARE reference-shaped. Only the score saves
    // them, which is exactly what the floor is for.
    for (const s of ["Rodyk CV", "Show CV", "Player Card"]) {
      expect(looksLikeReference(s), `${s} should be reference-shaped`).toBe(true);
      expect(classifyIntent(s).score).toBeGreaterThanOrEqual(ACTION_FLOOR);
      expect(understand(s).kind).toBe("intent");
    }
  });

  it("nothing at all is still nothing — that path is unchanged", () => {
    expect(understand("").kind).toBe("none");
    expect(understand("qqq zzz").kind).toBe("none");
  });

  it("a strong match is never re-labelled, whatever its shape", () => {
    const strong = classifyIntent("Mums reikia 8 pastolininkų Geteborge");
    expect(strong.score).toBeGreaterThanOrEqual(ACTION_FLOOR);
    expect(understand("Mums reikia 8 pastolininkų Geteborge").kind).toBe("intent");
  });
});

describe("the layer is additive — it never changes what the router decided", () => {
  it("every `intent` result carries exactly the router's own answer", () => {
    for (const s of [
      "Noriu pamatyti savo CV",
      "Ką galiu padaryti šioje paskyroje?",
      "Turime 20 laisvų darbuotojų ir ieškome projektų",
      "Perjunk į įmonę",
      "Ką tu apie mane žinai?",
    ]) {
      const m = classifyIntent(s);
      const u = understand(s);
      expect(u.kind).toBe("intent");
      if (u.kind !== "intent") throw new Error("unreachable");
      expect(u.intent).toBe(m.intent);
      expect(u.score).toBe(m.score);
    }
  });
});
