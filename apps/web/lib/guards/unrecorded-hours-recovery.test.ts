import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectUnrecordedHours } from "@/lib/journal/unrecorded-hours";

/**
 * GUARD — the recovery hint TELLS the worker; it must never repair for them.
 *
 * 14 live production entries hold hours their worker wrote and the composer
 * never kept (dropped silently before 2026-08-20). The composer fix is
 * forward-only, so those entries keep their words and their missing time until
 * their OWN worker acts.
 *
 * The hint makes that discoverable. The standing temptation — and the thing
 * this guard exists to prevent — is to "just re-parse and save it". Writing
 * 6.5 hours onto a timesheet that will be approved, and may be paid, from text
 * the worker never reviewed manufactures a claim they never made (doctrine §7).
 */

const APP = join(__dirname, "..", "..");
const PAGE = readFileSync(
  join(APP, "app/[locale]/dashboard/journal/page.tsx"),
  "utf8",
);
const MODEL = readFileSync(join(APP, "lib/journal/unrecorded-hours.ts"), "utf8");
const LOCALES = ["en", "lt", "lv", "et", "pl", "ru", "de", "nl", "da", "no", "sv"];

describe("the hint is a report, never a repair", () => {
  it("the model writes nothing — no client, no action, no RPC", () => {
    expect(MODEL).not.toMatch(/createClient|supabase|\.rpc\(|"use server"/);
    expect(MODEL).not.toMatch(/insert|update|upsert|delete/i);
  });

  it("the page renders the hint without submitting anything", () => {
    expect(PAGE).toContain("detectUnrecordedHours(");
    const at = PAGE.indexOf("const unrecorded = detectUnrecordedHours(");
    expect(at).toBeGreaterThan(-1);
    const block = PAGE.slice(at, at + 1200);
    // No form, no action, no prefilled value anywhere in the hint.
    expect(block).not.toMatch(/<form|action=\{|formAction|defaultValue/);
    expect(block).toContain("entry.unrecordedHours");
  });

  it("it adds no query and widens no visibility", () => {
    // It reads the metrics the page ALREADY fetched for the worker's own
    // entries under their own RLS.
    expect(PAGE).toContain("e.journal_entry_metrics");
    expect(MODEL).not.toMatch(/from\("journal_entry/);
  });
});

describe("what it flags, measured against real production text", () => {
  it("flags an entry whose hours were lost", () => {
    // Verbatim from a production entry that lost its hours.
    expect(
      detectUnrecordedHours("3h staliaus darbai\r\n6,5h betonavimas", []).hasUnrecordedHours,
    ).toBe(true);
  });

  it("does NOT flag an entry that kept its hours", () => {
    expect(
      detectUnrecordedHours("Kasiau smėli 9h", [
        { metric_slug: "quantity", value_numeric: 9, unit_slug: "hours" },
      ]).hasUnrecordedHours,
    ).toBe(false);
  });

  it("does NOT flag prose that merely contains numbers", () => {
    expect(detectUnrecordedHours("3 langai ir 2 durys", []).hasUnrecordedHours).toBe(false);
    expect(detectUnrecordedHours("vedžiojau šunį", []).hasUnrecordedHours).toBe(false);
  });

  it("returns the worker's OWN words as the evidence shown back", () => {
    const r = detectUnrecordedHours("Montavau langa 2h", []);
    expect(r.mentions).toContain("2h");
  });
});

describe("copy", () => {
  it("exists in all 11 locales, names the mentions, and is no placeholder", () => {
    for (const loc of LOCALES) {
      const raw = JSON.parse(
        readFileSync(join(APP, "messages", loc, "journal.json"), "utf8"),
      ) as Record<string, Record<string, Record<string, string>>>;
      const node = raw.journal ?? (raw as never);
      const msg = node?.entry?.unrecordedHours;
      expect(msg, `${loc} entry.unrecordedHours`).toBeTruthy();
      expect(msg, `${loc} must show the worker's words`).toContain("{mentions}");
      expect(msg, `${loc} placeholder`).not.toMatch(/^\[EN\]/);
      // Doctrine: worker-facing journal copy carries no certification stem.
      expect(msg.toLowerCase(), `${loc} certification stem`).not.toMatch(
        /verif|confirm|tvirtin|подтверж|верифиц/,
      );
    }
  });
});
