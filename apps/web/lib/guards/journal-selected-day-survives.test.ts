import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractWorkLog } from "@/lib/conversation/worklog-extract";

/**
 * THE DAY THE PERSON PICKED IS THE DAY THAT IS SAVED (owner production walk
 * 2026-09-28: picked 27 September on the journal calendar, pressed
 * „Suprasti", the readback said 28 September).
 *
 * Cause: the calendar's `?date=` never reached the recorder — the one-line
 * recorder seeded the reader with the browser's today, and every "record on
 * this day" link dropped the day. This guard pins the human contract, not a
 * component: selected day → reader → readback → the one save path.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

describe("the reader keeps a chosen day unless the sentence names its own", () => {
  const TODAY = "2026-09-28";
  const PICKED = "2026-09-27";

  it("a sentence with no day lands on the picked day", () => {
    expect(extractWorkLog("9 valandas kodavom projektą agentai os", TODAY, PICKED).date).toBe(
      PICKED,
    );
  });

  it("'vakar' stays relative to the real today, not to the picked day", () => {
    expect(extractWorkLog("vakar dirbau 8 val.", TODAY, "2026-09-20").date).toBe("2026-09-27");
  });

  it("an explicit ISO day in the sentence wins", () => {
    expect(extractWorkLog("2026-09-01 dirbau 8 val.", TODAY, PICKED).date).toBe("2026-09-01");
  });

  it("no picked day → today (unchanged behaviour for chat and voice)", () => {
    expect(extractWorkLog("dirbau 8 val.", TODAY).date).toBe(TODAY);
  });
});

describe("the journal page hands the picked day to the recorder", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  const recorder = read("app/[locale]/dashboard/journal/quick-record.tsx");
  const composer = read("components/app/journal-entry-composer.tsx");

  it("the one-line recorder receives the calendar's selected day", () => {
    expect(page).toMatch(/<JournalQuickRecord[\s\S]{0,200}selectedDay=\{selectedDate\}/);
  });

  it("the recorder reads with the picked day as the default day", () => {
    expect(recorder).toMatch(/extractWorkLog\(text, today, selectedDay \?\? today\)/);
    expect(recorder).not.toMatch(/extractWorkLog\(text, personCalendarDay\(\)\)/);
  });

  it("a picked past day is named in the question — never 'Ką šiandien dirbai?' over another day", () => {
    expect(recorder).toMatch(/const heading = selectedDayLabel\s*\?\s*t\("whatOnDay", \{ day: selectedDayLabel \}\)/);
    expect(page).toMatch(/selectedDate && selectedDate !== todayIsoKey\s*\?\s*formatUtcDate\(selectedDate, locale\)/);
  });

  it("the full form starts a NEW record on the picked day", () => {
    expect(page).toMatch(/defaultWorkDate=\{selectedDate\}/);
    expect(composer).toMatch(/editingEntry\?\.workDate \?\? defaultWorkDate \?\? today/);
  });

  it("no link into the recorder drops the picked day", () => {
    expect(page).not.toMatch(/href=\{"\/dashboard\/journal#journal-composer"/);
    expect(page).not.toMatch(/href=\{"\/dashboard\/journal\?compose=full#journal-composer"/);
    expect(page).toMatch(/if \(selectedDate\) q\.set\("date", selectedDate\)/);
  });
});
