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
