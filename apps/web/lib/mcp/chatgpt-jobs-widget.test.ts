import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import {
  JOBS_WIDGET_TOOL_META,
  JOBS_WIDGET_URI,
  jobsWidgetResource,
  loadJobsWidgetLabels,
} from "./chatgpt-jobs-widget";

const LABELS = await loadJobsWidgetLabels();

const html = jobsWidgetResource("https://labourmarket.ai", LABELS).text;

describe("the job-list widget template", () => {
  it("is an Apps SDK skybridge resource that fetches nothing", () => {
    const r = jobsWidgetResource("https://labourmarket.ai", LABELS);
    expect(r.uri).toBe(JOBS_WIDGET_URI);
    expect(r.mimeType).toBe("text/html+skybridge");
    expect(r._meta?.["openai/widgetCSP"]).toEqual({ connect_domains: [], resource_domains: [] });
    expect(JOBS_WIDGET_TOOL_META["openai/outputTemplate"]).toBe(JOBS_WIDGET_URI);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|<script[^>]+src=|<link[^>]+href=|localStorage|sessionStorage|document\.cookie/);
  });

  it("writes result values as text only, never as markup", () => {
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(html).toMatch(/textContent/);
  });

  it("follows only a path on its own origin", () => {
    expect(html).toContain('path.charAt(0)!=="/"');
    expect(html).toContain('path.charAt(1)==="/"');
  });

  it("an origin can never close the script block it is embedded in", () => {
    const hostile = jobsWidgetResource('https://x.example/</script><script>alert(1)</script>', LABELS).text;
    expect(hostile.match(/<\/script>/g)).toHaveLength(2);
  });

  it("carries no data of its own (the host supplies the tool's result)", () => {
    expect(html).not.toMatch(/"jobs"\s*:/);
  });
});

describe("job-list widget labels come from the canonical catalogs", () => {
  it.each(activeLocales)("%s has every widget word", (locale) => {
    for (const key of ["empty", "unavailable", "positions", "open", "more", "from", "upTo"]) {
      const word = LABELS[locale]?.[key];
      expect(typeof word === "string" && word.trim().length > 0, `${locale}.${key}`).toBe(true);
    }
    for (const [group, slugs] of [
      ["employmentForm", ["permanent", "temporary", "seasonal"]],
      ["workingTime", ["full_time", "part_time"]],
    ] as const) {
      const map = LABELS[locale]?.[group] as Record<string, string> | undefined;
      for (const slug of slugs) expect(map?.[slug]?.trim(), `${locale}.${group}.${slug}`).toBeTruthy();
    }
  });

  it("no second translation table lives in the widget module", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./chatgpt-jobs-widget.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/No open jobs match this search/);
    expect(src).toMatch(/messages\/\$\{locale\}\.json/);
  });
});
