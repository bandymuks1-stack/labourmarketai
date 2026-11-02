import { describe, expect, it } from "vitest";

import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import {
  deriveIntakeWorkTime,
  intakeWorkTimeFields,
  reviewTimeSuggestion,
} from "./intake-work-time";

/**
 * P0-A (owner, 2026-10-30) — Work Journal time correctness. Measured before
 * the fix, through the ONE deterministic parser the chat, the MCP
 * `journal.confirm` and (now) the web review share:
 *   - "nuo 22 iki 6" (a night shift) recorded NO time — the day read 0 h;
 *   - "8-12 ir 13-17" (a split shift) recorded only the first 4 h;
 *   - the web composer's review offered the 30-minute BREAK as the day's time
 *     for "nuo 8 iki 17, 30 min pertrauka" while the chat recorded 8 h 30 min.
 * Nothing here is a guess: every figure is what the sentence states, and an
 * ambiguous sentence still records nothing.
 */

const DAY = "2026-10-30";

describe("work across midnight", () => {
  it("a night shift in words ends on the next day: 22 → 6 is 8 h", () => {
    const p = extractWorkLog("Dirbau nuo 22 iki 6, montavau lentynas", DAY);
    expect(p.start).toBe("22:00");
    expect(p.end).toBe("06:00");
    expect(p.workedMinutes).toBe(480);
  });

  it("the break is subtracted across midnight too (en, clock form)", () => {
    const p = extractWorkLog("Night shift from 22:00 to 06:00, 30 min break", DAY);
    expect(p.workedMinutes).toBe(450);
    expect(p.breakMinutes).toBe(30);
  });

  it("ru and short spans: с 22 до 6 = 8 h, nuo 23 iki 1 = 2 h", () => {
    expect(extractWorkLog("Работал с 22 до 6", DAY).workedMinutes).toBe(480);
    expect(extractWorkLog("Dirbau nuo 23 iki 1", DAY).workedMinutes).toBe(120);
  });

  it("the record carries the minutes and the clock times, on the day the shift STARTED", () => {
    const f = intakeWorkTimeFields("Dirbau nuo 22 iki 6", DAY);
    expect(f).toMatchObject({
      quantity: "480",
      unit_slug: "minutes",
      work_start: "22:00",
      work_end: "06:00",
      break_minutes: "0",
      quantity_source: "ai_extracted",
      work_time_source: "ai_extracted",
    });
  });

  it("a morning start that 'ends' earlier is NOT read as a 21 h night (8-5 may be a 12-hour clock day)", () => {
    const p = extractWorkLog("Dirbau nuo 8 iki 5", DAY);
    expect(p.start).toBeNull();
    expect(p.workedMinutes).toBeNull();
    expect(deriveIntakeWorkTime("Dirbau nuo 8 iki 5", DAY).quantityMinutes).toBeNull();
  });

  it("a bare descending pair stays a range, not a night shift", () => {
    expect(extractWorkLog("Pjoviau lentas 20-5 cm", DAY).start).toBeNull();
  });

  it("a span that starts and ends at the same time is no span", () => {
    expect(extractWorkLog("Dirbau nuo 22 iki 22", DAY).workedMinutes).toBeNull();
  });
});

describe("several spans in one day (split shift)", () => {
  it("joined spans add up and the gap between them is the break", () => {
    const p = extractWorkLog("Dirbau 8-12 ir 13-17, plytelės", DAY);
    expect(p.workedMinutes).toBe(480);
    expect(p.start).toBe("08:00");
    expect(p.end).toBe("17:00");
    expect(p.breakMinutes).toBe(60);
  });

  it("the same in English with clock minutes, and the record is consistent (17-8-1 = 8 h)", () => {
    const f = intakeWorkTimeFields("Worked 8:00-12:00 and 13:00-17:00 laying tiles", DAY);
    expect(f).toMatchObject({ quantity: "480", work_start: "08:00", work_end: "17:00", break_minutes: "60" });
  });

  it("a range after the day's span that is not joined to it is never added (a count, not time)", () => {
    const p = extractWorkLog("Dirbau 8-17, sumontavau 3-4 langus", DAY);
    expect(p.workedMinutes).toBe(540);
    expect(p.end).toBe("17:00");
  });

  it("a joined span that goes back in time ends the chain", () => {
    const p = extractWorkLog("Dirbau 8-12 ir 13-17, 2-3 sluoksniai", DAY);
    expect(p.workedMinutes).toBe(480);
  });

  it("split spans PLUS a stated break are ambiguous (same pause or another?) — nothing is recorded", () => {
    const text = "Dirbau 8-12 ir 13-17, 30 min pertrauka";
    expect(extractWorkLog(text, DAY).workedMinutes).toBeNull();
    const d = deriveIntakeWorkTime(text, DAY);
    expect(d.quantityMinutes).toBeNull();
    expect(d.fragments).toEqual([]);
  });

  it("an evening span may continue past midnight: 18-22 ir 23-3 = 8 h", () => {
    const p = extractWorkLog("Dirbau nuo 18 iki 22 ir nuo 23 iki 3", DAY);
    expect(p.workedMinutes).toBe(480);
    expect(p.end).toBe("03:00");
    expect(p.breakMinutes).toBe(60);
  });

  it("one span is unchanged (nuo 8 iki 17, 30 min pertrauka = 8 h 30 min)", () => {
    const p = extractWorkLog("Dirbau nuo 8 iki 17, 30 min pertrauka", DAY);
    expect(p.workedMinutes).toBe(510);
    expect(p.breakMinutes).toBe(30);
  });
});

