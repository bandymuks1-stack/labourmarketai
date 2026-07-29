import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NEXT_BEST_ACTION_LIMIT,
  buildWorkContext,
  deriveNextBestActions,
} from "@/lib/conversation/context-intelligence";
import {
  planningMeta,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Context Intelligence Engine guards (rebuild phase 3).
 *
 * Pins the load-bearing decisions:
 *  1. CIE is a PURE layer over rows the canonical reads already returned —
 *     no IO, no LLM, no new store, no parallel structure.
 *  2. Every proactive suggestion traces to a REAL row (doctrine §7): empty
 *     data → zero suggestions; suggestions are capped and priority-ordered.
 *  3. Ambiguity is never guessed away: the active project resolves only on
 *     the EXACTLY-ONE rule (mirroring the canonical journal auto-link).
 *  4. The conversation has ONE work-context readback path (the brief), and
 *     the workspace resolves the work-log default context server-side.
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const TODAY = "2026-08-10"; // Monday
const TOMORROW = "2026-08-11";

function item(over: Partial<PlanningItem>): PlanningItem {
  return {
    id: `x:${Math.abs(JSON.stringify(over).length)}${over.id ?? ""}`,
    sourceType: "task",
    sourceId: "s",
    label: null,
    detail: null,
    startDate: TODAY,
    endDate: null,
    status: "open",
    statusKey: "tasks.status.open",
    href: "/dashboard/tasks",
    roleContext: "mine",
    ...planningMeta(),
    ...over,
  };
}

describe("CIE purity — a layer over existing reads, never a new system", () => {
  const src = read("lib/conversation/context-intelligence.ts");

  it("no IO, no supabase, no server-only, no LLM", () => {
    expect(src).not.toMatch(/@\/lib\/supabase|server-only|"use server"|\.from\(|\.rpc\(/);
    expect(src).not.toMatch(/runAiAgent|getAiRuntimeConfig|resolveAiRuntimeConfig/);
    // Composes the canonical calendar model only.
    expect(src).toMatch(/from "@\/lib\/planning\/planning-model"/);
  });

  it("the brief is the ONE conversation readback (agenda path folded in)", () => {
    const summary = read("lib/conversation/agenda-summary.ts");
    expect(summary).toMatch(/loadContextBrief/);
    expect(summary).not.toMatch(/export async function loadAgendaSummary/);
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/loadContextBrief/);
    expect(chat).not.toMatch(/loadAgendaSummary/);
  });
});

describe("CIE context — exactly-one rule, real rows only", () => {
  it("resolves the active project ONLY when exactly one assigned band covers today", () => {
    const assigned = (id: string): PlanningItem =>
      item({
        id: `project:${id}`,
        sourceType: "project",
        sourceId: id,
        roleContext: "assigned",
        startDate: "2026-08-01",
        endDate: "2026-08-30",
        status: "live",
      });
    expect(buildWorkContext([assigned("a")], TODAY).activeProject?.sourceId).toBe("a");
    // Two candidates → ambiguity → null (asked, never guessed).
    expect(buildWorkContext([assigned("a"), assigned("b")], TODAY).activeProject).toBeNull();
    // A managed band is not a personal context.
    expect(
      buildWorkContext(
        [{ ...assigned("a"), roleContext: "managed" }],
        TODAY,
      ).activeProject,
    ).toBeNull();
  });

  it("empty data yields an empty context and ZERO suggestions", () => {
    const ctx = buildWorkContext([], TODAY);
    expect(ctx.todayItems).toHaveLength(0);
    expect(ctx.nextDeadline).toBeNull();
    expect(deriveNextBestActions(ctx, TODAY)).toHaveLength(0);
  });
});

describe("CIE suggestions — rule-based, capped, priority-ordered", () => {
  const overdueTask = item({ id: "task:o", startDate: "2026-08-01" });
  const bookingToday = item({
    id: "booking:b",
    sourceType: "booking",
    sourceId: "b",
    status: "accepted",
    roleContext: "incoming",
    startDate: "2026-08-08",
    endDate: "2026-08-15",
    statusKey: "bookings.status.accepted",
  });
  const journalToday = item({
    id: "journal:j",
    sourceType: "journal",
    sourceId: "j",
    status: "recorded",
    statusKey: "planning.journalStatus.recorded",
  });
  const deadlineTomorrow = item({
    id: "task:d",
    sourceId: "d",
    startDate: TOMORROW,
    label: "Sąmata",
  });

  it("overdue tasks → the first suggestion, with the real count", () => {
    const ctx = buildWorkContext([overdueTask], TODAY);
    expect(deriveNextBestActions(ctx, TODAY)).toEqual([
      { kind: "overdue-tasks", count: 1 },
    ]);
  });

  it("working today without a journal entry → log-today; recorded → silent", () => {
    const withEntry = buildWorkContext([bookingToday, journalToday], TODAY);
    expect(
      deriveNextBestActions(withEntry, TODAY).some((a) => a.kind === "log-today"),
    ).toBe(false);
    const withoutEntry = buildWorkContext([bookingToday], TODAY);
    expect(
      deriveNextBestActions(withoutEntry, TODAY).some((a) => a.kind === "log-today"),
    ).toBe(true);
  });

  it("deadline tomorrow + (nearly) free tomorrow → reserve-tomorrow with the real label", () => {
    const ctx = buildWorkContext([deadlineTomorrow], TODAY);
    expect(deriveNextBestActions(ctx, TODAY)).toEqual([
      { kind: "reserve-tomorrow", day: TOMORROW, deadlineLabel: "Sąmata" },
    ]);
    // A BUSY tomorrow silences the recommendation (no advice against reality).
    const busy = [
      deadlineTomorrow,
      { ...bookingToday, id: "booking:b2" },
      item({ id: "task:t2", sourceId: "t2", startDate: TOMORROW }),
    ];
    expect(
      deriveNextBestActions(buildWorkContext(busy, TODAY), TODAY).some(
        (a) => a.kind === "reserve-tomorrow",
      ),
    ).toBe(false);
  });

  it(`never more than ${NEXT_BEST_ACTION_LIMIT} suggestions — assistance, not spam`, () => {
    const ctx = buildWorkContext([overdueTask, bookingToday, deadlineTomorrow], TODAY);
    const actions = deriveNextBestActions(ctx, TODAY);
    expect(actions.length).toBeLessThanOrEqual(NEXT_BEST_ACTION_LIMIT);
    // Priority order holds: overdue first.
    expect(actions[0].kind).toBe("overdue-tasks");
  });
});

describe("CIE integration — the workspace resolves defaults, the user re-picks only on ambiguity", () => {
  it("work-log engagements order ACTIVE-WORKSPACE-first, server-side", () => {
    const src = read("lib/conversation/worklog-engagements.ts");
    expect(src).toMatch(/getWorkspaceContext\("person"\)/);
    expect(src).toMatch(/organization_id/);
  });

  it("both work-log entry points default to the server-resolved FIRST context", () => {
    expect(read("components/app/conversation/worker-worklog-flow.tsx")).toMatch(
      /setEngagementId\(res\.engagements\[0\]\.id\)/,
    );
    expect(read("components/app/journal-entry-composer.tsx")).toMatch(
      /const primaryId = engagements\[0\]\?\.id \?\? ""/,
    );
    const journalPage = read("app/[locale]/dashboard/journal/page.tsx");
    expect(journalPage).toMatch(/getWorkspaceContext\("person"\)/);
  });

  it("the brief's suggestions render through EXISTING chip mechanisms only", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/id: "logwork"/);
    expect(chat).toMatch(/link:\/dashboard\/tasks/);
    expect(chat).toMatch(/link:\/dashboard\/planning\?view=day/);
  });

  it("today-phrases reach the work-context readback deterministically", () => {
    const router = read("lib/conversation/intent-router.ts");
    expect(router).toMatch(/šiandien\|today\|сегодня/);
  });
});
