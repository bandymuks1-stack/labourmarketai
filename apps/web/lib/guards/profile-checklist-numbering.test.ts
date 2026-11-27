import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE LIST, ONE COUNT (design audit 2026-11-22). The profile's "what is still
 * missing" list numbers the setup steps "1." … "5."; the readiness rows that
 * follow them ("Rašyti įrašą") were drawn without a number, so the list read
 * 1–5 and then an unnumbered sixth row. They continue the count.
 */
const src = readFileSync(join(__dirname, "..", "..", "components/app/profile-hub-overview.tsx"), "utf8");

describe("the profile's missing list is numbered once, end to end", () => {
  it("the setup steps are numbered from 1", () => {
    expect(src).toMatch(/`\$\{i \+ 1\}\. \$\{tStep\(`steps\.\$\{s\.key\}\.title`\)\}`/);
  });
  it("the stepless rows continue after the steps", () => {
    expect(src).toMatch(/missingStepless\.map\(\(k, j\) =>/);
    expect(src).toMatch(/`\$\{missingSteps\.length \+ j \+ 1\}\. \$\{tAction\(k\)\}`/);
  });
});
