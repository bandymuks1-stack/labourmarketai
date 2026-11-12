import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * ONE DESIGN SYSTEM (owner decision 2026-11-12).
 *
 *  1. DESIGN.md §10 is the "how to use" page, and every component path it
 *     names exists — the page cannot drift from the code;
 *  2. there is ONE rail: no second horizontal carousel implementation may
 *     appear outside the navigation rail (the older signed-in area switcher
 *     is the one named exception until the signed-in homes move to the rail);
 *  3. the five primitives added for the other modules render what they
 *     promise: a field wires label, hint and error; a notice announces by
 *     tone; a filter bar is a named search form or group; a list row keeps
 *     actions outside its link; a grouped list names its groups and says
 *     when one is empty.
 */

import type { Field as FieldComponent, FieldControlProps } from "@/components/ui/Field";

type FieldProps = Parameters<typeof FieldComponent>[0];

const APP_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const DESIGN = readFileSync(join(REPO_ROOT, "DESIGN.md"), "utf8");
const SECTION = DESIGN.slice(DESIGN.indexOf("## 10. The shared system: how to use it"));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("DESIGN.md §10 matches the code", () => {
  it("the section exists, before the final quality gate", () => {
    expect(DESIGN.indexOf("## 10. The shared system: how to use it")).toBeGreaterThan(-1);
    expect(DESIGN.indexOf("## 10. The shared system: how to use it")).toBeLessThan(
      DESIGN.indexOf("## Final Quality Gate"),
    );
  });

  it("every component it names is a real file", () => {
    const table = SECTION.slice(0, SECTION.indexOf("Rules that hold on every screen"));
    const paths = [...table.matchAll(/`((?:ui|app|navigation|layouts)\/[A-Za-z0-9/_-]+)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(25);
    for (const p of new Set(paths)) {
      const ok =
        existsSync(join(APP_ROOT, "components", `${p}.tsx`)) ||
        existsSync(join(APP_ROOT, "components", `${p}.ts`));
      expect(ok, `DESIGN.md names components/${p}, which does not exist`).toBe(true);
    }
  });

  it("names each of the shared primitives", () => {
    for (const name of ["Field", "Notice", "FilterBar", "ListRow", "GroupedList", "Button", "Card", "Input", "Select"]) {
      expect(SECTION, name).toContain(`ui/${name}`);
    }
    expect(SECTION).toContain("navigation/card-rail");
  });
});

describe("there is one rail", () => {
  /** A horizontal scroll-snap track, or a positioned carousel. */
  const CAROUSEL = /snap-x[^"]*overflow-x-auto|overflow-x-auto[^"]*snap-x|aria-roledescription="carousel"/;
  const ALLOWED = new Set([
    "components/navigation/card-rail.tsx",
    // The older signed-in chooser. It goes when the signed-in homes move to
    // the rail (PR #3270); nothing new may use it.
    "components/app/area-switcher.tsx",
    // The withdrawn landing hero (owner order 2026-11-09): kept in the
    // repository unused and under the landing freeze, mounted nowhere.
    "components/marketing/living-worker-hero.tsx",
  ]);

  it("no other component implements a carousel", () => {
    const offenders = walk(join(APP_ROOT, "components"))
      .map((p) => p.slice(APP_ROOT.length + 1).split("\\").join("/"))
      .filter((rel) => !ALLOWED.has(rel) && !rel.endsWith(".test.tsx"))
      .filter((rel) => CAROUSEL.test(read(rel)));
    expect(offenders, "a second rail/carousel implementation").toEqual([]);
  });
});

describe("the primitives render what they promise", () => {
  it("Field binds label, hint and error to the control", async () => {
    const { Field } = await import("@/components/ui/Field");
    const html = renderToStaticMarkup(
      createElement(
        Field,
        { label: "Email", hint: "We never show it", error: "Enter an email" } as FieldProps,
        ((control: FieldControlProps) => createElement("input", { name: "email", ...control })) as unknown as ReactNode,
      ),
    );
    const id = /<label[^>]*for="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-hint ${id}-error"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/role="alert"[^>]*>Enter an email</);
  });

  it("Field without an error is not invalid and announces nothing", async () => {
    const { Field } = await import("@/components/ui/Field");
    const html = renderToStaticMarkup(
      createElement(
        Field,
        { label: "City" } as FieldProps,
        ((control: FieldControlProps) => createElement("input", { ...control })) as unknown as ReactNode,
      ),
    );
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain('role="alert"');
  });

  it("Notice announces by tone and carries an icon, not colour alone", async () => {
    const { Notice } = await import("@/components/ui/Notice");
    const error = renderToStaticMarkup(createElement(Notice, { tone: "error", title: "Could not save" }));
    const ok = renderToStaticMarkup(createElement(Notice, { tone: "success", title: "Saved" }));
    expect(error).toContain('role="alert"');
    expect(ok).toContain('role="status"');
    expect(error).toContain("<svg");
    expect(ok).toContain("<svg");
  });

  it("FilterBar is a named search form or a named group, with a polite result line", async () => {
    const { FilterBar } = await import("@/components/ui/FilterBar");
    const form = renderToStaticMarkup(
      createElement(FilterBar, { label: "Filters", as: "form", action: "/en/jobs", method: "get", result: "24 results" }),
    );
    expect(form).toMatch(/<form[^>]*role="search"[^>]*action="\/en\/jobs"/);
    expect(form).toContain('aria-label="Filters"');
    expect(form).toMatch(/aria-live="polite"[^>]*>24 results</);
    const group = renderToStaticMarkup(createElement(FilterBar, { label: "Filters" }));
    expect(group).toContain('role="group"');
  });

  it("ListRow keeps status and actions outside its link", async () => {
    vi.doMock("@/lib/i18n/navigation", () => ({
      Link: ({ href, children, className }: { href: string; children: unknown; className?: string }) =>
        createElement("a", { href, className }, children as never),
    }));
    const { ListRow } = await import("@/components/ui/ListRow");
    const html = renderToStaticMarkup(
      createElement(ListRow, {
        href: "/dashboard/projects/1",
        title: "Project",
        meta: "Vilnius",
        status: createElement("span", { "data-s": "" }, "Active"),
        actions: createElement("button", { type: "button" }, "Open"),
      }),
    );
    expect(html.startsWith("<li")).toBe(true);
    const link = html.slice(html.indexOf("<a"), html.indexOf("</a>"));
    expect(link).toContain("Project");
    expect(link).not.toContain("<button");
    expect(link).not.toContain("data-s");
    expect(html).toContain("<button");
  });

  it("GroupedList names its groups, shows real counts and says when one is empty", async () => {
    const { GroupedList } = await import("@/components/ui/GroupedList");
    const html = renderToStaticMarkup(
      createElement(GroupedList, {
        label: "People by team",
        groups: [
          { id: "a", title: "Team A", count: 2, rows: createElement("li", null, "x") },
          { id: "b", title: "Team B", count: 0, rows: null, empty: "No one in this team yet." },
          { id: "c", title: "Team C", rows: createElement("li", null, "y") },
        ],
      }),
    );
    expect(html).toContain('aria-label="People by team"');
    expect(html.match(/<h3/g)).toHaveLength(3);
    expect(html).toContain("No one in this team yet.");
    // A group with no count shows no number at all.
    const teamC = html.slice(html.indexOf("Team C"));
    expect(teamC.slice(0, teamC.indexOf("<ul"))).not.toMatch(/font-mono/);
  });
});

describe("the form and data primitives requested by the other modules", () => {
  it("Input, Select and Textarea let a caller's width replace the default full width", async () => {
    const { Input } = await import("@/components/ui/Input");
    const { Select } = await import("@/components/ui/Select");
    const { Textarea } = await import("@/components/ui/Textarea");
    const { hasOwnWidth } = await import("@/components/ui/own-width");
    expect(renderToStaticMarkup(createElement(Input, {}))).toMatch(/class="w-full /);
    const narrow = renderToStaticMarkup(createElement(Input, { className: "w-40" }));
    expect(narrow).toContain("w-40");
    expect(narrow).not.toContain("w-full");
    expect(renderToStaticMarkup(createElement(Select, { className: "w-auto" }))).not.toContain("w-full");
    expect(renderToStaticMarkup(createElement(Textarea, { className: "w-64" }))).not.toContain("w-full");
    // A width behind a breakpoint keeps the control full width below it.
    expect(hasOwnWidth("sm:w-40 mt-2")).toBe(false);
    expect(renderToStaticMarkup(createElement(Input, { className: "sm:w-40" }))).toContain("w-full");
  });

  it("Checkbox is a native checkbox inside its label; RadioGroup is a fieldset with a legend", async () => {
    const { Checkbox, RadioGroup } = await import("@/components/ui/Choice");
    const box = renderToStaticMarkup(
      createElement(Checkbox, { name: "agree", label: "I agree", hint: "You can change this later" }),
    );
    expect(box).toMatch(/^<label[^>]*min-h-11/);
    expect(box).toContain('type="checkbox"');
    expect(box).toContain("You can change this later");
    const radios = renderToStaticMarkup(
      createElement(RadioGroup, {
        legend: "Work type",
        name: "type",
        defaultValue: "b",
        error: "Choose one",
        options: [
          { value: "a", label: "Full time" },
          { value: "b", label: "Part time" },
        ],
      }),
    );
    expect(radios).toMatch(/^<fieldset[^>]*aria-describedby=/);
    expect(radios).toContain("<legend");
    expect(radios.match(/type="radio"/g)).toHaveLength(2);
    expect(radios.match(/checked=""/g)).toHaveLength(1);
    expect(radios).toContain('role="alert"');
  });

  it("ToggleChip is a pressed-state button; RemovableChip names its remove control", async () => {
    const { ToggleChip, RemovableChip } = await import("@/components/ui/Chip");
    // Children go in as an argument, typed loosely: the props object alone
    // does not satisfy a required `children`.
    const chipEl = createElement as unknown as (
      type: unknown,
      props: Record<string, unknown>,
      child: string,
    ) => ReturnType<typeof createElement>;
    const on = renderToStaticMarkup(
      chipEl(ToggleChip, { pressed: true, onPressedChange: () => {} }, "Night shifts"),
    );
    const off = renderToStaticMarkup(
      chipEl(ToggleChip, { pressed: false, onPressedChange: () => {} }, "Night shifts"),
    );
    expect(on).toContain('aria-pressed="true"');
    expect(off).toContain('aria-pressed="false"');
    // Pressed is shown by a mark as well as colour.
    expect(on).toContain("<svg");
    expect(off).not.toContain("<svg");
    expect(on).toContain("min-h-11");
    const chip = renderToStaticMarkup(
      chipEl(RemovableChip, { onRemove: () => {}, removeLabel: "Remove Welding" }, "Welding"),
    );
    expect(chip).toContain('aria-label="Remove Welding"');
    expect(chip).toMatch(/<button[^>]*h-11 w-11/);
    expect(chip).toContain(">Welding<");
  });

  it("Table is a captioned table with column and row headers, and says when it is empty", async () => {
    const { Table } = await import("@/components/ui/Table");
    const columns = [
      { key: "who", header: "Person" },
      { key: "hours", header: "Hours", align: "end" as const },
      { key: "note", header: "Note", wideOnly: true },
    ];
    const html = renderToStaticMarkup(
      createElement(Table, {
        caption: "Hours this week",
        columns,
        rows: [{ id: "1", cells: { who: "A. Person", hours: "38", note: "—" } }],
        empty: "No hours recorded",
      }),
    );
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)).toHaveLength(3);
    expect(html.match(/scope="row"/g)).toHaveLength(1);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("hidden md:table-cell");
    expect(html).not.toContain("No hours recorded");
    const none = renderToStaticMarkup(
      createElement(Table, { caption: "Hours", captionHidden: true, columns, rows: [], empty: "No hours recorded" }),
    );
    expect(none).toContain('colSpan="3"');
    expect(none).toContain("No hours recorded");
    expect(none).toMatch(/<caption class="sr-only"/);
  });

  it("StructureTree nests lists by level, opens to the asked depth and names an empty branch", async () => {
    const { StructureTree } = await import("@/components/ui/StructureTree");
    const html = renderToStaticMarkup(
      createElement(StructureTree, {
        label: "Company structure",
        openDepth: 1,
        nodes: [
          {
            id: "c",
            label: "Company",
            count: 2,
            children: [
              { id: "t1", label: "Team one", count: 1, children: [{ id: "p1", label: "A. Person", meta: "Lead" }] },
              { id: "t2", label: "Team two", count: 0, children: [], empty: "No people in this team" },
            ],
          },
        ],
      }),
    );
    expect(html).toMatch(/^<nav aria-label="Company structure"/);
    expect(html.match(/<ul/g)).toHaveLength(3);
    expect(html.match(/<details/g)).toHaveLength(3);
    // Only the top level starts open.
    expect(html.match(/<details open=""/g)).toHaveLength(1);
    expect(html).toContain("No people in this team");
    expect(html).not.toContain('role="tree"');
  });

  it("ui/EmptyState is the one empty state, not a second implementation", async () => {
    const ui = await import("@/components/ui/EmptyState");
    const app = await import("@/components/app/empty-state");
    expect(ui.EmptyState).toBe(app.EmptyState);
    expect(read("components/ui/EmptyState.tsx")).not.toMatch(/function |=>/);
  });
});
