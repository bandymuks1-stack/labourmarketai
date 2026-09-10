import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";
import { understand, ACTION_FLOOR } from "@/lib/conversation/utterance-understanding";

/**
 * A NAME IS NOT A COMMAND (owner slice A, takeover 2026-09-10).
 *
 * THE PRODUCTION JOURNEY THIS GUARD EXISTS FOR. A staffing agency typed its
 * own name into the conversation:
 *
 *     "Baltic Staffing Group"  →  need-workers   (score 3)
 *
 * One weak keyword out of three tokens turned a company's NAME into an
 * employer demand intake — an `access: "write"` intent — inverting SEP-4
 * (DEMAND ≠ SUPPLY) with complete confidence. "UAB Statybos Meistrai" reached
 * `log-work` on a score of 1.
 *
 * WHY A SCORE FLOOR ALONE COULD NOT FIX IT, measured across every sentence the
 * intent tests assert on: "mano CV" also scores 3, and score 3 holds 114
 * legitimate corpus sentences. The separator has to be SHAPE; the floor is
 * only the safety belt for the shape test's known false positives
 * ("Rodyk CV", "Show CV" — reference-shaped, but scoring 8).
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");

describe("the exact defect, pinned", () => {
  it('"Baltic Staffing Group" does not become an operation', () => {
    // The router is deliberately NOT changed — the fix is a layer above it,
    // so this still shows what would have happened.
    expect(classifyIntent("Baltic Staffing Group").intent).toBe("need-workers");
    expect(INTENT_REGISTRY["need-workers"].access, "the defect reached a WRITE").toBe("write");
    const u = understand("Baltic Staffing Group");
    expect(u.kind).toBe("reference");
  });

  it("no reference-shaped name reaches a WRITE intent, in any locale", () => {
    const NAMES = [
      "Baltic Staffing Group",
      "UAB Statybos Meistrai",
      "Nonstop Group",
      "Approved Staffing Ltd",
      "Jonas Petraitis",
      "Acme Solutions Ltd",
      "De Vries Bouw",
      "Bau-Firma GmbH",
      "Real Verified OÜ",
      "Vilniaus Technologijos",
      "Северный Строитель",
      "Bygg AB",
    ];
    for (const name of NAMES) {
      const u = understand(name);
      if (u.kind !== "intent") continue;
      const access = INTENT_REGISTRY[u.intent as RoutedIntent].access;
      expect(access, `"${name}" reached a ${access} intent (${u.intent})`).not.toBe("write");
    }
  });
});

describe("legitimate commands survive the floor", () => {
  // The regression risk of any confidence floor is that it eats real short
  // commands. These are the product's own sentences.
  const COMMANDS: ReadonlyArray<readonly [string, RoutedIntent]> = [
    ["mano CV", "cv-choose"],
    ["Mano CV", "cv-choose"],
    ["Моё CV", "cv-choose"],
    ["my CV", "cv-choose"],
    ["CV", "cv-choose"],
    ["rodyk CV", "cv-view"],
    ["Rodyk CV", "cv-view"],
    ["Show CV", "cv-view"],
    ["покажи резюме", "cv-view"],
    ["ieškau darbo", "find-work"],
    ["ищу работу", "find-work"],
    ["reikia 8 pastolininkų", "need-workers"],
    ["ką galiu padaryti?", "capabilities"],
    ["Player Card", "player-card"],
    ["Papildyti LMC", "lmc"],
  ];
  for (const [sentence, expected] of COMMANDS) {
    it(`"${sentence}" still reaches ${expected}`, () => {
      const u = understand(sentence);
      expect(u.kind, `"${sentence}" was demoted to ${u.kind}`).toBe("intent");
      if (u.kind !== "intent") throw new Error("unreachable");
      expect(u.intent).toBe(expected);
    });
  }
});

describe("B and D still hold", () => {
  it("D — the CV read still routes", () => {
    for (const s of ["Noriu pamatyti savo CV", "I want to see my CV", "Хочу посмотреть своё резюме"]) {
      const u = understand(s);
      expect(u.kind).toBe("intent");
      if (u.kind !== "intent") throw new Error("unreachable");
      expect(u.intent).toBe("cv-view");
    }
  });

  it("B — the capability question still routes, in all five locales", () => {
    const BY_LOCALE = [
      "Ką galiu padaryti šioje paskyroje?",
      "What can I do in this account?",
      "Что я могу сделать в этом аккаунте?",
      "Wat kan ik hier doen?",
      "Was kann ich hier machen?",
    ];
    for (const s of BY_LOCALE) {
      const u = understand(s);
      expect(u.kind).toBe("intent");
      if (u.kind !== "intent") throw new Error("unreachable");
      expect(u.intent).toBe("capabilities");
    }
  });
});

describe("a reference is resolved, not acted on", () => {
  /** The body of the bare-name handler. */
  function handlerBody(): string {
    const start = CHAT.indexOf("const handleReference = useCallback");
    expect(start, "handleReference must exist").toBeGreaterThan(-1);
    const end = CHAT.indexOf("const startProjects", start);
    expect(end).toBeGreaterThan(start);
    return CHAT.slice(start, end);
  }

  it("it resolves against the caller's OWN workspaces first", () => {
    expect(handlerBody()).toMatch(/matchWorkspacesByName\(/);
    expect(handlerBody()).toMatch(/auth\?\.workspaces/);
  });

  it("it never switches context on its own — it offers", () => {
    const body = handlerBody();
    // `performContextSwitch` is the mutation. A name typed alone may not run it.
    expect(body, "a bare name must not switch context by itself").not.toMatch(
      /performContextSwitch/,
    );
    // It hands over the existing membership-validated chip instead.
    expect(body).toMatch(/ws:\$\{/);
  });

  it("it creates nothing and dispatches nothing", () => {
    const body = handlerBody();
    for (const forbidden of ["prepareAction", "dispatchAction", "openForm(", "createOrganization", ".insert(", ".update("]) {
      expect(body, `${forbidden} in a bare-name handler`).not.toContain(forbidden);
    }
  });

  it("an unknown name is answered, not swallowed", () => {
    // "Low-confidence must not mean do nothing."
    expect(handlerBody()).toMatch(/refLooksLikeName/);
    expect(handlerBody()).toMatch(/starterChips/);
  });

  it("the send path consults the understanding layer before routing", () => {
    const send = CHAT.slice(CHAT.indexOf("const reading = understand(sent)"));
    expect(send.slice(0, 400)).toMatch(/reading\.kind === "reference"/);
    expect(send.slice(0, 400)).toMatch(/handleReference\(reading\.text\)/);
  });
});

