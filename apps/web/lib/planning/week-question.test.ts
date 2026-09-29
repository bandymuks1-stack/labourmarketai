import { describe, expect, it } from "vitest";

import { asksAboutAWeek } from "./week-question";

describe("asksAboutAWeek", () => {
  it.each([
    "Parodyk, ką dirbau šią savaitę",
    "Kiek valandų dirbau šią savaitę?",
    "what did I work this week",
    "что я делал на этой неделе",
    "was habe ich diese Woche gearbeitet",
    "wat heb ik deze week gewerkt",
    "co robiłem w tym tygodniu",
  ])("%s → yes", (s) => expect(asksAboutAWeek(s)).toBe(true));
  it.each(["Kiek valandų dirbau vakar?", "Parodyk mano darbo istoriją", "", null])("%s → no", (s) =>
    expect(asksAboutAWeek(s as string | null)).toBe(false),
  );
});
