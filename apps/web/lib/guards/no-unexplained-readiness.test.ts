import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A human must never be shown an unexplained readiness score (ported from
 * closed PR #2125, 50040d4cf — D2, 2026-10-14).
 *
 * "6/6 Ready" was six real binary profile steps (profession, availability,
 * declared skills, a journal entry, a backed record, a work card) shown as a
 * bare ring plus a judgement word. The count was true; the label was not
 * explanatory ("ready" for what?). The rule now: a readiness figure always
 * names WHAT is counted ("Profile steps: 6 of 6 done") and the steps are
 * listed; the judgement words Ready / Building / Getting started are not
 * rendered, and the person's own steps are never painted green or gold.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const LOCALES = ["en", "lt", "de", "pl", "ru", "nl", "da", "et", "lv", "no", "sv"] as const;

describe("no unexplained N/N Ready", () => {
  it("the ring has no judgement-level word prop and requires a caption + aria name", () => {
    const ring = read("components/app/readiness-ring.tsx");
    expect(ring).not.toMatch(/levelLabel/);
    expect(ring).toMatch(/caption: string/);
    expect(ring).toMatch(/ariaLabel: string/);
    // structure over colour: the arc is never gold or green
    expect(ring).not.toMatch(/brand-blue|state-success|trust-accent|tier-gold/);
  });

  it("the player card lists the NAMED steps behind the count, each state in words", () => {
    const card = read("components/app/worker-player-card.tsx");
    expect(card).toMatch(/data-testid="player-card-readiness-steps"/);
    expect(card).toMatch(/labels\.readiness\.stepDone : labels\.readiness\.stepOpen/);
    expect(card).not.toMatch(/levelReady|levelBuilding|levelStart/);
  });

  it("the profile hub states the count with its noun, not a level word, and not in green", () => {
    const hub = read("components/app/profile-hub-overview.tsx");
    expect(hub).toMatch(/tReadiness\("summary"/);
    expect(hub).not.toMatch(/readiness\.\$\{readiness\.level\}/);
    const status = hub.slice(hub.indexOf('data-testid="profile-hub-status"'), hub.indexOf('data-testid="profile-hub-freshness"'));
    expect(status).not.toMatch(/state-success/);
  });

  for (const loc of LOCALES) {
    it(`${loc}: playerCard.readiness names what it counts; no judgement words`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const r = m.playerCard.readiness;
      for (const k of ["levelReady", "levelBuilding", "levelStart"]) {
        expect(r[k], `${loc} ${k}`).toBeUndefined();
      }
      expect(r.summary).toMatch(/\{done\}/);
      expect(r.summary).toMatch(/\{total\}/);
      expect(r.ringAria).toMatch(/\{met\}/);
      expect(r.ringAria).toMatch(/\{total\}/);
      for (const k of ["label", "stepDone", "stepOpen"]) {
        expect(typeof r[k] === "string" && r[k].length > 0, `${loc} ${k}`).toBe(true);
      }
    });
  }

  it("the non-English catalogues are translated, not English copies", () => {
    const en = JSON.parse(read("messages/en.json")).playerCard.readiness;
    for (const loc of LOCALES.filter((l) => l !== "en")) {
      const r = JSON.parse(read(`messages/${loc}.json`)).playerCard.readiness;
      expect(r.summary, loc).not.toBe(en.summary);
      expect(r.label, loc).not.toBe(en.label);
    }
  });
});
