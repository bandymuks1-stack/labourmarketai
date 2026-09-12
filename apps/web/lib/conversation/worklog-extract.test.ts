import { describe, it, expect } from "vitest";
import { extractWorkLog } from "./worklog-extract";

const TODAY = "2026-07-24";

describe("extractWorkLog — the brief's flagship sentence", () => {
  const p = extractWorkLog(
    "Šiandien objekte Roterdame dirbau nuo 8 iki 17, 45 min. pietūs, montavau langus.",
    TODAY,
  );

  it("date resolves to today", () => {
    expect(p.date).toBe("2026-07-24");
  });
  it("time span 08:00–17:00", () => {
    expect(p.start).toBe("08:00");
    expect(p.end).toBe("17:00");
  });
  it("45-minute break", () => {
    expect(p.breakMinutes).toBe(45);
  });
  it("worked time = span − break = 8h15", () => {
    expect(p.workedMinutes).toBe(9 * 60 - 45);
    expect(p.hoursLabel).toBe("8 val. 15 min.");
  });
  it("site extracted", () => {
    expect(p.site).toMatch(/Roterdam/i);
  });
  it("notes preserve the worker's own words verbatim (the evidence)", () => {
    expect(p.notes).toContain("montavau langus");
  });
  it("has a signal (no clarifying question needed)", () => {
    expect(p.hasSignal).toBe(true);
  });
});

describe("extractWorkLog — variants + honest ambiguity", () => {
  it("yesterday shifts the date back one day", () => {
    expect(extractWorkLog("vakar dirbau 8 valandas", TODAY).date).toBe("2026-07-23");
  });

  it("explicit ISO date wins", () => {
    expect(extractWorkLog("2026-07-20 dirbau 6 val", TODAY).date).toBe("2026-07-20");
  });

  it("explicit hours without a span", () => {
    const p = extractWorkLog("dirbau 6 valandas", TODAY);
    expect(p.workedMinutes).toBe(360);
    expect(p.start).toBeNull();
  });

  it("a bare 'NN min' with no break word is NOT treated as a break", () => {
    const p = extractWorkLog("nuo 8 iki 17, 45 min kelionė", TODAY);
    expect(p.breakMinutes).toBe(0);
    expect(p.workedMinutes).toBe(9 * 60);
  });

  it("no date/time signal → hasSignal false (flow asks one question)", () => {
    expect(extractWorkLog("montavau langus", TODAY).hasSignal).toBe(false);
  });

  it("English span parses", () => {
    const p = extractWorkLog("today from 8 to 16, installed windows", TODAY);
    expect(p.start).toBe("08:00");
    expect(p.end).toBe("16:00");
  });
});

describe("extractWorkLog — a digit run inside a code, a date or a list is not a clock span", () => {
  // Measured on production (2026-09-11): the reference token below was read
  // as 13:00–17:00 and became four worked hours on a real record.
  it("a reference token with hyphenated digit runs yields no span and no worked time", () => {
    const p = extractWorkLog("QA-S13-1789111905948 klojau plyteles", TODAY);
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
    expect(p.workedMinutes).toBeNull();
  });
  it("an ISO date is a date, never a span of its own digits", () => {
    const p = extractWorkLog("2026-09-11 klojau plyteles", TODAY);
    expect(p.date).toBe("2026-09-11");
    expect(p.start).toBeNull();
    expect(p.workedMinutes).toBeNull();
  });
  it("a three-part number list and an object code are not spans", () => {
    expect(extractWorkLog("nr. 12-13-14 patikrinau", TODAY).start).toBeNull();
    expect(extractWorkLog("Objektas A-7-12, montavau", TODAY).start).toBeNull();
  });
  it("a real span next to a date still parses", () => {
    const p = extractWorkLog("2026-09-11 dirbau 9-18", TODAY);
    expect(p.date).toBe("2026-09-11");
    expect(p.start).toBe("09:00");
    expect(p.end).toBe("18:00");
    expect(p.workedMinutes).toBe(9 * 60);
  });
  it("a dotted span still parses", () => {
    const p = extractWorkLog("dirbau nuo 7.30 iki 16.00", TODAY);
    expect(p.start).toBe("07:30");
    expect(p.end).toBe("16:00");
  });
});

describe("extractWorkLog — the context slot (issue #1689, re-audit line 0): the object, place, project or client the work was for", () => {
  it("the owner's sentence: the dotted name after the work verb is the context, the colon is not part of it", () => {
    const p = extractWorkLog(
      "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau, 2 val. ieškojau partnerių.",
      TODAY,
    );
    expect(p.site).toBe("LabourMarket.ai");
    // the time reading is untouched by the context reading
    expect(p.workedMinutes).toBe(9 * 60);
    expect(p.date).toBe(TODAY);
  });

  it("a place noun followed by a name — warehouse, project, company — in five languages", () => {
    expect(extractWorkLog("Iškroviau 36 paletes sandėlyje Kaune", TODAY).site).toBe("Kaune");
    expect(extractWorkLog("projekte LabourMarket.ai programavau 5 val.", TODAY).site).toBe("LabourMarket.ai");
    expect(extractWorkLog("Šiandien įmonėje UAB Statyba klojau plyteles 6 val.", TODAY).site).toBe("UAB Statyba");
    expect(extractWorkLog("Worked 8 hours at the warehouse Rimi today", TODAY).site).toBe("Rimi");
    expect(extractWorkLog("Сегодня работал 8 часов на складе Maxima", TODAY).site).toBe("Maxima");
    expect(extractWorkLog("Vandaag 8 uur gewerkt in het magazijn Bol", TODAY).site).toBe("Bol");
    expect(extractWorkLog("Heute 8 Stunden im Lager Bosch gearbeitet", TODAY).site).toBe("Bosch");
  });

  it("a name right after the work verb — 'dirbau Kaune', 'worked at Acme', 'работал в Maxima', 'gewerkt bij Bol', 'gearbeitet bei Bosch'", () => {
    expect(extractWorkLog("Vakar dirbau Kaune nuo 8 iki 17", TODAY).site).toBe("Kaune");
    expect(extractWorkLog("worked at Acme Corp from 8 to 17", TODAY).site).toBe("Acme Corp");
    expect(extractWorkLog("работал в Maxima с 8 до 17", TODAY).site).toBe("Maxima");
    expect(extractWorkLog("gewerkt bij Bol van 8 tot 17", TODAY).site).toBe("Bol");
    expect(extractWorkLog("gearbeitet bei Bosch von 8 bis 17", TODAY).site).toBe("Bosch");
  });

  it("a place noun followed by a verb, a number or a lower-case word names NO context — the person is not handed a guess", () => {
    expect(extractWorkLog("sandėlyje iškroviau 36 paletes", TODAY).site).toBeNull();
    expect(extractWorkLog("dirbau 8 valandas", TODAY).site).toBeNull();
    expect(extractWorkLog("dirbau nuo 8 iki 17, montavau langus", TODAY).site).toBeNull();
    expect(extractWorkLog("worked for 8 hours at home", TODAY).site).toBeNull();
  });

  it("the explicit 'objekte X' reading still wins, and the words stay verbatim in the evidence", () => {
    const p = extractWorkLog("Šiandien objekte Roterdame dirbau Kaune nuo 8 iki 17", TODAY);
    expect(p.site).toBe("Roterdame");
    expect(p.notes).toContain("dirbau Kaune");
  });

  it("a named context is work content: the flow no longer asks what was done", () => {
    expect(extractWorkLog("dirbau LabourMarket.ai", TODAY).site).toBe("LabourMarket.ai");
  });
});
