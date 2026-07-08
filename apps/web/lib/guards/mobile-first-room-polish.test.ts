import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile-first room polish (v1). After the room-based IA reset, each room must
 * read as one clear space on a phone — not a compressed desktop dashboard. The
 * journey rail must not cram N labelled circles on mobile, and the room's
 * primary action must be a full-width tap target on phones.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("the overview no longer crams a journey stepper on mobile", () => {
  const page = read("app/[locale]/dashboard/page.tsx");
  // dashboard-active-role-overview-v1: the heavy stage-rail was removed so the
  // first screen leads with one clear next action, not a desktop stepper.
  it("the compressed journey rail is gone", () => {
    expect(page).not.toMatch(/data-testid="journey-current-step"/);
    expect(page).not.toMatch(/<nav aria-label=\{label\}/);
  });
  it("the room still reads as one focused space (current-space header kept)", () => {
    expect(page).toMatch(/<CurrentSpaceHeader role=\{role\} \/>/);
  });
});

describe("room primary action is a full-width tap target on mobile", () => {
  it("pilot CTA is w-full on mobile, compact at sm+", () => {
    const btn = read("components/app/demand-request-button.tsx");
    expect(btn).toMatch(/w-full sm:w-auto/);
  });
});

describe("no broad redesign / no logic change", () => {
  it("the worker entry keeps its folded next action and the org entry its next action", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    // WorkCard was removed (dedup v1); the worker's state-aware next action +
    // inline editor now live in the hub person block via workEditor.
    expect(page).toMatch(/workEditor=\{workEditor\}/);
    expect(page).toMatch(/<DashboardNextAction\b/);
  });
});
