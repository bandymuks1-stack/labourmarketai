import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A human must never be shown an unexplained readiness score.
 *
 * "6/6 Ready" was six real binary profile steps (profession, availability,
 * declared skills, a journal entry, a backed record, a work card) shown as a
 * bare ring plus a judgement word. The count was true; the label was not
 * explanatory ("ready" for what?). The rule now: a readiness figure always
 * names WHAT is counted ("Profile steps: 6 of 6 done") and lists the steps; the
 * judgement words Ready / Building / Getting started are not rendered.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const LOCALES = ["en", "lt", "de", "pl", "ru", "nl"] as const;

describe("no unexplained N/N Ready", () => {
  it("the ring has no judgement-level word prop and requires a caption + aria name", () => {
    const ring = read("components/app/readiness-ring.tsx");
    expect(ring).not.toMatch(/levelLabel/);
    expect(ring).toMatch(/caption: string/);
    expect(ring).toMatch(/ariaLabel: string/);
  });
  it("the player card lists the NAMED steps behind the count", () => {
    const card = read("components/app/worker-player-card.tsx");
    expect(card).toMatch(/player-card-readiness-steps/);
    expect(card).not.toMatch(/levelReady|levelBuilding|levelStart/);
  });
  it("the profile hub states the count with its noun, not a level word", () => {
    const hub = read("components/app/profile-hub-overview.tsx");
    expect(hub).toMatch(/readiness\.summary/);
    expect(hub).not.toMatch(/readiness\.\$\{readiness\.level\}/);
  });
  for (const loc of LOCALES) {
    it(`${loc}: no bare 'ready/building/start' judgement strings in readiness namespaces`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`));
      for (const ns of [m.playerCard.readiness, m.profileState.readiness]) {
        for (const k of ["levelReady", "levelBuilding", "levelStart", "ready", "building", "start"]) {
          expect(ns[k], `${loc} ${k}`).toBeUndefined();
        }
      }
      expect(m.profileState.readiness.summary).toMatch(/\{done\}/);
      expect(m.playerCard.readiness.ringAria).toMatch(/\{met\}/);
    });
  }
});
