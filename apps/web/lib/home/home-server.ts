import "server-only";

import { cache } from "react";

import { readMyNotificationEvents, type NotificationEventRow } from "@/lib/notifications/events";
import { listWorkerProjectsResult } from "@/lib/projects/worker-project-access";
import { createClient } from "@/lib/supabase/server";
import {
  deriveTodayGrowth,
  deriveTodayNext,
  deriveTodayOpenItems,
  deriveTodayOpportunity,
  deriveTodayWork,
  unknownTodayDoors,
} from "@/lib/today/today-model";
import {
  loadTodayAttention,
  loadTodayGrowth,
  loadTodayHead,
  loadTodayOpportunities,
  loadTodayWorkIntelligence,
} from "@/lib/today/today-server";

import { deriveBecause, deriveOutside, deriveRunning, deriveWaiting, type HomeProject } from "./home-state";

/**
 * THE HOME LOADER — the PERSON's four-state home, read through the readers
 * that already answer each question. Nothing here is a new source of truth:
 *
 *   next action / work / growth / doors / opportunities
 *       ← the request-cached ŠIANDIEN readers (`lib/today/today-server.ts`)
 *   assigned projects  ← `listWorkerProjectsResult` (own assignments)
 *   what happened      ← `readMyNotificationEvents` (own notification rows)
 *
 * Authorization is the caller's own session throughout: every read goes
 * through `createClient()` (RLS as the signed-in user). There is NO service
 * role, NO admin client and NO privileged read on this path — another
 * identity's home cannot be read, because no reader here takes an identity
 * argument.
 *
 * Failure semantics (SEP-7): a reader that throws or reports itself
 * unavailable yields `null` — the model renders that as UNKNOWN. An empty
 * real result stays an empty array — the model renders that as EMPTY. The
 * two are never merged here.
 */

/** The notification window the home reads. The activity centre keeps the
 *  complete list; the home only needs the freshest facts. */
export const HOME_EVENTS_WINDOW = 20;

export const loadHomeProjects = cache(async (): Promise<readonly HomeProject[] | null> => {
  try {
    const result = await listWorkerProjectsResult();
    if (result.status !== "ok") return null;
    return result.rows
      .filter((row) => row.assignmentStatus === "active")
      .map((row) => ({ projectId: row.projectId, title: row.title, city: row.city }));
  } catch {
    return null;
  }
});

export const loadHomeEvents = cache(async (): Promise<readonly NotificationEventRow[] | null> => {
  try {
    const supabase = await createClient();
    const feed = await readMyNotificationEvents(supabase, HOME_EVENTS_WINDOW);
    return feed.kind === "ready" ? feed.events : null;
  } catch {
    return null;
  }
});

/**
 * One loader PER REGION, so each region streams on its own and a slow
 * journal never holds the rest of the home back (owner walk 2026-09-28:
 * "login has become slow"). Each is request-cached and composed from the
 * same request-cached ŠIANDIEN readers, so no reader runs twice.
 */
export const loadHomeWaiting = cache(async () => {
  const [head, workIntelligence, attention] = await Promise.all([
    loadTodayHead(),
    loadTodayWorkIntelligence(),
    loadTodayAttention(),
  ]);
  return {
    region: deriveWaiting(deriveTodayNext(head.workCard), deriveTodayOpenItems(workIntelligence, attention)),
    /** Which door counters could not be read — named, never rendered as 0. */
    unknownDoors: unknownTodayDoors(attention),
  };
});

export const loadHomeRunning = cache(async () => {
  const [workIntelligence, growth, projects] = await Promise.all([
    loadTodayWorkIntelligence(),
    loadTodayGrowth(),
    loadHomeProjects(),
  ]);
  return deriveRunning(deriveTodayWork(workIntelligence), projects, deriveTodayGrowth(growth));
});

export const loadHomeBecause = cache(async () => deriveBecause(await loadHomeEvents()));

export const loadHomeOutside = cache(async () =>
  deriveOutside(deriveTodayOpportunity(await loadTodayOpportunities())),
);
