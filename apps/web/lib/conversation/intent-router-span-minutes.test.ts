import { describe, expect, it } from "vitest";
import { classifyIntent, foldPatternSource } from "./intent-router";
import { extractWorkLog } from "./worklog-extract";

describe("a worked-time span with minutes is a work log in every language (walk 2026-10-11)", () => {
  it.each([
    ["Dzisiaj od 7:00 do 15:00 spawałem MIG/MAG słupy stalowe.", 480],
    ["Šiandien nuo 7:00 iki 15:30 suvirinau kolonas.", 510],
    ["Today from 7:00 to 15:00 I welded steel columns.", 480],
    ["Сегодня с 7:00 до 15:00 варил колонны.", 480],
    ["Heute von 7:00 bis 15:00 Stahlstützen geschweißt.", 480],
    ["Vandaag van 7:00 tot 15:00 stalen kolommen gelast.", 480],
  ])("%s", (text, minutes) => {
    expect(classifyIntent(text).intent).toBe("log-work");
    expect(extractWorkLog(text, "2026-10-11").workedMinutes).toBe(minutes);
  });
});

describe("pattern sources keep their escapes when folded", () => {
  it("non-digit and non-space escapes survive; text is still folded", () => {
    expect(foldPatternSource(String.raw`Od\s*\d\D{0,4}Ł\S`)).toBe(String.raw`od\s*\d\D{0,4}l\S`);
  });
  it.each(["Dzisiaj od 7 do 15 pracowałem.", "Šiandien dirbau nuo 8 iki 17.", "Heute von 8 bis 17 gearbeitet."])(
    "a whole-hour span still routes: %s",
    (t) => expect(classifyIntent(t).intent).toBe("log-work"),
  );
});
