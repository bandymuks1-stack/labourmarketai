import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE HOME'S FIRST LAYER (owner production walk 2026-09-28).
 *
 * Three human contracts the walk found broken, pinned so a later change
 * cannot quietly bring them back:
 *
 *   1. the workspace is usable before the ŠIANDIEN head finishes reading —
 *      the head streams behind its own boundary instead of holding the whole
 *      home behind the route skeleton;
 *   2. an empty right rail never takes a third of the screen — a quiet home
 *      draws no panel;
 *   3. a heading never says "not yet assessed" over rows the engine DID
 *      assess ("5 su trūkstamu reikalavimu" under "dar neįvertinti").
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

describe("the home is usable before the Today head has read", () => {
  const today = read("components/app/today/today-screen.tsx");

  it("TodayScreen streams its head behind its own Suspense boundary", () => {
    expect(today).toMatch(
      /export function TodayScreen\([\s\S]{0,120}<Suspense fallback=\{<TodayScreenPending \/>\}>\s*<TodayScreenHead locale=\{locale\} \/>/,
    );
    // The head that awaits the player card is NOT the exported component.
    expect(today).not.toMatch(/export async function TodayScreen\b/);
  });
});

describe("a quiet home takes no room", () => {
  const panel = read("components/app/world-state/context-panel.tsx");

  it("the context panel is not drawn when it has nothing to say", () => {
    expect(panel).toMatch(/const quietHome =/);
    expect(panel).toMatch(/if \(quietHome\) return null;/);
  });

  it("a failed read is still stated, never hidden as quiet", () => {
    expect(panel).toMatch(/const quietHome =[\s\S]{0,200}unavailable === null/);
  });
});

describe("the found-postings heading does not deny an assessment that happened", () => {
  const locales = ["lt", "en", "de", "nl", "pl", "ru"];
  for (const locale of locales) {
    it(`${locale}: titleDiscovery makes no "not yet assessed" claim`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        conversation: { results: { opportunities: { titleDiscovery: string } } };
      };
      const title = messages.conversation.results.opportunities.titleDiscovery;
      expect(title).toBeTruthy();
      expect(title).not.toMatch(/\(|neįvertint|not yet assessed|nicht bewertet|niet beoordeeld|nieocenion|не оценен/i);
    });
  }
});
