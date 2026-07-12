import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Feedback loop guard (full-completion train PR 7).
 *
 * The work → communication → confirmation → evidence → trust loop must be
 * explained honestly: trust comes only from real human confirmations, never a
 * fake rating / reputation / score.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("feedback loop model is honest", () => {
  const model = read("lib/feedback/work-feedback-loop.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  it("trust comes only from real confirmations (hasTrustSignal on confirmations)", () => {
    expect(model).toMatch(/confirmations\s*>\s*0/);
    expect(model).not.toMatch(/rating|reputation|stars?\b|score/i);
  });
});

describe("the communication surface carries conversations, not product explainers", () => {
  // Core-network inbox contract: the messages list leads with real
  // conversations. Product-promo / architecture feature notes were removed
  // from the main hierarchy (docs/launch/communication-inbox-contract-v1.md).
  const page = read("app/[locale]/dashboard/communication/page.tsx");
  it("renders no FeatureNote explainers on the inbox", () => {
    expect(page).not.toMatch(/FeatureNote/);
    expect(page).not.toMatch(/feedbackLoop/);
    expect(page).not.toMatch(/communicationInbox/);
  });
});
