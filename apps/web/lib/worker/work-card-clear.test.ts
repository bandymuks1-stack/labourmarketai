import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { preferredCountriesCleared } from "./work-card-state";

describe("clearing a saved preferred country (preferences must be removable)", () => {
  it("an emptied field that had saved countries is an explicit clear", () => {
    expect(preferredCountriesCleared(["SE"], "")).toBe(true);
    expect(preferredCountriesCleared(["SE", "NO"], "   ")).toBe(true);
  });
  it("an untouched or still-filled field is never a clear", () => {
    expect(preferredCountriesCleared([], "")).toBe(false); // nothing saved, nothing to clear
    expect(preferredCountriesCleared(["SE"], "SE")).toBe(false);
    expect(preferredCountriesCleared(["SE"], "NO")).toBe(false); // a change, not a clear
  });
});

describe("the editor sends the clear and the action honours it", () => {
  const web = path.resolve(__dirname, "../..");
  const editor = readFileSync(path.join(web, "components/app/work-card-editor.tsx"), "utf8");
  const action = readFileSync(path.join(web, "lib/worker/work-card-actions.ts"), "utf8");
  it("the editor posts preferred_countries_clear only through the pure helper", () => {
    expect(editor).toMatch(/preferredCountriesCleared\(values\.preferredCountries, typedCountries\)/);
    expect(editor).toMatch(/name="preferred_countries_clear" value="1"/);
  });
  it("a blank field WITHOUT the flag still means keep (the action's rule is unchanged)", () => {
    expect(action).toMatch(/preferred_countries_clear"\) \?\? ""\) === "1"\s*\? \[\]\s*: parseCountries/);
  });
});
