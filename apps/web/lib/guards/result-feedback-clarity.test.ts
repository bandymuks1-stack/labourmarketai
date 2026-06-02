import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Result-feedback clarity guard (slice clear-result-feedback-v1).
 *
 * The journal → structuring → profile-evidence flow must never be a silent
 * "long procedure with no result": after a worker SAVES a journal entry, or
 * SAVES self-declared skills to their profile, the UI must answer — was it
 * saved, where can I see it, and what's the next useful action — and stay
 * honest about who can confirm. This guard pins those feedback affordances +
 * their anchor targets so they cannot silently regress to a dead end.
 *
 * Pure source + i18n assertions; runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const COMPOSER = "components/app/journal-entry-composer.tsx";
const JOURNAL_PAGE = "app/[locale]/dashboard/journal/page.tsx";
const PROFILE_FLOW = "components/app/profile-text-first-flow.tsx";
const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";
const LOCALES = ["lt", "en"] as const;

const JOURNAL_SAVED_KEYS = [
  "savedBodyWithDetails",
  "savedConfirmNote",
  "savedSeeEntries",
  "savedOpenProfile",
] as const;

// ── 1. Journal save success banner is not a dead end ──────────────────────

describe("Guard: the journal save banner shows result + next action", () => {
  const src = read(COMPOSER);

  it("renders an identifiable success banner", () => {
    expect(src).toMatch(/data-testid="journal-saved-banner"/);
  });

  it("answers 'what changed' with a detail count and a next-step note", () => {
    expect(src).toMatch(/t\("savedBodyWithDetails",\s*\{\s*count:/);
    expect(src).toMatch(/t\("savedConfirmNote"\)/);
  });

  it("links to WHERE the result appears (entries below + profile)", () => {
    expect(src).toMatch(/href="#journal-entries"/);
    expect(src).toMatch(/t\("savedSeeEntries"\)/);
    expect(src).toMatch(/dashboard\/profile#capabilities/);
    expect(src).toMatch(/t\("savedOpenProfile"\)/);
  });

  it("the journal page provides the #journal-entries anchor target", () => {
    expect(read(JOURNAL_PAGE)).toMatch(/id="journal-entries"/);
  });
});

// ── 2. Profile skill-save is not a dead end ───────────────────────────────

describe("Guard: the profile capability save links to the result", () => {
  it("the applied toast links to the capabilities surface", () => {
    const src = read(PROFILE_FLOW);
    expect(src).toMatch(/data-testid="profile-text-flow-applied-toast"/);
    expect(src).toMatch(/t\("viewCapabilities"\)/);
    expect(src).toMatch(/href="#capabilities"/);
  });

  it("the profile page provides the #capabilities anchor target", () => {
    expect(read(PROFILE_PAGE)).toMatch(/id="capabilities"/);
  });
});

// ── 3. Feedback copy exists, parity-clean, and honest ─────────────────────

describe("Guard: feedback copy is present in LT + EN and honest", () => {
  for (const loc of LOCALES) {
    const journal = loadJson(`messages/${loc}/journal.json`) as Record<string, string>;

    it(`${loc}: all journal saved-feedback keys exist and are non-empty`, () => {
      for (const k of JOURNAL_SAVED_KEYS) {
        expect(journal[k], `${loc} journal.${k}`).toBeTruthy();
      }
    });

    it(`${loc}: savedConfirmNote names a real human confirmer, not automation`, () => {
      const note = journal.savedConfirmNote ?? "";
      const human = loc === "lt" ? /vadov|klient/i : /manager|client/i;
      expect(human.test(note), `${loc} savedConfirmNote human confirmer: "${note}"`).toBe(true);
      // never claim automatic / AI confirmation (AI matched case-sensitively to
      // avoid the LT ASCII-\b false positive on words like "įrašai")
      expect(/automati(?:c|cally|nis|škai)|guaranteed/i.test(note)).toBe(false);
      expect(/(?<![A-Za-z])AI(?![A-Za-z])/.test(note)).toBe(false);
    });

    it(`${loc}: skills.textFirst.viewCapabilities exists`, () => {
      const tf = (loadJson(`messages/${loc}.json`).skills as {
        textFirst?: Record<string, string>;
      }).textFirst;
      expect(tf?.viewCapabilities, `${loc} skills.textFirst.viewCapabilities`).toBeTruthy();
    });
  }

  it("LT and EN journal saved-feedback key sets match (no drift)", () => {
    const lt = loadJson("messages/lt/journal.json");
    const en = loadJson("messages/en/journal.json");
    for (const k of JOURNAL_SAVED_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(lt, k)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(en, k)).toBe(true);
    }
  });
});

// ── Negative controls — the honesty detector is real ──────────────────────

describe("Guard: confirmer-honesty detector is real", () => {
  it("flags automation claims, passes human-confirmer copy", () => {
    expect(/automati(?:c|cally|nis|škai)|guaranteed/i.test("automatically confirmed")).toBe(true);
    expect(/manager|client/i.test("until a manager or client confirms it")).toBe(true);
    expect(/(?<![A-Za-z])AI(?![A-Za-z])/.test("privatu, kol vadovas nepatvirtins")).toBe(false);
  });
});
