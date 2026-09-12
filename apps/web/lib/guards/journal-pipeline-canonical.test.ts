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
// The create write moved into the transport-neutral core (owner-approved
// extraction 2026-08-29 §6); the pipeline pins follow the implementation.
const WRITE_CORE = read("lib/journal/journal-write-core.ts");
const COMPOSER = read("components/app/journal-entry-composer.tsx");
const PIPELINE = read("lib/journal/skill-pipeline.ts");
const REPROCESS = read("lib/journal/skill-pipeline-actions.ts");
const ENTRY_ROW = read("components/app/journal-entry-row.tsx");
const RECOGNITION = read("lib/journal/journal-recognition.ts");
const FRAGMENTER = read("lib/structuring/journal-fragmenter.ts");

describe("P0 Track B — canonical journal skill pipeline", () => {
  it("save actions AWAIT the server-side pipeline", () => {
    // The CREATE path lives in the write core; the SUPERSEDE path stays in
    // actions.ts — both must run the awaited canonical pipeline (the shared
    // runSkillPipeline helper wraps exactly `await processJournalEntrySkills`).
    expect(WRITE_CORE).toMatch(/await processJournalEntrySkills/);
    expect(WRITE_CORE).toMatch(/skills:\s*JournalSkillPipelineResult/);
    expect(ACTIONS).toMatch(/await runSkillPipeline/);
    // a pipeline throw degrades honestly, never failing the persisted save
    expect(WRITE_CORE).toMatch(/failedPipelineResult\(\)/);
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
    // Pipeline v2: the ONE derivation module consumes the curated ambiguous
    // extractor, and the pipeline persists ONLY from the derivation result…
    expect(RECOGNITION).toMatch(/extractAmbiguousCandidates/);
    expect(PIPELINE).toMatch(/deriveJournalRecognition/);
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

describe("Universal Journal Recall v2 — fragment pipeline source guards", () => {
  it("the fragmenter + derivation modules are PURE (no IO, no supabase)", () => {
    for (const src of [FRAGMENTER, RECOGNITION]) {
      expect(src).not.toMatch(/@\/lib\/supabase/);
      expect(src).not.toMatch(/createClient/);
      expect(src).not.toMatch(/"use server"/);
      expect(src).not.toMatch(/node:crypto/);
    }
    expect(FRAGMENTER).toMatch(/export function fragmentJournalText/);
    expect(RECOGNITION).toMatch(/export function deriveJournalRecognition/);
    expect(RECOGNITION).toMatch(/JOURNAL_PIPELINE_VERSION = 2/);
  });

  it("the pipeline persists ONLY from the derivation result (one source of truth)", () => {
    expect(PIPELINE).toMatch(/deriveJournalRecognition/);
    // the pipeline never runs its own recognition lanes
    expect(PIPELINE).not.toMatch(/recognizeSkills\(/);
    expect(PIPELINE).not.toMatch(/extractJournalSuggestions/);
    expect(PIPELINE).not.toMatch(/extractProfileSkillClaims/);
    // legacy counts are DERIVED from the lists — never hand-maintained
    expect(PIPELINE).toMatch(/summarizeJournalPipelineResult/);
    // the full recognition object is embedded in the result
    expect(PIPELINE).toMatch(/recognition:\s*JournalRecognitionResult/);
  });

  it("unresolved fragments + pipeline version ride the append-only metric lane", () => {
    expect(PIPELINE).toMatch(/unresolved_fragment/);
    expect(PIPELINE).toMatch(/unresolved_dismissed/);
    expect(PIPELINE).toMatch(/pipeline_version/);
    expect(PIPELINE).toMatch(/skill_rejected/);
    // never update/delete on the metric lane (doctrine §3)
    expect(PIPELINE).not.toMatch(/from\("journal_entry_metrics"\)\s*\.\s*delete/);
    expect(PIPELINE).not.toMatch(/from\("journal_entry_metrics"\)\s*\.\s*update/);
  });

  it("server trust boundary: re-derivation + membership + version check, no client trust", () => {
    expect(REPROCESS).toMatch(/deriveJournalRecognition/);
    expect(REPROCESS).toMatch(/candidate_not_found/);
    expect(REPROCESS).toMatch(/JOURNAL_PIPELINE_VERSION/);
    expect(REPROCESS).toMatch(/export async function confirmJournalAmbiguousChoice/);
    expect(REPROCESS).toMatch(/export async function nameUnresolvedFragment/);
    expect(REPROCESS).toMatch(/export async function dismissUnresolvedFragment/);
    expect(REPROCESS).toMatch(/export async function rejectJournalSkillCandidate/);
    expect(REPROCESS).toMatch(/export async function searchTaxonomySkills/);
    // rejections are ENTRY-scoped append-only markers
    expect(REPROCESS).toMatch(/unresolved_dismissed|unresolvedDismissed/);
    expect(REPROCESS).not.toMatch(/from\("journal_entry_metrics"\)\s*\.\s*delete/);
  });

  it("composer renders the five recognition groups from the ONE result", () => {
    expect(COMPOSER).toMatch(/data-testid="journal-group-recognized"/);
    expect(COMPOSER).toMatch(/data-testid="journal-group-choice"/);
    expect(COMPOSER).toMatch(/data-testid="journal-group-claims"/);
    expect(COMPOSER).toMatch(/data-testid="journal-group-unresolved"/);
    expect(COMPOSER).toMatch(/data-testid="journal-group-rejected"/);
    expect(COMPOSER).toMatch(/data-testid="journal-unresolved-chip"/);
    expect(COMPOSER).toMatch(/data-testid="journal-ambiguous-choice"/);
    // summary line comes from the ONE pure summary rule
    expect(COMPOSER).toMatch(/summarizeJournalPipelineResult/);
    // every candidate action ships the pipeline version (trust boundary)
    expect(COMPOSER).toMatch(/savedPipelineVersion/);
  });

  it("the new v2 i18n keys exist in every journal.json locale", () => {
    const locales = [
      "da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv",
    ];
    for (const loc of locales) {
      const j = JSON.parse(
        read(`messages/${loc}/journal.json`),
      ) as Record<string, string>;
      for (const key of [
        "groupRecognized",
        "groupChoice",
        "groupClaims",
        "groupUnresolved",
        "ambiguousOther",
        "ambiguousOtherPlaceholder",
        "ambiguousOtherSave",
        "unresolvedHint",
        "unresolvedSearchPlaceholder",
        "unresolvedClaimPlaceholder",
        "unresolvedSaveClaim",
        "unresolvedSkip",
        "unresolvedSkipped",
        "unresolvedSaved",
      ]) {
        expect(typeof j[key], `${loc}.${key}`).toBe("string");
      }
    }
  });

  it("silent-trust wording ban: the new group actions never say Patvirtinti", () => {
    const lt = JSON.parse(read("messages/lt/journal.json")) as Record<
      string,
      string
    >;
    for (const key of [
      "candidateConfirm",
      "ambiguousOtherSave",
      "unresolvedSaveClaim",
      "unresolvedSkip",
    ]) {
      expect(lt[key].toLowerCase()).not.toContain("patvirtin");
    }
  });

  it("lifecycle: restore + journal page heal re-enter the pipeline", () => {
    expect(ACTIONS).toMatch(/journal_entry_restore/);
    // restore path runs the pipeline for the restored entry
    const restoreSection = ACTIONS.slice(ACTIONS.indexOf("journal_entry_restore"));
    expect(restoreSection).toMatch(/runSkillPipeline/);
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(/JOURNAL_PIPELINE_VERSION/);
    expect(page).toMatch(/processJournalEntrySkills/);
    expect(page).toMatch(/\.slice\(0, 5\)/); // bounded per request
  });
});

describe("catalogue OFFER per fragment (#1689) — lane 4b rides the ONE candidate lane", () => {
  const WORKLOG_FLOW = read("components/app/conversation/worker-worklog-flow.tsx");
  const EXECUTORS = read("lib/conversation/worker-executors.ts");

  it("the derivation consults the intake side's catalogue (no second lexicon) only for a fragment nothing read", () => {
    expect(RECOGNITION).toMatch(
      /import \{ recognizeNewSkillSuggestions \} from "@\/lib\/structuring\/new-skill-suggestions"/,
    );
    // gated on an EMPTY outcome list — the tier-2 rule at fragment grain
    // (and never for an item that only says WHERE under a header, whose
    // own lanes are skipped so lane 4c can hand it the header's readings)
    expect(RECOGNITION).toMatch(
      /if \(outcomes\.length === 0 && !describesWhere\) \{\s*for \(const s of recognizeNewSkillSuggestions\(f\.text\)\)/,
    );
    // an offer, never a reading: the catalogue result feeds the fuzzy
    // candidate map, never the recognized map
    const lane = RECOGNITION.slice(
      RECOGNITION.indexOf("Lane 4b"),
      RECOGNITION.indexOf("Lane 5"),
    );
    expect(lane).toMatch(/fuzzyMap\.set\(s\.slug/);
    expect(lane).not.toMatch(/recognizedMap\.set/);
    // the declared set is NOT passed: declared or not, a weak needle asks
    expect(lane).not.toMatch(/recognizeNewSkillSuggestions\(f\.text,\s*declaredSlugs/);
    // the worker's rejection stays visible on the fragment
    expect(lane).toMatch(/pushRejected\("skill", s\.slug, s\.slug, "user_rejected", f\.id\)/);
  });

  it("the chat's done card decides the offer through the SAME server actions the composer uses", () => {
    expect(WORKLOG_FLOW).toMatch(
      /import \{\s*confirmJournalSkillCandidate,\s*rejectJournalSkillCandidate,\s*\} from "@\/lib\/journal\/skill-pipeline-actions"/,
    );
    // only a taxonomy offer is decidable here; ambiguous readings keep
    // their curated choices in the journal
    expect(WORKLOG_FLOW).toMatch(/c\.kind === "fuzzy_skill" &&/);
    expect(WORKLOG_FLOW).toMatch(/testId="worklog-candidate-confirm"/);
    expect(WORKLOG_FLOW).toMatch(/testId="worklog-candidate-reject"/);
    // the decision carries the derivation version the server refuses when
    // stale — read through from the awaited pipeline result, never assumed
    expect(EXECUTORS).toMatch(/pipelineVersion: r\.skills\.recognition\.pipelineVersion/);
    expect(WORKLOG_FLOW).not.toMatch(/JOURNAL_PIPELINE_VERSION/);
    // the copy is the composer's own (journal.candidate*) — no second wording
    for (const key of [
      "candidateConfirm",
      "candidateConfirming",
      "candidateReject",
      "candidateConfirmed",
      "candidateRejected",
      "candidateError",
    ]) {
      expect(WORKLOG_FLOW).toContain(`tCandidate("${key}")`);
    }
    // never a fake result: the state shown is the RETURNED result
    expect(WORKLOG_FLOW).toMatch(/\[slug\]: res\.ok\s*\?/);
  });
});

describe("the stated total (#1689) — lane 4c reads the extractor's ONE rule, never re-implements it", () => {
  const EXTRACTOR = read("lib/structuring/extract-journal-suggestions.ts");

  it("the derivation asks the extractor which phrase is the total (one rule, two grains)", () => {
    expect(RECOGNITION).toMatch(
      /import \{\s*describesWhereOnly,\s*extractJournalSuggestions,\s*\} from "@\/lib\/structuring\/extract-journal-suggestions"/,
    );
    expect(RECOGNITION).toMatch(/extractJournalSuggestions\(text \?\? ""\)/);
    expect(RECOGNITION).toMatch(/statedTotal\.statedTotal!\.rawPhrase/);
    // the rule itself lives in ONE place
    expect(EXTRACTOR).toMatch(/function separateStatedTotal\(/);
    expect(RECOGNITION).not.toMatch(/function separateStatedTotal/);
    expect(RECOGNITION).not.toMatch(/ITEMISING_COLON/);
  });

  it("an item that says only WHERE is decided by the extractor's ONE rule on both sides (#1689, measured 2026-09-12)", () => {
    // the rule lives in the extractor and is exported once
    expect(EXTRACTOR).toMatch(/export function describesWhereOnly\(phrase: string\): boolean/);
    // the extractor's inheritance reads it beside the no-activity rule
    expect(EXTRACTOR).toMatch(/noActivity\(f\) \|\| describesWhereOnly\(f\.rawPhrase\)/);
    // the recognition side reads it — never a second place grammar
    expect(RECOGNITION).toMatch(/describesWhereOnly\(f\.text\)/);
    expect(RECOGNITION).not.toMatch(/function describesWhereOnly/);
    expect(RECOGNITION).not.toMatch(/LT_PLACE_PREPOSITION|LT_VERB_ENDING|endsWith\("e"\)/);
    // gated on a header that NAMED work (a rejected reading counts) and on
    // the item being one of the extractor's timed items — never on a bare
    // place item with no header, whose place is the only signal
    expect(RECOGNITION).toMatch(
      /const describesWhere =\s*headerIndex >= 0 &&\s*index > headerIndex &&\s*headerNamedWork &&\s*timedItemKeys\.has\(phraseKey\(f\.text\)\) &&\s*describesWhereOnly\(f\.text\)/,
    );
    expect(RECOGNITION).toMatch(/headerNamedWork = outcomes\.length > 0/);
    // every own lane yields to it: taxonomy, ambiguity, claims, the offer
    expect(RECOGNITION).toMatch(/for \(const r of describesWhere \? \[\] : recognizeSkills\(f\.text, 8\)\)/);
    expect(RECOGNITION).toMatch(/for \(const a of describesWhere \? \[\] : extractAmbiguousCandidates\(f\.text\)\)/);
    expect(RECOGNITION).toMatch(/for \(const c of describesWhere \? \[\] : extractProfileSkillClaims\(f\.text\)\)/);
    // the rule is structural: the function body names no place word
    const start = EXTRACTOR.indexOf("export function describesWhereOnly(");
    const body = EXTRACTOR.slice(start, EXTRACTOR.indexOf("return true;", start));
    expect(body).not.toMatch(/virtuv|kitchen|sandėl|warehouse|kuch|keuken|küche/i);
  });

  it("the header is marked as the total and inheritance is provenance only (never a new reading)", () => {
    const lane = RECOGNITION.slice(
      RECOGNITION.indexOf("Lane 4c"),
      RECOGNITION.indexOf("Lane 5"),
    );
    expect(lane).toMatch(/outcomes\.push\(\{ kind: "stated_total", ref: f\.id \}\)/);
    // only a TIMED item nothing read inherits, after the header
    expect(lane).toMatch(/outcomes\.length === 0 &&/);
    expect(lane).toMatch(/index > headerIndex/);
    expect(lane).toMatch(/timedItemKeys\.has\(phraseKey\(f\.text\)\)/);
    // inheritance adds the item's id to the header's OWN entries
    expect(lane).toMatch(/entry\.fragmentIds\.add\(f\.id\)/);
    expect(lane).not.toMatch(/recognizedMap\.set|fuzzyMap\.set|ambiguousMap\.set|claimMap\.set/);
    // a rejected header reading is never passed down
    expect(RECOGNITION).toMatch(
      /headerOutcomes = outcomes\.filter\(\s*\(o\) => o\.kind !== "rejected" && o\.kind !== "unresolved",\s*\)/,
    );
    // the outcome kind exists in the closed set
    expect(RECOGNITION).toMatch(/\| "stated_total"/);
  });
});