describe("the layer is additive", () => {
  it("the router itself is unchanged — every match passes through untouched", () => {
    for (const s of [
      "Mums reikia 8 pastolininkų Geteborge po dviejų savaičių",
      "Turime 20 laisvų darbuotojų ir ieškome projektų",
      "Ieškau elektriko darbo Švedijoje",
      // Deliberately included: this scores 5, BELOW the floor, and still
      // passes through — because it is not reference-shaped. The floor alone
      // decides nothing; it only limits how strong a match the SHAPE test may
      // override. An earlier draft of this test asserted the floor here and
      // was simply wrong about its own design.
      "Perjunk į įmonę",
    ]) {
      const m = classifyIntent(s);
      const u = understand(s);
      expect(u.kind, `"${s}" was re-labelled`).toBe("intent");
      if (u.kind !== "intent") throw new Error("unreachable");
      expect(u.intent).toBe(m.intent);
      expect(u.score).toBe(m.score);
    }
  });

  it("a sub-floor match that is NOT reference-shaped is never demoted", () => {
    // The floor is not a gate on its own. If it ever becomes one, everything
    // between "understood weakly" and "understood well" silently disappears.
    const weak = classifyIntent("Perjunk į įmonę");
    expect(weak.score).toBeLessThan(ACTION_FLOOR);
    expect(understand("Perjunk į įmonę").kind).toBe("intent");
  });

  it("one matcher recognises an organisation by name, not two", () => {
    // `startSwitchContext` and the bare-name path must agree about the same
    // word; two copies of the rule would eventually drift.
    const switchBody = CHAT.slice(
      CHAT.indexOf("const startSwitchContext = useCallback"),
      CHAT.indexOf("const handleReference = useCallback"),
    );
    expect(switchBody).toMatch(/matchWorkspacesByName\(/);
  });
});
