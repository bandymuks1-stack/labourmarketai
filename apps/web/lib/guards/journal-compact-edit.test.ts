import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal compact edit UX (P0) — source guards for the repaired edit surface.
 *
 * Production incident (owner-proven): editing an entry opened a page-length
 * multi-bucket review matrix with repeated "nothing found" boxes; "Pridėti"
 * taps changed local state that LOOKED saved but wasn't; LT plurals were
 * broken ("1 valandos"); time was not tied to its activity.
 *
 * These guards pin the repair:
 *   1. the row's edit drawer mounts the COMPACT editor — never the full
 *      composer review matrix;
 *   2. the compact editor renders NO suggestion buckets and NO empty-state
 *      boxes; activity rows carry skill + ITS time together;
 *   3. one sticky batch save + cancel; dirty indicator; additions render in
 *      an explicit UNSAVED style until saved;
 *   4. the supersede action carries the worker's decision markers forward
 *      BEFORE the pipeline runs (no data loss on edit);
 *   5. LT plural helper exists and time displays never render "1 valandos";
 *   6. the compact i18n keys exist in every journal.json locale.
 *
 * The composer's SAVE-flow pipeline-result groups stay pinned by
 * `journal-pipeline-canonical.test.ts` — the compact EDIT flow is additive.
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const EDITOR = read("components/app/journal-entry-compact-editor.tsx");
const LAUNCHER = read("components/app/journal-entry-edit-launcher.tsx");
const ACTIONS = read("lib/journal/actions.ts");
const MODEL = read("lib/journal/compact-edit-model.ts");
const COMPOSER = read("components/app/journal-entry-composer.tsx");

describe("1 · edit drawer mounts the COMPACT editor", () => {
  it("launcher renders JournalEntryCompactEditor, not the composer", () => {
    expect(LAUNCHER).toMatch(/JournalEntryCompactEditor/);
    expect(LAUNCHER).not.toMatch(/<JournalEntryComposer/);
  });
  it("launcher confirms before closing a dirty editor (no silent discard)", () => {
    expect(LAUNCHER).toMatch(/confirmDiscard/);
    expect(LAUNCHER).toMatch(/onDirtyChange/);
  });
  it("reopening remounts the editor from the entry's saved state (P1-B §13)", () => {
    // Fresh mount per open — a reopened drawer starts from the CURRENT live
    // entry the page passes in, never a stale in-memory chain.
    expect(LAUNCHER).toMatch(/key=\{entry\.id\}/);
  });
});

