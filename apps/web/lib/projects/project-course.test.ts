import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

import { deriveProjectCourse } from "./project-course";
import type { ProjectStage } from "./stages-model";

const state = vi.hoisted(() => ({ locale: "en" }));
const WEB = join(__dirname, "..", "..");
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => {
    const messages = JSON.parse(readFileSync(join(WEB, "messages", `${state.locale}.json`), "utf8"));
    return createTranslator({
      locale: state.locale,
      messages,
      namespace: ns as never,
      onError: () => {},
      getMessageFallback: ({ key }) => `MISSING:${ns}.${key}`,
    });
  }),
}));

import { ProjectCourseTrack } from "@/components/app/projects/project-course-track";

const TODAY = "2026-10-14";
const stage = (p: Partial<ProjectStage> & { id: string }): ProjectStage => ({
  name: p.id,
  stageOrder: 0,
  status: "planned",
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
  blockedReason: null,
  completionCriteria: null,
  ...p,
});
const data = (stages: ProjectStage[]) => ({ applied: true as const, stages, error: null });

describe("project course — model", () => {
  it("unread → UNKNOWN; not applied or no stages → NONE; a read error → UNKNOWN", () => {
    expect(deriveProjectCourse(null, TODAY)).toEqual({ kind: "unknown" });
    expect(deriveProjectCourse({ applied: false }, TODAY)).toEqual({ kind: "none" });
    expect(deriveProjectCourse(data([]), TODAY)).toEqual({ kind: "none" });
    expect(deriveProjectCourse({ applied: true, stages: [], error: "boom" }, TODAY)).toEqual({ kind: "unknown" });
  });

  it("'we are here' is the stage in progress; cancelled stages do not count", () => {
    const c = deriveProjectCourse(
      data([
        stage({ id: "a", status: "done" }),
        stage({ id: "b", status: "in_progress" }),
        stage({ id: "c" }),
        stage({ id: "x", status: "cancelled" }),
      ]),
      TODAY,
    );
    if (c.kind !== "known") throw new Error("known");
    expect(c.here).toBe(1);
    expect(c.done).toBe(1);
    expect(c.total).toBe(3);
  });

  it("without a stage in progress, here = the first not done; all done → null", () => {
    const c = deriveProjectCourse(data([stage({ id: "a", status: "done" }), stage({ id: "b" })]), TODAY);
    expect(c.kind === "known" && c.here).toBe(1);
    const d = deriveProjectCourse(data([stage({ id: "a", status: "done" })]), TODAY);
    expect(d.kind === "known" && d.here).toBeNull();
  });

  it("overdue comes from dates only, never on a done stage", () => {
    const c = deriveProjectCourse(
      data([
        stage({ id: "late", status: "in_progress", plannedEnd: "2026-10-01" }),
        stage({ id: "doneLate", status: "done", plannedEnd: "2026-09-01" }),
      ]),
      TODAY,
    );
    if (c.kind !== "known") throw new Error("known");
    expect(c.steps[0]).toMatchObject({ overdue: true, edge: "risk" });
    expect(c.steps[1]).toMatchObject({ overdue: false, edge: "done" });
    expect(c.overdue).toBe(1);
  });

  it("a blocked stage carries the manager's own reason verbatim (trimmed), nothing invented", () => {
    const c = deriveProjectCourse(data([stage({ id: "b", status: "blocked", blockedReason: "  Nėra medžiagų  " })]), TODAY);
    expect(c.kind === "known" && c.steps[0].blockedReason).toBe("Nėra medžiagų");
    const d = deriveProjectCourse(data([stage({ id: "b", status: "blocked", blockedReason: "   " })]), TODAY);
    expect(d.kind === "known" && d.steps[0].blockedReason).toBeNull();
  });
});

describe("project course — render", () => {
  const html = async (c: ReturnType<typeof deriveProjectCourse>, loc = "en") => {
    state.locale = loc;
    const el = (await ProjectCourseTrack({ course: c, locale: loc })) as ReactElement | null;
    return el ? renderToStaticMarkup(el) : "";
  };
  const FULL = deriveProjectCourse(
    data([
      stage({ id: "s1", name: "Cable routes", status: "done" }),
      stage({ id: "s2", name: "Panels", status: "in_progress", plannedEnd: "2026-11-01" }),
      stage({ id: "s3", name: "Lighting", status: "blocked", blockedReason: "No materials" }),
      stage({ id: "s4", name: "Handover" }),
    ]),
    TODAY,
  );

  it("NONE renders nothing; UNKNOWN names the failed read", async () => {
    expect(await html({ kind: "none" })).toBe("");
    expect(await html({ kind: "unknown" })).toContain("Couldn&#x27;t read the project&#x27;s stages.");
  });

  it("draws the track, the count, 'we are here' and the help needed — with no green", async () => {
    const h = await html(FULL);
    expect(h).toContain('data-testid="project-course-track"');
    expect(h).toContain('data-testid="project-course-rail"');
    expect(h).toContain("1 of 4 stages done");
    expect(h).toContain('data-testid="project-course-here"');
    expect(h).toContain("No materials");
    expect(h).not.toMatch(/state-success|trust-accent|state-live/);
  });

  it("names no person and no per-person figure (team course, never a ranking)", async () => {
    const h = await html(FULL);
    expect(h.toLowerCase()).not.toMatch(/\bscore\b|\brank|\brating/);
  });

  for (const loc of activeLocales) {
    it(`${loc}: every string resolves`, async () => {
      expect(await html(FULL, loc)).not.toContain("MISSING:");
    });
  }
});
