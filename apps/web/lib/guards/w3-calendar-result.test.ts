import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 — THE CALENDAR RESULT: source guards.
 *
 * The calendar was the one `dataReadiness: "real"` result kind with NO
 * rendering case in `ResultBody` — "show me my calendar" fell through to the
 * pending line. The slice adds the PANEL presentation of the Time Engine, and
 * these guards pin the two properties that make it safe:
 *
 *   1. ONE CALCULATION — the loader reads the canonical projection
 *      (`getPlanning` → `buildAgenda`) and NOTHING else: no supabase import,
 *      no table read of its own, no second calendar truth store. This is the
 *      anti-second-calendar rule expressed against the file that could most
 *      easily violate it.
 *
 *   2. ONE PRESENTATION PER SURFACE — `ResultBody` renders the `calendar`
 *      case; the chat keeps the sentence (`loadContextBrief`) and opens the
 *      result rather than growing a thread calendar.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("W3 calendar result — one calculation, two presentations", () => {
  it("ResultBody renders the calendar case through CalendarResult", () => {
    const body = read("components/app/workspace/result-body.tsx");
    expect(body).toMatch(/case "calendar":/);
    expect(body).toMatch(/<CalendarResult onOpenFull=\{onOpenFull\} \/>/);
  });

  it("the loader reads ONLY the canonical Time Engine projection", () => {
    const loader = read("lib/planning/calendar-result.ts");
    // The canonical read pair — the same one the planning page and the chat
    // sentence use.
    expect(loader).toMatch(/getPlanning/);
    expect(loader).toMatch(/buildAgenda/);
    // NO data path of its own: no supabase client, no table name, no RPC.
    expect(loader).not.toMatch(/supabase/i);
    expect(loader).not.toMatch(/\.from\(/);
    expect(loader).not.toMatch(/\.rpc\(/);
    expect(loader).not.toMatch(/fetch\(/);
    // Server-side module — the client component receives finished strings.
    expect(loader).toMatch(/"use server"/);
    expect(loader).toMatch(/import "server-only"/);
  });

  it("the panel component computes nothing and routes nowhere", () => {
    const cmp = read("components/app/workspace/calendar-result.tsx");
    // No routing — onOpenFull is the workspace layer's callback. (The JSX
    // form `<Link …` — the prose "`<Link>`" in the header comment is allowed.)
    expect(cmp).not.toMatch(/<Link[\s/]/);
    expect(cmp).not.toMatch(/useRouter/);
    expect(cmp).not.toMatch(/from "@\/lib\/i18n\/navigation"/);
    // No data reads of its own — only the loader.
    expect(cmp).not.toMatch(/supabase/i);
    expect(cmp).toMatch(/loadCalendarResult/);
    // The honest state set is present.
    for (const state of [
      "calendar-result-loading",
      "calendar-result-error",
      "calendar-result-retry",
      "calendar-result-blocked",
      "calendar-result-empty",
      "calendar-result-partial",
      "calendar-result-conflicts",
      "calendar-result-open-full",
    ]) {
      expect(cmp, `missing state hook ${state}`).toContain(state);
    }
  });

  it("the chat explains and OPENS the result — it does not draw a calendar", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    // startAgenda opens the panel result…
    expect(chat).toMatch(/openResultRef\.current\("calendar"\)/);
    // …and the thread keeps rendering the sentence through the ONE readback.
    expect(chat).toMatch(/loadContextBrief/);
  });

  it("every active locale carries the calendar panel copy", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        conversation: { results: Record<string, string> };
      };
      const results = messages.conversation.results;
      for (const key of [
        "calendarError",
        "calendarBlocked",
        "calendarEmpty",
        "calendarUndated",
        "calendarLater",
        "calendarConflicts",
        "calendarPartial",
        "calendarMoreItems",
        "calendarMoreDays",
        "calendarToday",
      ]) {
        expect(
          typeof results[key] === "string" && results[key].trim() !== "",
          `${locale}: conversation.results.${key} missing or empty`,
        ).toBe(true);
      }
    }
  });
});
