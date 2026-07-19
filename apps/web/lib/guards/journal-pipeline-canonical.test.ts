import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 Track B — canonical journal skill pipeline source guards.
 *
 * The bug this repairs: saving a journal entry ran skill recognition as a
 * CLIENT-side fire-and-forget (`void autoLinkRecognizedJournalSkills(...)`)
 * that could silently die, and only ever linked skills the worker had already
 * declared — new recognised skills never reached the CV and failures were
 * invisible. These guards pin the repaired contract:
 *   1. the save action AWAITS the server-side pipeline;
 *   2. the composer has NO fire-and-forget recognition call left;
 *   3. the pipeline can never write fake verification (no `verified: true`,
 *      no AI-extracted source label);
 *   4. an idempotent per-entry reprocess action exists as the recovery path;
 *   5. the composer surfaces the honest pipeline result (or its failure).
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const ACTIONS = read("lib/journal/actions.ts");
const COMPOSER = read("components/app/journal-entry-composer.tsx");
const PIPELINE = read("lib/journal/skill-pipeline.ts");
const REPROCESS = read("lib/journal/skill-pipeline-actions.ts");
const ENTRY_ROW = read("components/app/journal-entry-row.tsx");

describe("P0 Track B — canonical journal skill pipeline", () => {
  it("save actions AWAIT the server-side pipeline", () => {
    expect(ACTIONS).toMatch(/await processJournalEntrySkills/);
    // both save paths attach the pipeline result to the ok-variant
    expect(ACTIONS).toMatch(/skills:\s*JournalSkillPipelineResult/);
    // a pipeline throw degrades honestly, never failing the persisted save
    expect(ACTIONS).toMatch(/failedPipelineResult\(\)/);
  });

  it("composer contains NO client-side fire-and-forget recognition call", () => {
    expect(COMPOSER).not.toMatch(/void autoLinkRecognizedJournalSkills/);
    expect(COMPOSER).not.toMatch(/autoLinkRecognizedJournalSkills/);
  });

  it("composer ships the rejected slugs with the save (no-trace guarantee)", () => {
    expect(COMPOSER).toMatch(/rejected_slugs_json/);
    expect(ACTIONS).toMatch(/rejected_slugs_json/);
    expect(ACTIONS).toMatch(/excludeSlugs:\s*rejectedSlugs/);
  });

  it("pipeline can never write fake verification", () => {
    expect(PIPELINE).not.toMatch(/verified:\s*true/);
    expect(PIPELINE).not.toMatch(/ai_extracted/);
    expect(PIPELINE).not.toMatch(/manager_confirmed/);
    // the honest new-skill payload is pinned
    expect(PIPELINE).toMatch(/verified:\s*false/);
    expect(PIPELINE).toMatch(/source:\s*"self_declared"/);
    expect(PIPELINE).toMatch(/confidence_bin:\s*"yellow"/);
  });

  it("pipeline uses the caller-scoped client, never the admin client", () => {
    expect(PIPELINE).toMatch(
      /import \{ createClient \} from "@\/lib\/supabase\/server"/,
    );
    expect(PIPELINE).not.toMatch(/service_role|service-role|createAdminClient/i);
  });

  it("idempotent reprocess action exists and refuses dead entries", () => {
    expect(REPROCESS).toMatch(/export async function reprocessJournalEntrySkills/);
    expect(REPROCESS).toMatch(/processJournalEntrySkills/);
    expect(REPROCESS).toMatch(/entry_superseded/);
    expect(REPROCESS).toMatch(/entry_deleted/);
  });

  it("composer renders the honest pipeline result (and its failure line)", () => {
    expect(COMPOSER).toMatch(/data-testid="journal-pipeline-result"/);
    expect(COMPOSER).toMatch(/data-testid="journal-pipeline-failed"/);
    expect(COMPOSER).toMatch(/savedPipeline/);
  });

  it("entry row offers the reprocess recovery path", () => {
    expect(ENTRY_ROW).toMatch(/reprocessJournalEntrySkills/);
    expect(ENTRY_ROW).toMatch(/reprocessEntry/);
  });
});

