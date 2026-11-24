import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Player-card interaction contract (user-journey root-cause repair v1,
 * dashboard sweep follow-up; reshaped by W3 Package 4).
 *
 * W3 Package 4 deleted the premium hub together with the /dashboard/advanced
 * second dashboard, so the hub-only pins (primitives, company / project /
 * market-map cards, premiumHub locale copy) went with it — the deletion
 * ratchet in w3-return-to-workspace + route-truth-map owns their absence,
 * and the anchors those cards targeted stay pinned by their own guards
 * (company-architecture-v1, journal-modes-gallery, click-target-repair).
 *
 * What SURVIVES is the contract the hub's person block handed to the
 * canonical player card (W3 row 1): a visible number is a door to the exact
 * section it counts, editing stays worker-only, and no score is ever
 * invented. Pinned here.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Code only — a doc comment that NAMES what was removed is not a
 *  reintroduction of it. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const playerCard = read("components/app/worker-player-card.tsx");
const playerCardResult = read("components/app/workspace/player-card-result.tsx");

describe("the canonical player card keeps the person-block contract", () => {
  it("the canonical card still deep-links every number to its section", () => {
    // The SAME contract the hub person block held: a visible number is a door
    // to the exact section it counts. It is the canonical card's now.
    expect(playerCard).toContain('href="/dashboard/profile#capabilities"');
    expect(playerCard).toContain('href="/dashboard/journal#journal-entries"');
  });

  it("no completeness percentage meter anywhere (human-first v1)", () => {
    // The user-visible completenessPct meter was removed — real counts only.
    expect(playerCard).not.toMatch(/completenessPct/);
  });

  it("a non-worker gets NO worker-only editing controls", () => {
    // The hard acceptance condition for row 1, and the half that cannot be
    // browser-proven here: every local fixture identity HAS a `workers` row,
    // and inventing a half-onboarded account to make a screenshot is the
    // fabricated state this platform bans. So it is pinned in code, at both
    // ends of the chain.
    const loader = read("lib/player-card/player-card-result.ts");
    // 1. The server returns no editor when there is no worker row.
    expect(loader).toMatch(/if \(!worker\?\.id\) return null;/);
    // 2. The result type makes "no editor" representable, not an empty object.
    expect(loader).toMatch(/workEditor: WorkEditorVM \| null/);
    // 3. The component renders the editor ONLY when the server sent one.
    expect(playerCardResult).toMatch(
      /view\.workEditor && view\.workEditorLabels \?/,
    );
    // 4. And the editor writes through the canonical save path, where the
    //    REAL authorization lives — the null above is a UI decision, never
    //    the security boundary.
    expect(read("components/app/work-card-editor.tsx")).toMatch(
      /use(ActionState|FormState)|action=\{/,
    );
  });

  it("the card result computes no score of its own", () => {
    // The whole reason the card may be trusted: it renders counts of the
    // person's own rows. A total, a rating or a percentage introduced HERE
    // would be exactly the fabricated reputation the platform bans.
    expect(stripComments(playerCardResult)).not.toMatch(
      /score|rating|percent|★|totalPoints/i,
    );
  });
});
