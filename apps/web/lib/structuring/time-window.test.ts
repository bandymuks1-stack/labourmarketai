import { describe, expect, it } from "vitest";

import { parseTimeWindow, stripEndDatePhrase } from "./time-window";

/** 2026-08-13 is a Thursday (UTC). */
const TODAY = "2026-08-13";

describe("parseTimeWindow — coarse UTC windows, honest 'none'", () => {
  it("next week is the following ISO week (Mon–Sun, UTC)", () => {
    const w = parseTimeWindow("kitą savaitę galiu dirbti", TODAY);
    expect(w).toMatchObject({
      kind: "next_week",
      startIso: "2026-08-17",
      endIso: "2026-08-23",
    });
  });

  it("carries a stated day count on the phrase window (fixture B shape)", () => {
    const w = parseTimeWindow(
      "Esu elektrikas ir kitą savaitę turiu dvi laisvas dienas",
      TODAY,
    );
    expect(w.kind).toBe("next_week");
    expect(w.days).toBe(2);
    expect(w.startIso).toBe("2026-08-17");
    expect(w.endIso).toBe("2026-08-23");
  });

  it("this week starts at this week's Monday", () => {
    const w = parseTimeWindow("šią savaitę", TODAY);
    expect(w).toMatchObject({
      kind: "this_week",
      startIso: "2026-08-10",
      endIso: "2026-08-16",
    });
  });

  it("next month spans the full following calendar month (fixture C shape)", () => {
    for (const text of [
      "kitą mėnesį trūks keturių suvirintojų",
      "next month we are short of welders",
      "в следующем месяце нужны сварщики",
    ]) {
      const w = parseTimeWindow(text, TODAY);
      expect(w.kind, text).toBe("next_month");
      expect(w.startIso).toBe("2026-09-01");
      expect(w.endIso).toBe("2026-09-30");
    }
  });

  it("December's next month crosses the year boundary", () => {
    const w = parseTimeWindow("next month", "2026-12-05");
    expect(w.startIso).toBe("2027-01-01");
    expect(w.endIso).toBe("2027-01-31");
  });

  it("a bare day count anchors at today (coarse, days_count)", () => {
    const w = parseTimeWindow("turiu 3 dienas", TODAY);
    expect(w).toMatchObject({
      kind: "days_count",
      days: 3,
      startIso: "2026-08-13",
      endIso: "2026-08-15",
    });
    expect(parseTimeWindow("five days available", TODAY).days).toBe(5);
    expect(parseTimeWindow("свободен два дня", TODAY).days).toBe(2);
  });

  it("diacritic-free typing parses identically", () => {
    expect(parseTimeWindow("kita savaite", TODAY).kind).toBe("next_week");
    expect(parseTimeWindow("sia savaite", TODAY).kind).toBe("this_week");
    expect(parseTimeWindow("kita menesi", TODAY).kind).toBe("next_month");
  });

  it("no stated window → none, never a guessed date", () => {
    for (const text of ["ieškau darbo", "parduodu agurkus", "", "ryt gal"]) {
      expect(parseTimeWindow(text, TODAY).kind, text).toBe("none");
    }
  });
});

describe("stripEndDatePhrase — the deadline is its own field, not a title tail", () => {
  it("removes the written deadline the parser read (ISO, d.m.y, month words)", () => {
    expect(stripEndDatePhrase("sumontuoti pastolius iki 2026-10-03")).toBe("sumontuoti pastolius");
    expect(stripEndDatePhrase("install scaffolding until 03.10.2026")).toBe("install scaffolding");
    expect(stripEndDatePhrase("sumontuoti pastolius iki spalio 3")).toBe("sumontuoti pastolius");
    expect(stripEndDatePhrase("sumontuoti pastolius iki 3 spalio")).toBe("sumontuoti pastolius");
    expect(stripEndDatePhrase("Gerüst montieren bis 3.10.2026")).toBe("Gerüst montieren");
  });
  it("keeps a phrase that is not a deadline the parser knows", () => {
    expect(stripEndDatePhrase("nuvežti medžiagas iki pietų")).toBe("nuvežti medžiagas iki pietų");
    expect(stripEndDatePhrase("go to site 3")).toBe("go to site 3");
    expect(stripEndDatePhrase("sumontuoti pastolius")).toBe("sumontuoti pastolius");
  });
});