describe("2 · compact editor — no matrix, no empty buckets, rows own their time", () => {
  it("imports NO suggestion-bucket machinery and re-runs NO suggestions", () => {
    expect(EDITOR).not.toMatch(/DetectedSuggestionList/);
    expect(EDITOR).not.toMatch(/DetectedSuggestionCard/);
    expect(EDITOR).not.toMatch(/WorkEntrySkillReview/);
    expect(EDITOR).not.toMatch(/SimilarSkillsSection/);
    expect(EDITOR).not.toMatch(/extractJournalSuggestions/);
    // the review-matrix empty-state key never renders here
    expect(EDITOR).not.toMatch(/emptyBucket/);
    expect(EDITOR).not.toMatch(/skillNoMatch/);
  });
  it("rows derive from the PERSISTED state via the pure model", () => {
    expect(EDITOR).toMatch(/deriveCompactRows/);
    expect(MODEL).toMatch(/entry\.activities/);
    expect(MODEL).toMatch(/entry\.skillSlugs/);
  });
  it("each row renders label + time + unit + remove together", () => {
    expect(EDITOR).toMatch(/data-testid="journal-compact-row"/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-row-time"/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-row-unit"/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-row-remove"/);
  });
  it("the global time field only exists when NO row carries its own time", () => {
    expect(EDITOR).toMatch(
      /rows\.every\(\(r\) => r\.timeValue === ""\)/,
    );
  });
  it("advanced fields sit under ONE collapsed disclosure", () => {
    expect(EDITOR).toMatch(/data-testid="journal-compact-advanced"/);
    expect(EDITOR).toMatch(/<details/);
  });
});

describe("3 · one save contract (batch) + honest local state", () => {
  it("one sticky save + cancel with the exact LT copy keys", () => {
    expect(EDITOR).toMatch(/data-testid="journal-compact-save"/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-cancel"/);
    expect(EDITOR).toMatch(/sticky bottom-0/);
    expect(EDITOR).toMatch(/compactEdit\.save/);
    expect(EDITOR).toMatch(/compactEdit\.cancel/);
  });
  it("saves through the ONE existing supersede action", () => {
    // P1-B: every save supersedes the LATEST live entry of the drawer's
    // chain — never the original entry again (which forked the chain into
    // duplicate live entries on the second save).
    expect(EDITOR).toMatch(/supersedeJournalEntry\(currentEntryId/);
    expect(EDITOR).not.toMatch(/supersedeJournalEntry\(entry\.id/);
    // no second save path, no direct table writes from the editor
    expect(EDITOR).not.toMatch(/createJournalEntry/);
    expect(EDITOR).not.toMatch(/from\("journal_entr/);
  });
  it("the supersession chain advances ONLY on a successful save (P1-B)", () => {
    expect(EDITOR).toMatch(
      /const \[currentEntryId, setCurrentEntryId\] = useState\(entry\.id\)/,
    );
    expect(EDITOR).toMatch(/setCurrentEntryId\(result\.entryId\)/);
    // the only advance sits AFTER the !result.ok early-return
    const errReturn = EDITOR.indexOf("setError(result.message)");
    const advance = EDITOR.indexOf("setCurrentEntryId(result.entryId)");
    expect(errReturn).toBeGreaterThan(0);
    expect(advance).toBeGreaterThan(errReturn);
  });
  it("taxonomy rows keep their slug through serialization (P1-A)", () => {
    expect(MODEL).toMatch(/activitySlug: r\.skillSlug/);
    expect(MODEL).not.toMatch(/activitySlug: null/);
    // the server validates + links the selection on the NEW entry
    expect(ACTIONS).toMatch(/linkSelectedTaxonomySkills/);
    expect(ACTIONS).toMatch(/verified: false/);
    expect(ACTIONS).not.toMatch(/verified\s*:\s*true/);
  });
  it("dirty indicator + unsaved chip on local additions", () => {
    expect(EDITOR).toMatch(/data-testid="journal-compact-dirty"/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-unsaved-chip"/);
    expect(EDITOR).toMatch(/border-dashed/);
  });
  it("failure keeps edits in the form (retryable error, no reset)", () => {
    expect(EDITOR).toMatch(/data-testid="journal-compact-error"/);
    // error path only sets the error — never clears rows/text
    expect(EDITOR).toMatch(/setError\(result\.message\)/);
    expect(EDITOR).not.toMatch(/setRows\(\[\]\)/);
    expect(EDITOR).not.toMatch(/setText\(""\)/);
  });
  it("additions ride the honest lanes: taxonomy search + free-text fallback", () => {
    expect(EDITOR).toMatch(/searchTaxonomySkills/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-add"/);
    expect(EDITOR).toMatch(/data-testid="journal-compact-add-freetext"/);
  });
  it("ambiguous follow-ups reuse the EXISTING clarification actions", () => {
    expect(EDITOR).toMatch(/confirmJournalAmbiguousChoice/);
    expect(EDITOR).toMatch(/rejectJournalAmbiguousCandidate/);
  });
});

describe("4 · no data loss on supersede (decision markers carried forward)", () => {
  it("actions copy the 4 decision marker kinds to the new entry", () => {
    expect(ACTIONS).toMatch(/carryForwardEntryDecisionMarkers/);
    expect(ACTIONS).toMatch(/"ambiguous_resolved"/);
    expect(ACTIONS).toMatch(/"skill_rejected"/);
    expect(ACTIONS).toMatch(/"skill_claim_rejected"/);
    expect(ACTIONS).toMatch(/"unresolved_dismissed"/);
  });
  it("carry-forward runs BEFORE the pipeline for the new entry", () => {
    const carryIdx = ACTIONS.indexOf(
      "await carryForwardEntryDecisionMarkers(supabase, oldEntryId, newEntryId)",
    );
    const pipelineIdx = ACTIONS.indexOf("entryId: newEntryId");
    expect(carryIdx).toBeGreaterThan(0);
    expect(pipelineIdx).toBeGreaterThan(carryIdx);
  });
  it("carry-forward is append-only (insert; never update/delete the lane)", () => {
    expect(ACTIONS).not.toMatch(/from\("journal_entry_metrics"\)\s*\.\s*update/);
    // the only journal_entry_metrics delete stays absent
    expect(ACTIONS).not.toMatch(/from\("journal_entry_metrics"\)\s*\.\s*delete/);
  });
});

describe("5 · LT pluralization honesty", () => {
  it("the pure helper exists with the standard LT rules", () => {
    const helper = read("lib/i18n/lt-plural.ts");
    expect(helper).toMatch(/mod10 === 1 && mod100 !== 11/);
    expect(helper).toMatch(/mod10 >= 2 && mod10 <= 9/);
  });
  it("composer time displays go through the duration formatter (never raw unit)", () => {
    // the broken pattern `${timeValue} ${tUnit(timeUnit)}` ("1 valandos")
    // must not exist anywhere anymore
    expect(COMPOSER).not.toMatch(/\$\{timeValue\} \$\{tUnit\(timeUnit\)\}/);
    expect(COMPOSER).toMatch(/formatDuration\(/);
  });
  it("the compact editor uses plural-correct totals + base unit forms", () => {
    expect(EDITOR).toMatch(/formatLtCount/);
    expect(EDITOR).toMatch(/LT_HOUR_FORMS/);
    expect(EDITOR).toMatch(/compactEdit\.unitHours/);
  });
});

describe("6 · i18n keys ×all journal.json locales + exact LT copy", () => {
  const locales = [
    "da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv",
  ];
  const KEYS = [
    "activitiesTitle",
    "timeLabel",
    "addActivity",
    "searchPlaceholder",
    "addAsClaim",
    "removeRow",
    "save",
    "cancel",
    "saved",
    "unsavedChip",
    "dirtyNote",
    "confirmDiscard",
    "advanced",
    "close",
    "totalTime",
    "unitHours",
    "unitMinutes",
    "unitDays",
    "quantityLabel",
    "directionLabel",
    "siteLabel",
    "institutionLabel",
    "topicLabel",
  ];
  it("every locale carries the full compactEdit namespace", () => {
    for (const loc of locales) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        compactEdit?: Record<string, string>;
      };
      for (const key of KEYS) {
        expect(
          typeof j.compactEdit?.[key],
          `${loc}.compactEdit.${key}`,
        ).toBe("string");
      }
    }
  });
  it("LT copy is the plain agreed wording", () => {
    const lt = (
      JSON.parse(read("messages/lt/journal.json")) as {
        compactEdit: Record<string, string>;
      }
    ).compactEdit;
    expect(lt.activitiesTitle).toBe("Veikla ir įgūdžiai");
    expect(lt.timeLabel).toBe("Skirtas laikas");
    expect(lt.addActivity).toBe("Pridėti veiklą");
    expect(lt.save).toBe("Išsaugoti pakeitimus");
    expect(lt.saved).toBe("Pakeitimai išsaugoti");
    expect(lt.dirtyNote).toBe("Neišsaugoti pakeitimai");
    expect(lt.unsavedChip).toBe("Neišsaugota");
    expect(lt.unitHours).toBe("val.");
    expect(lt.unitMinutes).toBe("min.");
  });
  it("time/quantity/location/direction labels are never called 'įgūdžiai'", () => {
    const lt = (
      JSON.parse(read("messages/lt/journal.json")) as {
        compactEdit: Record<string, string>;
      }
    ).compactEdit;
    for (const key of [
      "timeLabel",
      "quantityLabel",
      "siteLabel",
      "directionLabel",
      "topicLabel",
      "institutionLabel",
    ]) {
      expect(lt[key].toLowerCase()).not.toContain("įgūd");
    }
  });
});

describe("7 · integrity — the compact surface can never fake verification", () => {
  it("no verified:true / manager_confirmed anywhere in the new surface", () => {
    for (const src of [EDITOR, MODEL, LAUNCHER]) {
      expect(src).not.toMatch(/verified\s*:\s*true/);
      expect(src).not.toMatch(/manager_confirmed/);
    }
  });
  it("entry text is never logged", () => {
    // console calls in the editor carry no entry text/notes variables
    expect(EDITOR).not.toMatch(/console\.[a-z]+\([^)]*\btext\b/);
  });
});
