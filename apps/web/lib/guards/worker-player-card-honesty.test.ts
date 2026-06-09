import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Worker player-card honesty guard (slice worker-player-card-v1).
 * Real counts only (graceful 0 on error), honest zero state, skills labelled
 * self-declared (not verified), no fabricated numbers.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const svc = read("lib/player-card/player-card.ts");
const comp = read("components/app/worker-player-card.tsx");
const page = read("app/[locale]/dashboard/player-card/page.tsx");

describe("read service is real-data-only with graceful fallback", () => {
  it("counts via safeCount (returns 0 on error — never fabricates)", () => {
    expect(svc).toMatch(/function safeCount/);
    expect(svc).toMatch(/return 0;/);
    expect(svc).toMatch(/profile_skill_claims/);
    expect(svc).toMatch(/journal_entries/);
    expect(svc).toMatch(/listAttentionInstructions/);
  });
  it("returns null when there is no authenticated user", () => {
    expect(svc).toMatch(/if \(!user\) return null;/);
  });
  it("work-card confirmation is derived from the real column, not assumed", () => {
    expect(svc).toMatch(/work_card_confirmed_at/);
    expect(svc).toMatch(/Boolean\(worker\?\.work_card_confirmed_at\)/);
  });
});

describe("the card renders real values + an honest zero state", () => {
  it("mounts the player card on the route", () => {
    expect(page).toMatch(/<WorkerPlayerCard\b/);
  });
  it("renders the counts verbatim (String(card.x)), inventing nothing", () => {
    expect(comp).toMatch(/String\(card\.skillsDeclared\)/);
    expect(comp).toMatch(/String\(card\.evidenceEntries\)/);
    expect(comp).toMatch(/String\(card\.attentionInstructions\)/);
  });
  it("shows a calm zero message when nothing needs attention", () => {
    expect(comp).toMatch(/attentionInstructions === 0 \? labels\.attentionZero/);
  });
});

describe("skills are labelled self-declared (not verified); copy present LT+EN", () => {
  it("LT skills hint says self-declared / not verified", () => {
    expect(lt.playerCard.skillsHint).toMatch(/savideklaruot/i);
    expect(lt.playerCard.skillsHint).toMatch(/nepatvirtint/i);
  });
  it("EN skills hint says self-declared / not verified", () => {
    expect(en.playerCard.skillsHint).toMatch(/self-declared/i);
    expect(en.playerCard.skillsHint).toMatch(/not verified/i);
  });
  it("both locales expose every player-card key", () => {
    for (const [name, j] of [["lt", lt], ["en", en]] as const) {
      for (const k of [
        "pageTitle", "pageIntro", "title", "subtitle", "skillsLabel", "skillsHint",
        "evidenceLabel", "evidenceHint", "attentionLabel", "attentionHint",
        "attentionZero", "workCardLabel", "workCardConfirmed", "workCardPending",
        "namePlaceholder",
      ]) {
        expect(j.playerCard[k], `${name}.playerCard.${k}`).toBeTruthy();
      }
    }
  });
  it("no fake employer-interest / AI / verification claims in the copy", () => {
    const blob = JSON.stringify(lt.playerCard) + JSON.stringify(en.playerCard);
    expect(blob).not.toMatch(/employer (viewed|is interested)|artificial intelligence|dirbtin\w* intelekt|\bA\.?I\.?-(verified|matched)/i);
  });
});
