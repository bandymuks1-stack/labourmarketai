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
    expect(comp).toMatch(/String\(card\.candidateSkills\)/);
    expect(comp).toMatch(/String\(card\.evidenceEntries\)/);
    expect(comp).toMatch(/String\(card\.attentionInstructions\)/);
  });
  it("the candidate-skills count is a real owner-scoped count (not fabricated)", () => {
    expect(svc).toMatch(/skill_candidate_clarifications/);
    expect(lt.playerCard.candidateHint).toMatch(/nepatvirtint|tikslinam/i);
    expect(en.playerCard.candidateHint).toMatch(/not verified|needs clarification/i);
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

describe("work-journal evidence tier is honest (middle rung, not 'verified')", () => {
  const ru = JSON.parse(read("messages/ru.json"));
  it("counts work_journal-source skills from the real column (graceful 0)", () => {
    expect(svc).toMatch(/journalSupportedSkills/);
    expect(svc).toMatch(/\.eq\("source", "work_journal"\)/);
  });
  it("renders the count verbatim, only when > 0, distinct from verified glow", () => {
    expect(comp).toMatch(/card\.journalSupportedSkills > 0/);
    expect(comp).toMatch(/player-card-journal-supported/);
    // cyan tone, NOT the green manager-verified state-success glow
    expect(comp).toMatch(/brand-cyan/);
  });
  it("the tier label across active locales does NOT claim manager confirmation", () => {
    for (const [name, j] of [["lt", lt], ["en", en], ["ru", ru]] as const) {
      const label = j.playerCard.journalSupportedLabel as string;
      const hint = j.playerCard.journalSupportedHint as string;
      expect(label, `${name} journalSupportedLabel`).toBeTruthy();
      expect(hint, `${name} journalSupportedHint`).toBeTruthy();
      // must not assert it IS verified/confirmed (it is journal-SUPPORTED)
      expect(label).not.toMatch(/\b(verified|confirmed)\b/i);
      expect(label).not.toMatch(/patvirtint|подтвержд/i);
    }
  });
});
