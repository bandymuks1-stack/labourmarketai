import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { journalDayChoice, journalDayHref, shiftIsoDay } from "@/lib/journal/day-choice";
import {
  QUICK_RECORD_DRAFT_KEY,
  clearQuickRecordDraft,
  readQuickRecordDraft,
  writeQuickRecordDraft,
} from "@/lib/journal/quick-record-draft";

const JOURNAL = resolve(__dirname, "../../app/[locale]/dashboard/journal");

/**
 * WORK JOURNAL DATE CHOICE (owner P1, 2026-11-21). The journal opens with the
 * day the work happened: today, yesterday, a week ago, the calendar, or the
 * earlier entries. It is the calendar's own `?date=`, so every recording door
 * on the page takes that day, and an edit keeps its saved date.
 */
describe("journal date choice", () => {
  it("shifts a day across month and year ends, in UTC", () => {
    expect(shiftIsoDay("2026-11-21", -1)).toBe("2026-11-20");
    expect(shiftIsoDay("2026-11-21", -7)).toBe("2026-11-14");
    expect(shiftIsoDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftIsoDay("2026-01-03", -7)).toBe("2025-12-27");
    // A daylight-saving weekend does not move the key.
    expect(shiftIsoDay("2026-03-30", -1)).toBe("2026-03-29");
    expect(shiftIsoDay("2026-10-26", -1)).toBe("2026-10-25");
  });

  it("names the chosen option from the date", () => {
    const today = "2026-11-21";
    expect(journalDayChoice(null, today)).toBe("today");
    expect(journalDayChoice(today, today)).toBe("today");
    expect(journalDayChoice("2026-11-20", today)).toBe("yesterday");
    expect(journalDayChoice("2026-11-14", today)).toBe("weekAgo");
    expect(journalDayChoice("2026-11-02", today)).toBe("other");
    expect(journalDayChoice("2025-06-30", today)).toBe("other");
  });

  it("links to the recorder with the day the calendar uses", () => {
    expect(journalDayHref(null, false)).toBe("/dashboard/journal#journal-composer");
    expect(journalDayHref("2026-11-20", false)).toBe("/dashboard/journal?date=2026-11-20#journal-composer");
    expect(journalDayHref("2026-11-20", true)).toBe(
      "/dashboard/journal?compose=full&date=2026-11-20#journal-composer",
    );
  });

  it("the page shows the choice above the recorder, for a new entry only", () => {
    const page = readFileSync(resolve(JOURNAL, "page.tsx"), "utf8");
    const composer = page.indexOf('id="journal-composer"');
    const choice = page.indexOf("<JournalDayChoice");
    const quick = page.indexOf("<JournalQuickRecord");
    expect(composer).toBeGreaterThan(-1);
    expect(choice).toBeGreaterThan(composer);
    expect(choice).toBeLessThan(quick);
    expect(page).toMatch(/\{!editingEntry && \(\s*<JournalDayChoice/);
    // The recorder and the detailed form take the same day.
    expect(page).toMatch(/<JournalQuickRecord[\s\S]{0,200}selectedDay=\{selectedDate\}/);
    expect(page).toMatch(/defaultWorkDate=\{selectedDate\}/);
  });

  it("the date picker never offers a future day", () => {
    const src = readFileSync(resolve(JOURNAL, "day-choice.tsx"), "utf8");
    expect(src).toMatch(/type="date"\s+max=\{today\}/);
    expect(src).toMatch(/v <= today/);
  });

  it("the five options read exactly as the owner named them (2026-11-22)", () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, "../../messages/en/journal.json"), "utf8")).dayChoice;
    expect(en).toEqual({
      today: "Today",
      yesterday: "Yesterday",
      weekAgo: "A week ago",
      calendar: "Calendar",
      earlier: "Earlier entries",
    });
    const src = readFileSync(resolve(JOURNAL, "day-choice.tsx"), "utf8");
    // The labels are the words alone: no date in place of "Calendar", no arrow.
    expect(src).toMatch(/\{t\("dayChoice\.calendar"\)\}/);
    expect(src).toMatch(/\{t\("dayChoice\.earlier"\)\}\n/);
  });

  it("every active locale names the five options", () => {
    for (const l of ["lt", "en", "ru", "pl", "de", "nl", "sv"]) {
      const j = JSON.parse(readFileSync(resolve(__dirname, `../../messages/${l}/journal.json`), "utf8"));
      for (const k of ["today", "yesterday", "weekAgo", "calendar", "earlier"]) {
        expect(typeof j.dayChoice?.[k], `${l} ${k}`).toBe("string");
      }
    }
  });

  it("the started entry is kept for the tab until it is saved", () => {
    const m = new Map<string, string>();
    const s = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    expect(readQuickRecordDraft(s)).toBeNull();
    writeQuickRecordDraft({ text: "tiled 4 hours", understood: false }, s);
    expect(readQuickRecordDraft(s)).toEqual({ text: "tiled 4 hours", understood: false });
    writeQuickRecordDraft({ text: "tiled 4 hours", understood: true }, s);
    expect(readQuickRecordDraft(s)?.understood).toBe(true);
    // Emptying the field drops the draft; a foreign or broken value is ignored.
    writeQuickRecordDraft({ text: "  ", understood: false }, s);
    expect(m.has(QUICK_RECORD_DRAFT_KEY)).toBe(false);
    m.set(QUICK_RECORD_DRAFT_KEY, "{not json");
    expect(readQuickRecordDraft(s)).toBeNull();
    m.set(QUICK_RECORD_DRAFT_KEY, JSON.stringify({ v: 2, text: "x" }));
    expect(readQuickRecordDraft(s)).toBeNull();
    writeQuickRecordDraft({ text: "kept", understood: false }, s);
    clearQuickRecordDraft(s);
    expect(readQuickRecordDraft(s)).toBeNull();
    // Refused storage keeps nothing and throws nothing.
    const refusing = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(() => writeQuickRecordDraft({ text: "a", understood: false }, refusing)).not.toThrow();
    expect(readQuickRecordDraft(refusing)).toBeNull();
  });

  it("the recorder restores the draft on mount and clears it once saved", () => {
    const src = readFileSync(resolve(JOURNAL, "quick-record.tsx"), "utf8");
    expect(src).toMatch(/readQuickRecordDraft\(\)/);
    expect(src).toMatch(/onSaved=\{\(\) => clearQuickRecordDraft\(\)\}/);
  });
});
