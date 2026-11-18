import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard: a recorded skill confirmation reads as confirmed only while it STANDS
 * (lib/evidence/skill-confirmation-standing.ts).
 *
 * `worker_skills.verified` is sticky — nothing ever sets it back after the
 * confirming entry is rejected, corrected or deleted, and two historical rows
 * were set by the subject themselves. Every OWN surface that turns the flag
 * into a "confirmed" word or number must therefore go through the standing
 * rule, and must never count the raw flag.
 *
 * NEGATIVE CONTROL: on the pre-fix tree each `toMatch` below fails (no file
 * imports the module) and trust-signals still issues a head count on
 * `.eq("verified", true)`.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const OWN_TIER_READERS = [
  "lib/cv-export/verified-cv.ts", // Living CV, EU CV, MCP cv.verified.get, assist, evidence report
  "lib/profile/trust-signals.ts", // profile trust block + CV summary count
  "lib/player-card/player-card.ts", // confirmed-skill badges
  "lib/data/worker-core.ts", // THE core skill read (player-card chart, MCP living_cv.skills.get, …)
  "lib/qualification/capability-evidence.ts", // demonstrated capability / prior-learning review
  "lib/market-map/owner-readiness.ts", // capability readiness
  "app/[locale]/dashboard/profile/page.tsx", // profile skill tiers
  "app/[locale]/dashboard/journal/page.tsx", // journal confirmed-skill chips
] as const;

describe("own tier readers route through the standing rule", () => {
  for (const rel of OWN_TIER_READERS) {
    it(`${rel} imports the standing rule`, () => {
      expect(read(rel)).toMatch(/@\/lib\/evidence\/skill-confirmation-standing/);
    });
    it(`${rel} reads verified_by (a self-confirmation is classified, not trusted)`, () => {
      expect(read(rel)).toMatch(/verified_by/);
    });
  }

  it("trust-signals no longer counts the raw flag with a head count", () => {
    const src = read("lib/profile/trust-signals.ts");
    expect(src).not.toMatch(/select\("id",\s*\{\s*count:\s*"exact",\s*head:\s*true\s*\}\)\s*\.eq\("worker_id",\s*workerId\)\s*\.eq\("verified",\s*true\)/);
    expect(src).toMatch(/standingConfirmedSkillApprovals\(/);
  });

  it("qualification evidence no longer counts the raw flag", () => {
    const src = read("lib/qualification/capability-evidence.ts");
    expect(src).not.toMatch(/count:\s*"exact",\s*head:\s*true\s*\}\)\s*\.eq\("worker_id",\s*workerId\)\s*\.eq\("verified",\s*true\)/);
    expect(src).toMatch(/confirmationStands\(skillConfirmationState\(/);
  });

  it("the core skill read never hands out the confirmer's identity", () => {
    const src = read("lib/data/worker-core.ts");
    expect(src).toMatch(/delete row\.verified_by/);
  });

  it("the standing read is an own-RLS read and says so (cross-party readers use the DB door)", () => {
    const src = read("lib/evidence/skill-confirmation-standing-read.ts");
    expect(src).toMatch(/worker_skill_confirmations_standing_v1/);
    expect(src).toMatch(/\.is\("deleted_at", null\)\s*\.is\("superseded_by", null\)/);
    // no import cycle: worker-core -> this module -> journal-list-core -> worker-core
    expect(src).not.toMatch(/@\/lib\/journal\/journal-list-core/);
    expect(src).toMatch(/readCorrectedOriginalIds/);
    expect(src).not.toMatch(/service_role|createServiceClient|SUPABASE_SERVICE/);
  });

  it("the rule never writes: no worker_skills update anywhere in the module pair", () => {
    for (const rel of [
      "lib/evidence/skill-confirmation-standing.ts",
      "lib/evidence/skill-confirmation-standing-read.ts",
    ]) {
      expect(read(rel), rel).not.toMatch(/\.(update|upsert|insert|delete)\(/);
    }
  });
});
