import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { pageReadsViewerDay } from "./viewer-day-trees";

describe("pageReadsViewerDay", () => {
  it("is true on the signed-in trees, with or without a locale", () => {
    for (const p of ["/lt/dashboard", "/en/dashboard/journal", "/de/cv", "/lt/onboarding", "/dashboard", "/sv/dashboard/planning?view=week"]) {
      expect(pageReadsViewerDay(p.split("?")[0]), p).toBe(true);
    }
  });

  it("is false on public pages and look-alike paths", () => {
    for (const p of ["/lt", "/en/jobs", "/en/jobs/abc", "/lt/for-companies", "/en/auth/login", "/en/dashboards", "/en/cvx", "/", "", null, undefined]) {
      expect(pageReadsViewerDay(p as string), String(p)).toBe(false);
    }
  });
});

/** Every page or route that imports the viewer's day lives in a tree that refreshes. */
describe("the zone is read only where the first visit refreshes", () => {
  const appDir = join(process.cwd(), "app", "[locale]");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(f) && !/\.test\./.test(f)) files.push(p);
    }
  };
  walk(appDir);

  it("no file outside /dashboard, /cv and /onboarding imports lib/time/viewer-day", () => {
    const readers = files.filter((f) => /from "@\/lib\/time\/viewer-day"/.test(readFileSync(f, "utf8")));
    expect(readers.length).toBeGreaterThan(0);
    for (const f of readers) {
      const route = "/" + relative(appDir, f).split("/").filter((s) => !s.startsWith("(")).join("/");
      expect(pageReadsViewerDay(route), route).toBe(true);
    }
  });
});
