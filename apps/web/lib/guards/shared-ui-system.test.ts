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

import type { Field as FieldComponent } from "@/components/ui/Field";

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
        ((control) => createElement("input", { name: "email", ...control })) as unknown as ReactNode,
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
        ((control) => createElement("input", { ...control })) as unknown as ReactNode,
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
