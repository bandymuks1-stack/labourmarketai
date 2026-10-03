import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync(
  join(__dirname, "..", "..", "app", "[locale]", "dashboard", "company", "planning", "page.tsx"),
  "utf8",
);

describe("the capacity bar never claims coverage of a need nobody stated", () => {
  it("renders only when something is required", () => {
    expect(PAGE).toMatch(/view\.totals\.requiredHeadcount > 0 \? \(\s*<CapacityBar/);
  });
});
