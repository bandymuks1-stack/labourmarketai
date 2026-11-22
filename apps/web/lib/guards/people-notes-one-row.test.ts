import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PEOPLE-PAGE NOTES: ONE ROW, THE DETAIL ONE TAP AWAY (coordinator decision
 * 2026-11-22, item 5, on the owner's orders of 2026-11-21/22: no information
 * walls; keep every action-consequence fact, as one row plus the detail).
 *
 * Each explanation below stays in the page — behind the shared `Explain`
 * disclosure ("How this works") — and keeps every message it rendered before.
 * No fact is removed (doctrine §7, decision 0032).
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

const CASES: ReadonlyArray<{ rel: string; testId: string; keys: readonly string[] }> = [
  { rel: "components/app/team-brigades-panel.tsx", testId: "team-brigades-explain", keys: ['t("intro")', 't("honestNote")'] },
  { rel: "components/app/team-demand-offer-form.tsx", testId: "team-demand-offer-explain", keys: ['t("orgIntro")', 't("intro")', 't("privacy")'] },
  { rel: "components/app/people-import-panel.tsx", testId: "people-import-explain", keys: ['t("lead")'] },
  { rel: "components/app/organization-roster-section.tsx", testId: "organization-roster-explain", keys: ['t("intro")'] },
];

describe("people-page explanations sit behind one row and keep every fact", () => {
  for (const c of CASES) {
    it(`${c.rel}: explanation behind Explain, every message kept`, () => {
      const src = read(c.rel);
      expect(src).toMatch(new RegExp(`<Explain summary=\\{tDisclosure\\("details"\\)\\} testId="${c.testId}"`));
      const block = src.slice(src.indexOf(`testId="${c.testId}"`), src.indexOf("</Explain>", src.indexOf(`testId="${c.testId}"`)));
      for (const k of c.keys) expect(block, `${k} stays, inside the disclosure`).toContain(k);
    });
  }
});
