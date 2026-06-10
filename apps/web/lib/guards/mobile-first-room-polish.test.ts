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

describe("journey rail is not a compressed desktop stepper on mobile", () => {
  const page = read("app/[locale]/dashboard/page.tsx");
  it("per-step labels are hidden on mobile (shown at sm+)", () => {
    // The per-step label span is hidden on mobile, shown at sm+.
    expect(page).toMatch(/mt-2 hidden[\s\S]*tracking-label sm:block/);
    expect(page).toMatch(/\{s\.label\}/);
  });
  it("shows a single current-step line on mobile only", () => {
    expect(page).toMatch(/data-testid="journey-current-step"/);
    expect(page).toMatch(/sm:hidden[\s\S]{0,80}currentStage\.label/);
  });
});

describe("room primary action is a full-width tap target on mobile", () => {
  it("pilot CTA is w-full on mobile, compact at sm+", () => {
    const btn = read("components/app/demand-request-button.tsx");
    expect(btn).toMatch(/w-full sm:w-auto/);
  });
});

describe("no broad redesign / no logic change", () => {
  it("the journey rail still renders an accessible nav with all stages", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/<nav aria-label=\{label\}/);
    expect(page).toMatch(/stages\.map\(\(s, i\) =>/);
  });
});
