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

describe("Wagon 5 completion — composer first view contract", () => {
  const COMPOSER = read("components/app/journal-entry-composer.tsx");

  it("question heading → textarea → example → primary action → ONE more-options disclosure", () => {
    const question = COMPOSER.indexOf('{t("whatDidYouDo")}');
    const example = COMPOSER.indexOf('data-testid="journal-example-line"');
    const save = COMPOSER.indexOf('data-testid="journal-save-entry"');
    const more = COMPOSER.indexOf('data-testid="journal-more-options"');
    for (const [name, idx] of Object.entries({ question, example, save, more })) {
      expect(idx, `${name} missing`).toBeGreaterThan(-1);
    }
    expect(question).toBeLessThan(example);
    expect(example).toBeLessThan(save);
    expect(save).toBeLessThan(more);
  });

  it("advanced controls live INSIDE the disclosure (moved, not deleted)", () => {
    const details = COMPOSER.slice(
      COMPOSER.indexOf('data-testid="journal-more-options"'),
    );
    expect(details).toMatch(/journal-mode-picker/);
    expect(details).toMatch(/journal-template-picker/);
    expect(details).toMatch(/journal-engagement-switcher/);
    expect(details).toMatch(/&& photoField\}/); // render sites of the ONE photo field
    expect(details).toMatch(/examplesTitle/);
  });

  it("rejected suggestions leave no trace — excluded from the SERVER pipeline", () => {
    // P0 Track B repin: the fire-and-forget client call is gone; the rejected
    // slugs now ship WITH the save (rejected_slugs_json) and the AWAITED
    // server-side pipeline excludes them — same no-trace guarantee, stronger
    // delivery (it can no longer die silently in a closing tab).
    expect(COMPOSER).not.toMatch(/void autoLinkRecognizedJournalSkills/);
    expect(COMPOSER).toMatch(
      /fd\.set\("rejected_slugs_json",\s*JSON\.stringify\(rejectedSlugs\)\)/,
    );
    const actions = read("lib/journal/actions.ts");
    expect(actions).toMatch(/rejected_slugs_json/);
    expect(actions).toMatch(/excludeSlugs:\s*rejectedSlugs/);
    const pipeline = read("lib/journal/skill-pipeline.ts");
    expect(pipeline).toMatch(/excludeSlugs\?/);
    expect(pipeline).toMatch(/!excluded\.has\(r\.slug\)/);
  });

  it("empty corrections can never be saved; corrected rows stay self-declared claims", () => {
    expect(COMPOSER).toMatch(/\.filter\(\(v\) => v\.length > 0\)/);
    expect(COMPOSER).toMatch(/saveProfileSkillClaimsAction\(correctedLabels\)/);
    // never verified / never manager path from the composer (code, not the
    // honesty comments that explain the rule)
    expect(COMPOSER).not.toMatch(/status:\s*["']verified["']/);
    expect(COMPOSER).not.toMatch(/manager_confirmed\s*[:=]\s*true/);
  });

  it("save result shows the honest skills summary", () => {
    expect(COMPOSER).toMatch(/data-testid="journal-saved-skills-line"/);
    expect(COMPOSER).toMatch(/savedSkillsSummary/);
  });

  it("skill rows carry direct correction (editable) + add + reject", () => {
    const skillsBlock = COMPOSER.slice(
      COMPOSER.indexOf("{skillSuggestions.map((row) => ("),
    );
    expect(skillsBlock).toMatch(/editable/);
    expect(skillsBlock).toMatch(/onEdit=\{\(next\) => editSkillLabel\(row\.slug, next\)\}/);
    expect(skillsBlock).toMatch(/onConfirm/);
    expect(skillsBlock).toMatch(/onDiscard/);
  });

  it("skills bucket announces plainly in the 5 required languages", () => {
    const expected: Record<string, string> = {
      lt: "Radome šiuos galimus įgūdžius",
      en: "We found these possible skills",
      ru: "Мы нашли эти возможные навыки",
      de: "Wir haben diese möglichen Fähigkeiten gefunden",
      nl: "We vonden deze mogelijke vaardigheden",
    };
    for (const [loc, value] of Object.entries(expected)) {
      const base = JSON.parse(read(`messages/${loc}.json`)) as {
        structuring?: { buckets?: { skills?: string } };
      };
      expect(base.structuring?.buckets?.skills, loc).toBe(value);
    }
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
