import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PROFILE AT TABLET WIDTH (design audit 2026-11-22, 768 px, every language):
 * the identity stage cut the person's name ("Audit Worker mw…") from `sm` up,
 * and the work map's bottom labels printed over the line under it.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

describe("the profile shows the whole name and a map that fits", () => {
  it("the identity heading wraps at every width, never truncates", () => {
    const src = read("components/app/profile-hub-overview.tsx");
    expect(src).toMatch(/<h2 className="break-words font-display text-2xl [^"]*\[overflow-wrap:anywhere\]/);
    expect(src).not.toMatch(/<h2 className="truncate font-display text-2xl/);
  });
  it("the spatial work map reserves room for its bottom labels", () => {
    expect(read("components/app/work-world/work-context-map.tsx")).toMatch(/className="relative mx-auto mb-14 hidden aspect-\[16\/9\]/);
  });
});
