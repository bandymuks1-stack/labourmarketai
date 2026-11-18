import { describe, expect, it } from "vitest";

import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { deriveIntakeWorkTime } from "./intake-work-time";

/**
 * Measured in a real browser walk (2026-10-11): a Polish welder wrote
 * "Dziś od 7 do 16 spawałem MIG/MAG …, 30 min przerwy" and the confirm card
 * offered to save "30 min" as the day's work — the BREAK — because neither the
 * Polish "od … do" span nor the Polish break word was known.
 */
const TODAY = "2026-10-11";

describe("PL / DE / NL work days keep their span and drop the break", () => {
  it("Polish od…do with a break → 8.5 h, the break subtracted", () => {
    const text =
      "Dziś od 7 do 16 spawałem MIG/MAG konstrukcje stalowe na projekcie Renovatie magazijn Waalhaven, 30 min przerwy";
    const log = extractWorkLog(text, TODAY);
    expect(log.start).toBe("07:00");
    expect(log.end).toBe("16:00");
    expect(log.breakMinutes).toBe(30);
    expect(log.workedMinutes).toBe(510);
    expect(deriveIntakeWorkTime(text, TODAY).quantityMinutes).toBe(510);
  });

  it("a Polish range of hours ('2 do 3 godzin') is never a clock span", () => {
    const log = extractWorkLog("pracowałem 2 do 3 godzin przy montażu", TODAY);
    expect(log.start).toBeNull();
  });

  it("German von…bis with a Pause → the Pause is subtracted", () => {
    const log = extractWorkLog("Heute von 7 bis 15:30 geschweißt, 30 min Pause", TODAY);
    expect(log.workedMinutes).toBe(480);
  });

  it("a lone timed break fragment is never offered as work time", () => {
    for (const text of ["spawanie, 30 min przerwy", "geschweißt, 30 min Mittagspause", "gelast, 30 min pauze"]) {
      const out = deriveIntakeWorkTime(text, TODAY);
      expect(out.fragments.every((f) => !/przerw|pause|pauze/i.test(f.rawPhrase)), text).toBe(true);
    }
  });
});

describe("PL / DE hour amounts", () => {
  it("'8,5 godziny' is 8 h 30 min (the walked entry saved with no duration)", () => {
    expect(extractWorkLog("Dziś spawałem MIG/MAG konstrukcje stalowe 8,5 godziny na projekcie Waalhaven", TODAY).workedMinutes).toBe(510);
  });
  it("'8 Std.' is 8 h", () => {
    expect(extractWorkLog("Heute 8 Std. geschweißt", TODAY).workedMinutes).toBe(480);
  });
});
