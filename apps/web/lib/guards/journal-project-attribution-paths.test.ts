import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVE-PATH INVENTORY GUARD (handoff 2026-10-02 §2).
 *
 * Every real journal creation path funnels into `createJournalEntryCore`, and
 * the project-attribution rule must hold on each of them — one shared
 * contract (lib/journal/project-attribution), not four project-picking
 * implementations:
 *
 *   path                          asks?  how
 *   ----------------------------  -----  ---------------------------------
 *   journal composer (full form)  yes    JournalEntryComposer picker
 *   quick-record / chat / voice   yes    WorkerWorkLogFlow picker (voice
 *                                        hands its text to the chat flow)
 *   document draft                yes    DocumentJournalDraftForm picker
 *   MCP / capability registry     n/a    typed `project_required` refusal
 *   edit / supersede              n/a    copies the entry's own project
 *
 * The write core is the net under all of them: no project named + 2+ active
 * projects in the entry's organization => refused, never saved with NULL.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("journal project attribution — every creation path", () => {
  it("the write core refuses an unattributed save when 2+ projects are active", () => {
    const core = read("lib/journal/journal-write-core.ts");
    expect(core).toMatch(/code: "project_required"/);
    expect(core).toMatch(/projectPromptFor\(projects\) === "ask"/);
    expect(core).toMatch(/rpcProjectParams\(projectChoice\)/);
  });

  it("the composer, the work-log flow and the document draft all ask via the shared module", () => {
    for (const f of [
      "components/app/journal-entry-composer.tsx",
      "components/app/conversation/worker-worklog-flow.tsx",
      "components/app/document-journal-draft-form.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/@\/lib\/journal\/project-attribution"/);
      expect(src, f).toMatch(/projectChoiceIsSatisfied/);
      expect(src, f).toMatch(/PROJECT_FIELD_NONE/);
    }
  });

  it("the chat action carries the choice end to end (schema -> executor -> form field)", () => {
    expect(read("lib/conversation/worker-schemas.ts")).toMatch(/projectId: z\.union\(\[uuid, z\.literal\("none"\)\]\)/);
    expect(read("lib/conversation/worker-executors.ts")).toMatch(/project_id: input\.projectId \?\? ""/);
  });

  it("the engagement lister and the journal page read projects through the ONE reader", () => {
    expect(read("lib/conversation/worklog-engagements.ts")).toMatch(/readActiveProjectsByOrg/);
    expect(read("app/[locale]/dashboard/journal/page.tsx")).toMatch(/readActiveProjectsByOrg/);
  });

  it("no path guesses: the RPC only receives an explicit project the person chose", () => {
    const core = read("lib/journal/journal-write-core.ts");
    expect(core).not.toMatch(/p_project_id:\s*projects\[0\]/);
  });
});
