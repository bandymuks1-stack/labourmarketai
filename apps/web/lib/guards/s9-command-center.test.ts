import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deriveCommandQueue,
  type CommandSignals,
} from "../worker/next-action-engine";

/**
 * S9 guard — command center honesty.
 * The next-action engine is pure and deterministic; the queue strip renders
 * ONLY real signals the big cards do not already own (no duplication);
 * layout preferences are device-local (localStorage) and never claimed to
 * sync; hiding a section is reversible.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const engine = read("lib/worker/next-action-engine.ts");
const queueComp = read("components/app/today/command-queue.tsx");
const prefs = read("components/app/today/section-prefs.tsx");
const todayScreen = read("components/app/today/today-screen.tsx");

const BASE: CommandSignals = {
  expiringDocs: [],
  entriesToday: 1,
  weekDaysWithEntries: 3,
  weekDaysElapsed: 3,
  skillSuggestionSlug: null,
};

describe("next-action engine is pure, deterministic and priority-ordered", () => {
  it("a genuinely clear day yields an EMPTY queue (nothing invented)", () => {
    expect(deriveCommandQueue(BASE)).toEqual([]);
  });
  it("document expiry outranks everything; ordered by validUntil", () => {
    const q = deriveCommandQueue({
      ...BASE,
      entriesToday: 0,
      expiringDocs: [
        { slug: "b", validUntil: "2026-07-02" },
        { slug: "a", validUntil: "2026-06-20" },
      ],
    });
    expect(q[0]).toEqual({ kind: "renew_document", docSlug: "a", validUntil: "2026-06-20" });
    expect(q[1].kind).toBe("renew_document");
    expect(q[2]).toEqual({ kind: "fill_today" });
  });
  it("week gaps never double-count an unfilled today", () => {
    const q = deriveCommandQueue({
      ...BASE,
      entriesToday: 0,
      weekDaysWithEntries: 1,
      weekDaysElapsed: 3,
    });
    // 3 elapsed − 1 filled − 1 (today already queued) = 1 gap
    expect(q).toContainEqual({ kind: "fill_week_gaps", missingDays: 1 });
  });
  it("same input → same output (determinism)", () => {
    const sig = { ...BASE, entriesToday: 0, skillSuggestionSlug: "x" };
    expect(deriveCommandQueue(sig)).toEqual(deriveCommandQueue(sig));
  });
  it("the engine is pure — no IO of any kind", () => {
    expect(engine).not.toMatch(/supabase|fetch\(|createClient|\.rpc\(/);
  });
});

describe("the queue strip renders only un-owned real signals", () => {
  it("filters to document + week-gap items (no duplication of the big cards)", () => {
    expect(queueComp).toMatch(/a\.kind === "renew_document" \|\| a\.kind === "fill_week_gaps"/);
  });
  it("expiring docs come from the REAL derived statuses (flag-gated read)", () => {
    expect(queueComp).toMatch(/DOCUMENTS_READINESS_ENABLED/);
    expect(queueComp).toMatch(/deriveDocumentStatus/);
    expect(queueComp).toMatch(/"expiring" \|\| x\.status === "blocked"/);
  });
  it("a clear queue renders nothing at all (Ramybės testas)", () => {
    expect(queueComp).toMatch(/if \(queue\.length === 0\) return null;/);
  });
});

describe("layout prefs are device-local and reversible", () => {
  it("persists ONLY to localStorage, never to the DB", () => {
    expect(prefs).toMatch(/window\.localStorage/);
    expect(prefs).not.toMatch(/supabase|fetch\(|\.rpc\(|createClient/);
  });
  it("says honestly that the layout lives on this device", () => {
    expect(prefs).toMatch(/layout-device-note/);
  });
  it("hiding is reversible and never loses a new section", () => {
    expect(prefs).toMatch(/added = defaultOrder\.filter/);
    expect(prefs).toMatch(/layout-hide-toggle/);
  });
  it("the today screen mounts the queue + prefs wrapper", () => {
    expect(todayScreen).toMatch(/<CommandQueue\b/);
    expect(todayScreen).toMatch(/<SectionPrefs\b/);
  });
});

describe("S9 copy exists in all 10 locales", () => {
  const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
  it("queue + layout keys present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      expect(j.todayScreen?.queue?.renewDocument, `${locale} renewDocument`).toBeTruthy();
      expect(j.todayScreen?.queue?.weekGaps, `${locale} weekGaps`).toBeTruthy();
      expect(j.todayScreen?.layout?.deviceNote, `${locale} deviceNote`).toBeTruthy();
      expect(j.todayScreen?.layout?.sections?.action, `${locale} sections.action`).toBeTruthy();
    }
  });
});
