import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 5 — Daily Work Journal Simplification (UX Recovery Train).
 *
 * The extraction/confirm/persist engine already existed (deterministic
 * 12-language recognizer, #765 Confirm/Correct/Reject, canonical
 * journal_entry_skills evidence, no auto-verify). This wagon is the
 * FIRST-VIEW contract, pinned here:
 *   1. one large input + one main action lead the page ("Ką šiandien
 *      dirbai?" framing) — composer before history;
 *   2. the real status/legend/count lines stay, but behind ONE deliberate
 *      disclosure — no technical status wall by default;
 *   3. history stays compact (newest day open, older collapsed);
 *   4. the question copy exists in EVERY journal locale.
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const PAGE = read("app/[locale]/dashboard/journal/page.tsx");

describe("Wagon 5 — journal first view", () => {
  it("composer leads (order-1), history follows (order-2)", () => {
    expect(PAGE).toMatch(/id="journal-composer"\s+className="order-1"/);
    expect(PAGE).toMatch(/order-2[^"]*"\s*data-testid="journal-entries"/);
  });

  it("status/legend/count lines live inside ONE disclosure, all still present", () => {
    const details = PAGE.slice(
      PAGE.indexOf('data-testid="journal-status-details"'),
      PAGE.indexOf("</details>", PAGE.indexOf('data-testid="journal-status-details"')),
    );
    expect(details.length).toBeGreaterThan(100);
    // the honest lines were MOVED, not deleted
    expect(details).toMatch(/journal-who-can-confirm/);
    expect(details).toMatch(/journal-cv-bridge/);
    expect(details).toMatch(/journal-proof-loop/);
    expect(details).toMatch(/EvidenceStatusStrip/);
    expect(details).toMatch(/statusExplainer/);
  });

  it("history stays compact: newest day open, older days collapsed", () => {
    expect(PAGE).toMatch(/open=\{idx === 0\}/);
  });
});

describe("Wagon 5 — the daily question exists in every journal locale", () => {
  const messagesDir = join(APP, "messages");
  const locales = readdirSync(messagesDir).filter((entry) => {
    try {
      return statSync(join(messagesDir, entry, "journal.json")).isFile();
    } catch {
      return false;
    }
  });

  it("scans a meaningful locale set", () => {
    expect(locales.length).toBeGreaterThanOrEqual(12);
  });

  for (const locale of locales) {
    it(`${locale}: whatDidYouDo + statusExplainer present and question-shaped`, () => {
      const journal = JSON.parse(read(`messages/${locale}/journal.json`)) as {
        whatDidYouDo?: string;
        statusExplainer?: string;
      };
      expect(journal.whatDidYouDo?.trim().endsWith("?")).toBe(true);
      expect(journal.statusExplainer?.trim().length).toBeGreaterThan(0);
    });
  }

  it("lt asks the doc's exact daily question", () => {
    const lt = JSON.parse(read("messages/lt/journal.json")) as {
      whatDidYouDo?: string;
    };
    expect(lt.whatDidYouDo).toBe("Ką šiandien dirbai?");
  });
});
