import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ATTENTION CARD SHOWS ONLY THE VIEWER'S OWN THREADS (2026-10-18).
 *
 * Production walk in the owner's session: the Messages attention card showed a
 * work instruction from a documented test fixture ("E2E Spine"). The
 * instruction read also admits is_admin(), and a thread the viewer did not take
 * part in read as "never opened". Like the inbox (communication page), the card
 * now requires participation; a participant who never opened it still sees it.
 */
const SRC = readFileSync(join(__dirname, "..", "instructions", "instructions.ts"), "utf8");
const body = SRC.slice(SRC.indexOf("export async function listAttentionInstructions"));

describe("listAttentionInstructions", () => {
  it("drops threads the viewer is not a participant of", () => {
    expect(body).toMatch(/if \(!lastRead\.has\(ins\.conversationId\)\) return false;/);
  });

  it("still surfaces a participant's never-opened thread", () => {
    expect(body).toMatch(/if \(lr == null\) return true;/);
  });

  it("reads participation for the viewer only", () => {
    expect(body).toMatch(/\.from\("conversation_participants"\)[\s\S]{0,120}\.eq\("profile_id", user\.id\)/);
  });
});
