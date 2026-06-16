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
    it(`${loc}: feedbackLoop copy says no fake reputation, real confirmations`, () => {
      const txt = (JSON.parse(read(`messages/${loc}.json`)).featureNotes.feedbackLoop as string).toLowerCase();
      expect(/confirm|patvirtin|подтвержд/.test(txt), `${loc} mentions confirmation`).toBe(true);
      expect(/fake|netikr|фальшив|no star|jokių žvaigžd|никаких звёзд/.test(txt), `${loc} no fake reputation`).toBe(true);
    });
  }
});
