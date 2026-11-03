import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import type { WorkTask } from "@/lib/tasks/task-model";

import { deriveWeeklyGoal, weekOf } from "./weekly-goal";

const state = vi.hoisted(() => ({ locale: "en" }));
const WEB = join(__dirname, "..", "..");
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) =>
    createTranslator({
      locale: state.locale,
      messages: JSON.parse(readFileSync(join(WEB, "messages", `${state.locale}.json`), "utf8")),
      namespace: ns as never,
      onError: () => {},
      getMessageFallback: ({ key }) => `MISSING:${ns}.${key}`,
    }),
  ),
}));
import { ProjectWeekGoal } from "@/components/app/projects/project-week-goal";

// Wednesday 2026-10-14 → week Mon 2026-10-12 … Sun 2026-10-18.
const TODAY = "2026-10-14";
const task = (p: Partial<WorkTask> & { id: string }): WorkTask => ({
  projectId: "p",
  objectId: null,
  stageId: null,
  parentTaskId: null,
  title: p.id,
  description: null,
  status: "todo",
  priority: "normal" as WorkTask["priority"],
  assigneeProfileId: null,
  createdBy: "u",
  dueAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  resolvedAt: null,
  ...p,
});
const ok = (tasks: WorkTask[]) => ({ status: "ok" as const, tasks, error: null });

describe("weekly goal — the project's real tasks due this week", () => {
  it("week is Monday..Sunday of the viewer's day", () => {
    expect(weekOf(TODAY)).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekOf("2026-10-18")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekOf("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
  });

  it("only tasks DUE this week; undated tasks never join; cancelled ones do not count", () => {
    const g = deriveWeeklyGoal(
      ok([
        task({ id: "a", dueAt: "2026-10-12T10:00:00Z", status: "done" }),
        task({ id: "b", dueAt: "2026-10-16T10:00:00Z", status: "in_progress" }),
        task({ id: "c", dueAt: "2026-10-18T23:00:00Z", status: "cancelled" }),
        task({ id: "next", dueAt: "2026-10-19T10:00:00Z" }),
        task({ id: "last", dueAt: "2026-10-11T10:00:00Z" }),
        task({ id: "undated" }),
      ]),
      { todayIso: TODAY, scope: "project" },
    );
    if (g.kind !== "known") throw new Error("known");
    expect(g.tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(g.done).toBe(1);
    expect(g.total).toBe(2);
  });

  it("an open task due before today is overdue; done never is", () => {
    const g = deriveWeeklyGoal(
      ok([
        task({ id: "late", dueAt: "2026-10-13T10:00:00Z", status: "todo" }),
        task({ id: "doneLate", dueAt: "2026-10-12T10:00:00Z", status: "done" }),
      ]),
      { todayIso: TODAY, scope: "project" },
    );
    if (g.kind !== "known") throw new Error("known");
    expect(g.tasks.find((t) => t.id === "late")!.overdue).toBe(true);
    expect(g.tasks.find((t) => t.id === "doneLate")!.overdue).toBe(false);
  });

  it("no task this week → NONE (no invented goal); failed or signed-out read → UNKNOWN; missing feature → NONE", () => {
    expect(deriveWeeklyGoal(ok([task({ id: "x" })]), { todayIso: TODAY, scope: "project" })).toEqual({ kind: "none" });
    expect(deriveWeeklyGoal(null, { todayIso: TODAY, scope: "project" })).toEqual({ kind: "unknown" });
    expect(deriveWeeklyGoal({ status: "ok", tasks: [], error: "boom" }, { todayIso: TODAY, scope: "project" })).toEqual({ kind: "unknown" });
    expect(deriveWeeklyGoal({ status: "not-authed" }, { todayIso: TODAY, scope: "project" })).toEqual({ kind: "unknown" });
    expect(deriveWeeklyGoal({ status: "needs-migration" }, { todayIso: TODAY, scope: "project" })).toEqual({ kind: "none" });
  });

  it("carries no assignee and no person — the week is the team's, never a ranking", () => {
    const g = deriveWeeklyGoal(ok([task({ id: "a", dueAt: "2026-10-13T00:00:00Z", assigneeProfileId: "someone" })]), { todayIso: TODAY, scope: "project" });
    expect(JSON.stringify(g)).not.toContain("someone");
  });
});

describe("weekly goal — render", () => {
  const goal = (scope: "project" | "mine") =>
    deriveWeeklyGoal(
      ok([
        task({ id: "a", title: "Panel P-3", dueAt: "2026-10-12T10:00:00Z", status: "done" }),
        task({ id: "b", title: "Panel P-4", dueAt: "2026-10-13T10:00:00Z", status: "todo" }),
        task({ id: "c", title: "Lighting 2nd floor", dueAt: "2026-10-16T10:00:00Z", status: "blocked" }),
      ]),
      { todayIso: TODAY, scope },
    );
  const html = async (g: ReturnType<typeof deriveWeeklyGoal>, loc = "en") => {
    state.locale = loc;
    const el = (await ProjectWeekGoal({ goal: g, locale: loc })) as ReactElement | null;
    return el ? renderToStaticMarkup(el) : "";
  };

  it("manager scope reads as the project's week; worker scope says it is their visible part only", async () => {
    const p = await html(goal("project"));
    expect(p).toContain("This week&#x27;s goal");
    expect(p).toContain("1 of 3 done");
    expect(p).toContain('data-status="overdue"');
    const m = await html(goal("mine"));
    expect(m).toContain("Your tasks this week");
    expect(m).toContain("Only the tasks you can see");
  });

  it("NONE renders nothing; UNKNOWN names the failed read; never green", async () => {
    expect(await html({ kind: "none" })).toBe("");
    expect(await html({ kind: "unknown" })).toContain("Couldn&#x27;t read this week&#x27;s tasks.");
    expect(await html(goal("project"))).not.toMatch(/state-success|trust-accent|state-live/);
  });

  for (const loc of activeLocales) {
    it(`${loc}: every string resolves`, async () => {
      expect(await html(goal("mine"), loc)).not.toContain("MISSING:");
    });
  }
});
