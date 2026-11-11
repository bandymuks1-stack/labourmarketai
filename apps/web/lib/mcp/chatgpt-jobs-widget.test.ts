import { describe, expect, it } from "vitest";

import { JOBS_WIDGET_TOOL_META, JOBS_WIDGET_URI, jobsWidgetResource } from "./chatgpt-jobs-widget";

const html = jobsWidgetResource("https://labourmarket.ai").text;

describe("the job-list widget template", () => {
  it("is an Apps SDK skybridge resource that fetches nothing", () => {
    const r = jobsWidgetResource("https://labourmarket.ai");
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
    const hostile = jobsWidgetResource('https://x.example/</script><script>alert(1)</script>').text;
    expect(hostile.match(/<\/script>/g)).toHaveLength(2);
  });

  it("carries no data of its own (the host supplies the tool's result)", () => {
    expect(html).not.toMatch(/"jobs"\s*:/);
  });
});
