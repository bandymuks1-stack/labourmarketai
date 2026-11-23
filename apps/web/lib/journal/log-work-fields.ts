import type { z } from "zod";

import type { workerLogWorkSchema } from "@/lib/conversation/worker-schemas";
import { intakeWorkTimeFields } from "@/lib/journal/intake-work-time";

/**
 * THE ONE FormData MAPPING for "log work": what the chat's `worker.log-work`
 * and the MCP `journal.confirm` both send to the canonical journal save
 * (`createJournalEntryCore`). There used to be two copies, line for line the
 * same except that the MCP one dropped the voice provenance — a dictated
 * entry from the phone was stored as typed (duplication audit AI-3). One
 * function, so a fact recorded by chat, phone or MCP lands on the journal,
 * projects and the Living CV exactly like one recorded on the web.
 *
 * The time stated in the words becomes time on the record (issue #1689):
 * the same deterministic parse the composer persists.
 *
 * Pure: no IO, no server-only.
 */
export function logWorkFields(
  locale: string,
  input: z.infer<typeof workerLogWorkSchema>,
): Record<string, string> {
  return {
    locale,
    engagement_context_id: input.engagementContextId,
    notes: input.notes,
    work_date: input.workDate,
    site_name: input.siteName ?? "",
    project_id: input.projectId ?? "",
    ...(input.voice
      ? {
          input_origin: "voice",
          voice_language: input.voice.language,
          voice_disclosure_version: input.voice.disclosureVersion,
        }
      : {}),
    ...intakeWorkTimeFields(input.notes, input.workDate),
  };
}
