import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("work card: country I am in is a selector over the ONE country list", () => {
  it("the labels builder reuses countryOptionsForLocale (no second list)", () => {
    const src = read("lib/player-card/player-card-result.ts");
    expect(src).toMatch(/countryOptionsForLocale\(await getLocale\(\)\)/);
  });
  it("the editor renders a select that still submits location_country, text fallback kept", () => {
    const src = read("components/app/work-card-editor.tsx");
    // The shared Select (components/ui/Select.tsx) renders the native <select>.
    expect(src).toMatch(/<Select\s+name="location_country"/);
    expect(src).toMatch(/type="text"\s+name="location_country"/);
  });
});
