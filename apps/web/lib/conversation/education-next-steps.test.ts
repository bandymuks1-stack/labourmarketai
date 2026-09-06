import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { INTERNSHIP_CHIP_CAP, internshipNextSteps } from "@/lib/conversation/education-next-steps";

/**
 * Gap G-C2 (prod walk 2026-09-05, re-measured 2026-09-06 on ca96605b): the
 * student's "kur galiu atlikti praktiką?" was answered honestly ("nothing
 * visible") and then STOPPED — no chip, no next step, no institution. These
 * guards keep the answer a door, never a dead end, without inventing an
 * internship: every chip is an existing conversation affordance, every line
 * is real copy in all eleven catalogs, and the workflow layer wires the
 * decision on exactly the opportunity-type miss.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("internship next steps — the pure decision", () => {
  it("no profession → choosing a direction comes first, then the compass and the whole board", () => {
    const d = internshipNextSteps({ professionSlug: null, institutionName: null });
    expect(d.lines.map((l) => l.key)).toEqual(["internshipChooseDirection", "internshipCompass"]);
    expect(d.chips.map((c) => c.id)).toEqual(["profile", "compass-page", "jobs"]);
  });

  it("a named institution is offered as a door — with its real name, never when absent", () => {
    const withInst = internshipNextSteps({ professionSlug: "scaffolder", institutionName: "Vilniaus kolegija" });
    expect(withInst.lines).toContainEqual({ key: "internshipAskInstitution", institution: "Vilniaus kolegija" });
    expect(withInst.lines.map((l) => l.key)).not.toContain("internshipChooseDirection");
    expect(withInst.chips.map((c) => c.id)).toEqual(["compass-page", "jobs"]);
    const blank = internshipNextSteps({ professionSlug: "scaffolder", institutionName: "   " });
    expect(blank.lines.map((l) => l.key)).toEqual(["internshipCompass"]);
  });

  it("never more than the cap, never a duplicate chip", () => {
    const d = internshipNextSteps({ professionSlug: "", institutionName: "X" });
    expect(d.chips.length).toBeLessThanOrEqual(INTERNSHIP_CHIP_CAP);
    expect(new Set(d.chips.map((c) => c.id)).size).toBe(d.chips.length);
  });
});

describe("the doors exist — chip ids are affordances the conversation already handles", () => {
  const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
  it.each(["profile", "compass-page", "jobs"])('case "%s" is handled by the chat', (id) => {
    expect(CHAT).toMatch(new RegExp(`case "${id}":`));
  });
});

describe("the workflow wires the decision on the opportunity-type miss only", () => {
  const WF = read("lib/ai-workspace/workflows.ts");
  it("runFindWork appends the next steps when the missed dimension is opportunityType", () => {
    expect(WF).toMatch(/missedDimension === "opportunityType"[\s\S]{0,400}loadInternshipNextSteps/);
  });
  it("the read half degrades to nothing invented: both reads are in their own try", () => {
    const SERVER = read("lib/conversation/education-next-steps-server.ts");
    expect(SERVER.match(/try \{/g)?.length).toBeGreaterThanOrEqual(2);
    expect(SERVER).toContain("readLearningCompass");
    expect(SERVER).toContain("listMyEngagements");
  });
});

describe("copy exists in all 11 catalogs (no [EN] debt)", () => {
  const LOCALES = ["lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"];
  const KEYS = ["internshipChooseDirection", "internshipAskInstitution", "internshipCompass", "chipChooseDirection", "chipAllOpportunities"];
  it.each(LOCALES)("%s carries every G-C2 key as real copy", (locale) => {
    const ai = JSON.parse(read(`messages/${locale}.json`)).workspace.ai as Record<string, string>;
    for (const k of KEYS) {
      expect(typeof ai[k], `${locale}.workspace.ai.${k}`).toBe("string");
      expect(ai[k].length, `${locale}.workspace.ai.${k}`).toBeGreaterThan(3);
      expect(ai[k], `${locale}.workspace.ai.${k}`).not.toMatch(/\[EN\]/);
    }
    expect(ai.internshipAskInstitution).toContain("{institution}");
  });
});
