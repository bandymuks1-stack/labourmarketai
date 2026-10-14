import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";
import { INTENT_REGISTRY } from "./intent-registry";

/**
 * "Kas pasikeitė?" — the person asking what their own work changed reaches
 * the ONE consequence trace (Future Experience A, owner 2026-10-14). Read
 * only; a company noun keeps the company question where it was.
 */
describe("what-changed — routing", () => {
  const ASKS = [
    "Kas pasikeitė nuo vakar?",
    "Kas šiandien pasikeitė?",
    "kas pasikeite",
    "What changed since yesterday?",
    "Что изменилось со вчера?",
    "Wat is er veranderd?",
    "Was hat sich geändert?",
    "Co się zmieniło od wczoraj?",
  ];
  for (const text of ASKS) {
    it(`"${text}" → what-changed`, () => {
      expect(classifyIntent(text).intent).toBe("what-changed");
    });
  }

  it("a company noun keeps the company question on company-overview", () => {
    expect(classifyIntent("Kas naujo mano įmonėje?").intent).toBe("company-overview");
    expect(classifyIntent("What's happening in my company?").intent).toBe("company-overview");
  });

  it("the unqualified 'what is new' stays the activity centre", () => {
    expect(classifyIntent("Kas naujo?").intent).toBe("activity");
  });

  it("sentences about other things do not drift here", () => {
    expect(classifyIntent("parodyk įkeltą nuotrauką").intent).toBe("evidence-photos");
  });
});

describe("what-changed — registration", () => {
  it("is a read intent with its own handler", () => {
    expect(INTENT_REGISTRY["what-changed"]).toMatchObject({ access: "read", handler: "whatChanged" });
  });

  it("the chat wires the handler to the trace adapter and the shared strip", () => {
    const chat = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(chat).toContain("whatChanged: () => startWhatChanged()");
    expect(chat).toContain("readWhatChangedForChat({ locale })");
    expect(chat).toContain("<ChatTraceStrip");
  });

  it("the adapter reads the ONE trace and the ONE wording — never a second read", () => {
    const src = readFileSync(join(__dirname, "what-changed.ts"), "utf8");
    expect(src).toContain("loadConsequenceTrace()");
    expect(src).toContain("traceStepText(step, copy)");
    expect(src).not.toMatch(/\.from\(|\.rpc\(|createAdminClient|service_role/);
  });
});
