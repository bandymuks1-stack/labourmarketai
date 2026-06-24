import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Feedback loop guard (full-completion train PR 7).
 *
 * The work → communication → confirmation → evidence → trust loop must be
 * explained honestly: trust comes only from real human confirmations, never a
 * fake rating / reputation / score.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("feedback loop model is honest", () => {
  const model = read("lib/feedback/work-feedback-loop.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  it("trust comes only from real confirmations (hasTrustSignal on confirmations)", () => {
    expect(model).toMatch(/confirmations\s*>\s*0/);
    expect(model).not.toMatch(/rating|reputation|stars?\b|score/i);
  });
});

describe("the feedback loop is explained on the communication surface", () => {
  const page = read("app/[locale]/dashboard/communication/page.tsx");
  it("renders the feedback-loop note", () => {
    expect(page).toMatch(/feature-note-feedback-loop/);
    expect(page).toMatch(/feedbackLoop/);
  });
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: feedbackLoop is quiet CV/work-card copy with no fake AI claim`, () => {
      // Quiet-UI reframe (fix/cv): the confirmer/process + "no fake reputation"
      // explanation was removed; the note now states the CV/work-card benefit.
      const raw = JSON.parse(read(`messages/${loc}.json`)).featureNotes.feedbackLoop as string;
      const txt = raw.toLowerCase();
      expect(/cv|kortel|карточ|card/.test(txt), `${loc} names the CV / work card benefit`).toBe(true);
      // No fake-AI claim. (Match "AI" case-sensitively to avoid the LT non-ASCII
      // word-boundary false positive on words like "įrašai".)
      expect(/\bAI\b/.test(raw) || /dirbtin\w* intelekt|искусственн\w* интеллект/i.test(raw), `${loc} no fake AI claim`).toBe(false);
    });
  }
});