describe("P1 recall repair — lists not counts, confirmable candidates", () => {
  it("pipeline result carries the candidate/rejected LISTS (nothing silently dropped)", () => {
    expect(PIPELINE).toMatch(/addedSkills:\s*\{ slug: string \}\[\]/);
    expect(PIPELINE).toMatch(/strengthenedSkills:\s*\{ slug: string \}\[\]/);
    expect(PIPELINE).toMatch(/candidates:\s*JournalPipelineCandidate\[\]/);
    expect(PIPELINE).toMatch(/rejected:\s*JournalPipelineRejected\[\]/);
    expect(PIPELINE).toMatch(/"fuzzy_skill"\s*\|\s*"ambiguous"\s*\|\s*"claim"/);
    expect(PIPELINE).toMatch(/"user_rejected"\s*\|\s*"inactive_skill"/);
  });

  it("ambiguous phrasings ride the EXISTING clarification lane, never worker_skills", () => {
    // The pipeline consumes the curated ambiguous extractor…
    expect(PIPELINE).toMatch(/extractAmbiguousCandidates/);
    // …and persists through skill_candidate_clarifications (canonical lane,
    // migration 20260609160000) — no parallel candidate structure.
    expect(PIPELINE).toMatch(/skill_candidate_clarifications/);
    // The ONLY worker_skills insert path is the strong-recognition toAdd set
    // (behavioural guard lives in skill-pipeline.test.ts: an ambiguous
    // candidate never produces a worker_skills write).
    const workerSkillWrites = PIPELINE.match(/from\("worker_skills"\)\.upsert/g);
    expect(workerSkillWrites).toHaveLength(1);
    // The ambiguous section itself never touches worker_skills.
    const ambiguousSection = PIPELINE.slice(
      PIPELINE.indexOf("6b. Ambiguous"),
      PIPELINE.indexOf("── 7."),
    );
    expect(ambiguousSection.length).toBeGreaterThan(0);
    expect(ambiguousSection).not.toMatch(/from\("worker_skills"\)/);
  });

  it("composer renders the four per-category result groups with one-tap actions", () => {
    expect(COMPOSER).toMatch(/data-testid="journal-pipeline-groups"/);
    expect(COMPOSER).toMatch(/t\("resultDetected"\)/);
    expect(COMPOSER).toMatch(/t\("resultAutoAdded"\)/);
    expect(COMPOSER).toMatch(/t\("resultNeedsConfirm"\)/);
    expect(COMPOSER).toMatch(/t\("resultRejected"\)/);
    expect(COMPOSER).toMatch(/data-testid="journal-candidate-chip"/);
    expect(COMPOSER).toMatch(/data-testid="journal-candidate-confirm"/);
    expect(COMPOSER).toMatch(/data-testid="journal-candidate-reject"/);
    expect(COMPOSER).toMatch(/data-testid="journal-rejected-line"/);
  });

  it("candidate confirm goes through the honest self-declared lane only", () => {
    const ACTIONS_FILE = read("lib/journal/skill-pipeline-actions.ts");
    expect(ACTIONS_FILE).toMatch(/export async function confirmJournalSkillCandidate/);
    expect(ACTIONS_FILE).toMatch(/verified:\s*false/);
    expect(ACTIONS_FILE).toMatch(/source:\s*"self_declared"/);
    expect(ACTIONS_FILE).toMatch(/confidence_bin:\s*"yellow"/);
    expect(ACTIONS_FILE).not.toMatch(/verified:\s*true/);
    expect(ACTIONS_FILE).not.toMatch(/manager_confirmed/);
    // Claim rejection is APPEND-ONLY (doctrine §3): a marker row, never an
    // update/delete on the journal metric lane.
    expect(ACTIONS_FILE).toMatch(/skill_claim_rejected/);
    expect(ACTIONS_FILE).not.toMatch(
      /from\("journal_entry_metrics"\)\s*\.\s*delete/,
    );
  });

  it("the i18n keys for the four groups exist in every journal.json locale", () => {
    const locales = [
      "da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv",
    ];
    for (const loc of locales) {
      const j = JSON.parse(
        read(`messages/${loc}/journal.json`),
      ) as Record<string, string>;
      for (const key of [
        "resultDetected",
        "resultAutoAdded",
        "resultNeedsConfirm",
        "resultRejected",
        "candidateConfirm",
        "candidateReject",
        "rejectedReasonUser",
        "rejectedReasonInactive",
      ]) {
        expect(typeof j[key], `${loc}.${key}`).toBe("string");
      }
    }
  });
});