describe("the web review offers the same time the chat / MCP record", () => {
  const review = (text: string) => reviewTimeSuggestion(text, DAY, extractJournalSuggestions(text));

  it("a span sentence offers the span's worked time, never the break", () => {
    const text = "Dirbau nuo 8 iki 17, 30 min pertrauka";
    // the recognizer alone offered the break
    expect(extractJournalSuggestions(text).time).toEqual({ value: 30, unitSlug: "minutes" });
    expect(review(text).time).toEqual({ value: 8.5, unitSlug: "hours" });
  });

  it("a night shift offers 8 h in the review (the recognizer alone offered nothing)", () => {
    expect(review("Dirbau nuo 22 iki 6, montavau lentynas").time).toEqual({ value: 8, unitSlug: "hours" });
  });

  it("an odd minute count stays in minutes, exactly", () => {
    expect(review("Dirbau nuo 8 iki 17, 25 min pertrauka").time).toEqual({ value: 515, unitSlug: "minutes" });
  });

  it("a break that is the only stated duration is no work time", () => {
    expect(review("Montavau lentynas, 30 min pertrauka").time).toBeNull();
  });

  it("break fragments are removed; work fragments keep their own times", () => {
    const r = review("Klijavau plyteles 6 val., glaisčiau sienas 2 val., 30 min pertrauka");
    expect(r.fragments.map((f) => f.time?.value)).toEqual([6, 2]);
    expect(r.fragments.some((f) => /pertrauk/i.test(f.rawPhrase))).toBe(false);
  });

  it("an itemised day without a span is unchanged", () => {
    const text = "Klijavau plyteles 6 val., glaisčiau sienas 2 val.";
    const r = review(text);
    expect(r.time).toEqual(extractJournalSuggestions(text).time);
    expect(r.fragments.map((f) => f.time?.value)).toEqual([6, 2]);
  });

  it("with a span, fragment times are dropped so the canonical rule counts the span once", () => {
    const r = review("Nuo 8 iki 16 klijavau plyteles 2 val.");
    expect(r.fragments.every((f) => f.time === null)).toBe(true);
  });

  it("with a span AND a stated output the fragment times stay — the output may take the one entry slot (Codex P2)", () => {
    const r = review("Nuo 8 iki 16 klijavau plyteles 2 val., glaisčiau sienas 3 val., paklojau 35 m²");
    expect(r.time).toEqual({ value: 8, unitSlug: "hours" });
    expect(r.fragments.filter((f) => f.time !== null).map((f) => f.time?.value)).toEqual([2, 3]);
  });
});

describe("a work clause that mentions or negates a break keeps its duration (Codex review on #2893)", () => {
  const review = (text: string) => reviewTimeSuggestion(text, DAY, extractJournalSuggestions(text));
  const total = (fs: readonly { time: { value: number } | null }[]) =>
    fs.reduce((s, f) => s + (f.time?.value ?? 0), 0);

  it("lt: 'be pertraukos' is work — 6 + 1 + 1 = 8 h on review AND on the chat/MCP record", () => {
    const text = "Klijavau plyteles 6 val. be pertraukos, glaisčiau sienas 1 val., dažiau sienas 1 val.";
    expect(total(review(text).fragments)).toBe(8);
    expect(deriveIntakeWorkTime(text, DAY).fragments.reduce((s, f) => s + f.timeValue, 0)).toBe(8);
  });

  it("en: 'without a break' / 'no break' are work", () => {
    expect(total(review("Laid tiles 6 hours without a break, plastered walls 2 hours").fragments)).toBe(8);
    expect(total(review("Laid tiles 6 hours no break, plastered walls 2 hours").fragments)).toBe(8);
  });

  it("ru: 'без перерыва' is work", () => {
    expect(total(review("Клал плитку 6 часов без перерыва, штукатурил стены 2 часа").fragments)).toBe(8);
  });

  it("a real break clause with its own duration is still removed", () => {
    const r = review("Klijavau plyteles 6 val., glaisčiau sienas 2 val., pietų pertrauka 1 val.");
    expect(total(r.fragments)).toBe(8);
    expect(r.fragments.some((f) => /pertrauk/i.test(f.rawPhrase))).toBe(false);
  });
});
