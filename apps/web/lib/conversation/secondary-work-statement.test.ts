import { describe, expect, it } from "vitest";

import { secondaryWorkStatement } from "@/lib/conversation/secondary-work-statement";

describe("the day's work inside a longer message", () => {
  it("finds the work statement in the owner's example", () => {
    expect(
      secondaryWorkStatement(
        "Esu pastolininkas. Dabar dirbu Gama. Šiandien 7 valandas montavau pastolius. Ieškau geriau apmokamo darbo Švedijoje.",
        "2026-09-29",
      ),
    ).toBe("Šiandien 7 valandas montavau pastolius.");
  }, 20_000);

  it("NEGATIVE: one sentence, or no duration, opens nothing extra", () => {
    expect(secondaryWorkStatement("Šiandien 7 valandas montavau pastolius.", "2026-09-29")).toBeNull();
    expect(secondaryWorkStatement("Esu pastolininkas. Ieškau darbo Švedijoje.", "2026-09-29")).toBeNull();
    expect(secondaryWorkStatement("Esu pastolininkas. Dirbu Gama.", "2026-09-29")).toBeNull();
  });
});
