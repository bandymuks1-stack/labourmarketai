import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 row 21 — MYZONE: the classification, pinned.
 *
 * The audit split the row into its real sub-capabilities rather than
 * labelling the whole surface once:
 *
 *   1. READINESS STATUS + MISSING-ITEM DEEP LINKS → `ALREADY`. The canonical,
 *      RICHER implementation is the work-card model rendered inside the
 *      `player-card` RESULT (W3 row 1): five dimensions (work / availability /
 *      location / pay / evidence) against MyZone's two (profession, first
 *      entry), each missing dimension producing ONE best next action with a
 *      per-dimension "why it helps". MyZone's two dimensions are a strict
 *      subset: `work` requires the profession, `evidence` requires journal
 *      entries.
 *
 *   2. "KAS KĄ GERINA" EXPLAINER → `OBSOLETE`. Standalone help copy consumed
 *      only by this component; the surviving explanation lives WHERE THE
 *      ACTION IS — the work-card model's `whyKey` per dimension. Help
 *      detached from action dies with the route.
 *
 * W3 Package 4 executed the deletion: MyZone and its single advanced-page
 * mount are gone. What remains pinned here is the SURVIVING side of the
 * classification — the canonical work-card model and its player-card home.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("W3 row 21 — the canonical work-card model carries MyZone's capabilities", () => {
  it("MyZone's two dimensions are a strict subset of the canonical work-card model", () => {
    const model = read("lib/worker/work-card-state.ts");
    // `work` covers the profession dimension…
    expect(model).toMatch(/case "work":\s*\n\s*return s\.hasProfession/);
    // …and `evidence` covers the first-journal-entry dimension, with the
    // journal as its next-action destination — the same place MyZone's
    // `firstEntry` deep link points.
    expect(model).toMatch(/case "evidence":\s*\n\s*return s\.evidenceCount > 0/);
    expect(model).toMatch(/evidence: "\/dashboard\/journal"/);
    // Every missing dimension explains WHY it helps — the surviving form of
    // the "Kas ką gerina" explainer, attached to the action itself.
    expect(model).toMatch(/whyKey/);
  });

  it("the canonical surface renders the editor: the player-card result", () => {
    const result = read("components/app/workspace/player-card-result.tsx");
    expect(result).toContain("player-card-work-editor");
    expect(result).toMatch(/WorkCardEditor/);
  });

  it("ŠIANDIEN's one next action is the SAME model — readiness has one engine (IA 2026-09-13)", () => {
    // MyZone's "readiness status + missing-item deep links" capability now
    // also surfaces on the worker's home page, and it does so by lifting
    // `deriveWorkCardState(...).next` — never by a third readiness rule.
    const server = read("lib/today/today-server.ts");
    expect(server).toMatch(/import \{ deriveWorkCardState[^}]*\} from "@\/lib\/worker\/work-card-state"/);
    expect(server).toMatch(/deriveWorkCardState\(data\.signals, Date\.now\(\)\)/);
    const model = read("lib/today/today-model.ts");
    // An inline dimension (availability / location / pay) opens the editor's
    // canonical home named above — the player-card result.
    expect(model).toMatch(/WORK_CARD_EDITOR_HREF = "\/dashboard\?result=player-card"/);
    expect(model).toMatch(/href: card\.next\.href \?\? WORK_CARD_EDITOR_HREF/);
    // The "why it helps" line travels with the action — the surviving form
    // of the "Kas ką gerina" explainer, here too.
    expect(read("components/app/today/today-screen.tsx")).toMatch(/tCard\(next\.whyKey\)/);
  });

  // The single-mount and explainer-single-consumer pins proved the deletion
  // was clean BEFORE Package 4 ran it; both are now facts of history, and
  // absence is owned by the deletion ratchet (w3-return-to-workspace).
});
