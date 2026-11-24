import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";

/**
 * Owner Master Execution Contract 2026-09-04 §15 — the student needs
 * "education context · skills/evidence · qualification state · Learning
 * Compass · gaps · appropriate work · real next action". Before this slice
 * "mano kompasas" answered with a route chip; a student asking "ką man
 * mokytis?" was sent to a page.
 */

const APP = join(__dirname, "..", "..");
const CHAT = readFileSync(join(APP, "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
const WF = readFileSync(join(APP, "lib", "ai-workspace", "workflows.ts"), "utf8");

describe("the student's questions reach the compass answer (five locales)", () => {
  it.each([
    "Parodyk mano mokymosi kompasą",
    "Ką man mokytis?",
    "What should I learn?",
    "Что мне учить?",
    "Was soll ich lernen?",
    "Wat moet ik leren?",
    "kuo aš tampu?",
  ])("%s", (text) => {
    expect(classifyIntent(text).intent).toBe("learning-compass");
  });

  it("is a READ answered in the chat, no longer a route", () => {
    expect(INTENT_REGISTRY["learning-compass"].access).toBe("read");
    expect(CHAT).toMatch(/identity === "person"\s*\?\s*runWorkflow\(\(\) => runLearningCompass\(\)\)/);
  });
});

describe("the answer is composed from the ONE canonical compass read", () => {
  it("enters readLearningCompass (same rows the profile section renders) and carries the five parts", () => {
    expect(WF).toMatch(/readLearningCompass\(\)/);
    for (const part of ['tc("becoming")', 'tc("evidence")', 'tc("fits")', 'tc("missing")', "nextSteps"]) {
      expect(WF, part).toContain(part);
    }
    // W4: no query, no route emitted here — next steps are chat actions.
    expect(WF).not.toMatch(/\b(chipId|id)\s*:\s*["'`]link:/);
    expect(WF).toMatch(/choose_direction: "profile"/);
    expect(WF).toMatch(/log_first_entry: "logwork"/);
    expect(WF).toMatch(/express_interest: "jobs"/);
    expect(CHAT).toMatch(/case "compass-page":/);
  });

  it("a catalog without the compass vocabulary gets an honest answer + the compass chip, never half-translated lines", () => {
    expect(WF).toMatch(/if \(!tc\.has\("becoming"\)\)/);
    expect(WF).toMatch(/text: t\("compassLocaleGap"\)/);
  });

  it("every workflow key exists in all 11 catalogs", () => {
    const keys = ["compassBlocked", "whyCompassBlocked", "whyCompass", "chipCompassPage", "compassMissingLine", "compassLocaleGap"];
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const ai = JSON.parse(readFileSync(join(APP, "messages", `${locale}.json`), "utf8")).workspace.ai as Record<string, string>;
      for (const key of keys) {
        expect(ai[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(ai[key]).not.toMatch(/^\[EN\]/);
      }
    }
  });
});
