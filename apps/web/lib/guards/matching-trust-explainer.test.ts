/**
 * MATCHING TRUST EXPLAINER — honesty guard (Step 7).
 *
 * The scouting surface must transparently explain HOW matching works:
 * deterministic for this need, what each status/evidence tier means, why
 * contacts are hidden, and the next action — with no fake score/AI/guarantee.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

const PAGE = "app/[locale]/dashboard/company/scouting/page.tsx";

describe("explainer is mounted on the scouting page", () => {
  const src = code(read(PAGE));
  it("renders the how-it-works disclosure", () => {
    expect(src).toMatch(/scouting-how/);
    expect(src).toMatch(/how\.title/);
    expect(src).toMatch(/how\.legend\./);
    expect(src).toMatch(/how\.contacts/);
    expect(src).toMatch(/how\.next/);
  });
});

describe("explainer copy is complete + honest (LT/EN/RU)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}.json scouting.how present`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        scouting?: { how?: Record<string, unknown> & { legend?: Record<string, unknown> } };
      };
      const h = j.scouting?.how;
      expect(h?.title).toBeTruthy();
      expect(h?.intro).toBeTruthy();
      expect(h?.evidence).toBeTruthy();
      expect(h?.contacts).toBeTruthy();
      expect(h?.next).toBeTruthy();
      for (const k of ["strong", "possible", "weak", "insufficient_data"]) {
        expect(h?.legend?.[k]).toBeTruthy();
      }
      const blob = JSON.stringify(h).toLowerCase();
      expect(blob).not.toContain("[en]");
      expect(blob).not.toMatch(/guaranteed|ai match|best match/);
    });
  }

  it("EN intro states the deterministic, no-AI, no-global-score truth", () => {
    const j = JSON.parse(read("messages/en.json")) as {
      scouting: { how: { intro: string; contacts: string } };
    };
    const intro = j.scouting.how.intro.toLowerCase();
    expect(intro).toMatch(/deterministic/);
    expect(intro).toMatch(/no ai|without ai/);
    expect(intro).toMatch(/no global score|no score/);
    expect(j.scouting.how.contacts.toLowerCase()).toMatch(/hidden/);
  });
});
