import "server-only";

import { cache } from "react";

import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";
import { readConfirmedWorkBySkill } from "@/lib/evidence/confirmed-work-read";
import { TRACE_WINDOW_DAYS } from "@/lib/home/consequence-trace-server";
import { readEntrySkillSlugs } from "@/lib/journal/entry-skill-link-read";
import {
  JOURNAL_ENTRY_CONFIRMATIONS_EMBED,
  listJournalEntries,
  liveJournalEntriesOnly,
} from "@/lib/journal/journal-list-core";
import { deriveIndependentReviewResult, type ConfirmationRow } from "@/lib/journal/review-status";
import type { ProjectStagesData } from "@/lib/projects/stages-model";
import { createClient } from "@/lib/supabase/server";
import type { MyTasksResult } from "@/lib/tasks/task-model";

import { deriveProjectTrace, type ProjectTrace, type ProjectTraceEntry } from "./project-trace";

/** How many of the project's entries the manager's count reads (newest). */
export const PROJECT_TRACE_TEAM_WINDOW = 200;
/** How many of the member's own project entries are walked. */
export const PROJECT_TRACE_OWN_WINDOW = 30;

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE PROJECT TRACE LOADER — the caller's own session (`createClient()`, RLS
 * as the signed-in user), no service role, no writes. The stages and tasks
 * are the SAME reads the course and the week goal already made on this page
 * (passed in, never read twice).
 *
 *   manager  the project's entries the manager's RLS returns → COUNTS only
 *            (`deriveProjectTrace` keeps no row, no text, no name)
 *   member   the viewer's OWN entries on this project (`listJournalEntries`
 *            with `projectId`) → their own chains, the same walk as the home
 */
export const loadProjectTrace = cache(
  async (
    projectId: string,
    audience: "manager" | "member",
    stages: ProjectStagesData | null,
    tasks: MyTasksResult | null,
  ): Promise<ProjectTrace> => {
    const sinceIso = new Date(Date.now() - TRACE_WINDOW_DAYS * 86_400_000).toISOString();
    const taskRows = tasks && tasks.status === "ok" && tasks.error === null ? tasks.tasks : null;

    let entries: ProjectTraceEntry[] | null = null;
    let entriesTruncated = false;
    let viewerWorkerId: string | null = null;
    let viewerProfileId: string | null = null;
    let workerProfiles: Map<string, string> | null = null;
    let skillLinks: Map<string, string[]> | null = new Map();
    let confirmedWork: ReadonlyMap<string, { confirmedWorkEntries: number; confirmedDays: number }> | null =
      new Map();

    if (UUID_RX.test(projectId)) {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && audience === "manager") {
          const res = await liveJournalEntriesOnly(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from("journal_entries")
              .select(`id, worker_id, created_at, ${JOURNAL_ENTRY_CONFIRMATIONS_EMBED}`)
              .eq("project_id", projectId),
          )
            .gte("created_at", sinceIso)
            .order("created_at", { ascending: false })
            .limit(PROJECT_TRACE_TEAM_WINDOW);
          if (!res.error) {
            const rows = (res.data ?? []) as {
              id: string;
              worker_id: string;
              created_at: string;
              journal_entry_confirmations: ConfirmationRow[] | null;
            }[];
            entriesTruncated = rows.length >= PROJECT_TRACE_TEAM_WINDOW;
            entries = rows.map((r) => ({
              id: r.id,
              workerId: r.worker_id,
              createdAt: r.created_at,
              originalText: null,
              metrics: null,
              confirmations: r.journal_entry_confirmations ?? null,
            }));
            const ids = [...new Set(rows.map((r) => r.worker_id))];
            if (ids.length === 0) {
              workerProfiles = new Map();
            } else {
              const w = await supabase.from("workers").select("id, profile_id").in("id", ids);
              if (!w.error) {
                workerProfiles = new Map();
                for (const row of (w.data ?? []) as { id: string; profile_id: string | null }[]) {
                  if (row.profile_id) workerProfiles.set(row.id, row.profile_id);
                }
              }
            }
          }
        } else if (user) {
          const caller: DomainCaller = { supabase, userId: user.id };
          const worker = await readWorkerCoreRow(caller);
          if (worker.ok && !worker.value) {
            entries = [];
          } else if (worker.ok && worker.value) {
            viewerWorkerId = worker.value.id;
            viewerProfileId = worker.value.profile_id ?? user.id;
            const list = await listJournalEntries(caller, {
              workerId: viewerWorkerId,
              limit: PROJECT_TRACE_OWN_WINDOW,
              projectId,
            });
            if (list.ok) {
              entriesTruncated = list.coverage.truncated;
              const own = viewerWorkerId;
              entries = list.entries.map((e) => ({
                id: e.id,
                workerId: own,
                createdAt: e.created_at,
                originalText: e.original_text,
                metrics: e.journal_entry_metrics ?? [],
                confirmations: e.journal_entry_confirmations ?? null,
              }));
              const confirmedIds = entries
                .filter((e) => deriveIndependentReviewResult(e.confirmations, viewerProfileId) === "approved")
                .map((e) => e.id);
              if (confirmedIds.length > 0) {
                const [links, work] = await Promise.all([
                  readEntrySkillSlugs(supabase, confirmedIds),
                  readConfirmedWorkBySkill(supabase, [{ id: own, profileId: viewerProfileId }]),
                ]);
                skillLinks = links;
                confirmedWork = work ? (work.get(own) ?? new Map()) : null;
              }
            }
          }
        }
      } catch {
        entries = null;
      }
    }

    return deriveProjectTrace({
      audience,
      entries,
      entriesTruncated,
      viewerWorkerId,
      viewerProfileId,
      workerProfiles,
      skillLinks,
      confirmedWork,
      stages,
      tasks: taskRows,
      sinceIso,
    });
  },
);
