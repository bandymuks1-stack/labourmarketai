import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PUBLIC JOB BOARD — structured data that is safe for an ANONYMOUS reader
 * (owner 2026-10-14 §8: optimise public job ads for search and AI systems
 * "nepažeisdamas privatumo"; port of #1433).
 *
 * Anonymously a job may expose its occupation, salary band and date; the
 * employer, the location, the publisher's title, the named source, contacts
 * and the apply link stay protected (handoff §26, K1). So:
 *  - the JSON-LD is built ONLY from the anonymous `preview`, never `member`,
 *    even when the visitor is signed in;
 *  - the personal "saved" view emits none;
 *  - `JobPosting` is never emitted (it requires hiringOrganization + location).
 */
const web = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(web, ...p), "utf8");
const detail = read("app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx");
const list = read("app", "[locale]", "(marketing)", "jobs", "page.tsx");
const builder = read("lib", "seo", "public-job-json-ld.ts");

describe("public job structured data stays anonymous-safe", () => {
  it("the detail page builds it from the anonymous preview only", () => {
    const call = /buildJobDetailJsonLd\(\{[\s\S]*?\}\)/.exec(detail)?.[0] ?? "";
    expect(call).toMatch(/\bpreview,/);
    expect(call).not.toMatch(/member/);
  });

  it("the list emits it only for the public board, never the saved view", () => {
    expect(list).toMatch(/\{!showSaved && result\.status === "ok" && result\.vacancies\.length > 0 && \(\s*<script\s+type="application\/ld\+json"/);
  });

  it("the builder reads only anonymous fields and never emits JobPosting", () => {
    for (const forbidden of ["employer", "applicationUrl", "city", "region", "country", "titleRaw", "descriptionRaw", "sourceName"]) {
      expect(builder, forbidden).not.toMatch(new RegExp(`\\.${forbidden}\\b`));
    }
    expect(builder).not.toMatch(/"JobPosting"/);
    expect(detail).not.toMatch(/"JobPosting"/);
    expect(list).not.toMatch(/"JobPosting"/);
  });
});
