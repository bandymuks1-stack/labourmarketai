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
