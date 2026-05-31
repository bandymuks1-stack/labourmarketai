import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read-only project/client context expansion (post-PR #198) — honesty guard.
 *
 * Adds a worker-facing "Project context" note on the journal page + an explicit
 * "linking not enabled yet" line on the company card. Pure read-only display:
 * no writes, no create/edit/delete CTA, no fabricated project data, copy honest
 * in LT + EN.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const journalPage = read("app/[locale]/dashboard/journal/page.tsx");
const companyPage = read("app/[locale]/dashboard/company/page.tsx");

describe("journal page — read-only project-context section", () => {
  it("renders the project-context section with title + body", () => {
    expect(journalPage).toMatch(/data-testid="journal-project-context"/);
    expect(journalPage).toMatch(/t\("projectContext\.title"\)/);
    expect(journalPage).toMatch(/t\("projectContext\.body"\)/);
  });
});

describe("company card — explicit linking-not-enabled line", () => {
  it("renders the linking note", () => {
    expect(companyPage).toMatch(/data-testid="company-ops-projects-linking"/);
    expect(companyPage).toMatch(/tOps\("projectsLinkingNote"\)/);
  });
});

describe("no project write surface introduced by this slice", () => {
  // The project-context section markup must carry no create/edit/delete action.
  function projectContextRegion(src: string, anchor: string): string {
    const i = src.indexOf(anchor);
    return i < 0 ? "" : src.slice(i, i + 1200);
  }
  it("journal project-context note has no create/edit/delete CTA", () => {
    const region = projectContextRegion(journalPage, 'data-testid="journal-project-context"');
    expect(region).not.toMatch(/<form|<button|onClick|createProject|new project|sukurti projekt/i);
  });
  it("company projects card has no create/edit/delete CTA", () => {
    const region = projectContextRegion(companyPage, 'data-testid="company-ops-projects"');
    expect(region).not.toMatch(/<form|<button|onClick|createProject|new project|sukurti projekt/i);
  });
  it("the read-only helper still performs no writes", () => {
    const helper = read("lib/company/project-context.ts");
    expect(helper).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});

describe("copy is honest in LT + EN (no fake project data, states the truth)", () => {
  for (const locale of ["lt", "en"] as const) {
    const base = JSON.parse(read(`messages/${locale}.json`)) as {
      companyOps: Record<string, string>;
    };
    const journal = JSON.parse(read(`messages/${locale}/journal.json`)) as {
      projectContext: Record<string, string>;
    };
    it(`${locale} has the new keys`, () => {
      for (const k of ["title", "readyBadge", "body"]) {
        expect(journal.projectContext[k], `${locale} journal.projectContext.${k}`).toBeTruthy();
      }
      expect(base.companyOps.projectsLinkingNote, `${locale} companyOps.projectsLinkingNote`).toBeTruthy();
    });
    it(`${locale} states linking is not active/enabled + nothing auto-filled`, () => {
      const body = journal.projectContext.body.toLowerCase();
      const link = base.companyOps.projectsLinkingNote.toLowerCase();
      expect(body).toMatch(/neaktyv|not active/);
      expect(body).toMatch(/automati/);
      expect(link).toMatch(/neįjungt|not enabled/);
    });
    it(`${locale} new copy contains no fake/mock/demo/sample wording`, () => {
      const blob = (journal.projectContext.body + base.companyOps.projectsLinkingNote).toLowerCase();
      expect(blob).not.toMatch(/sample|demo|fake|mock|placeholder/);
    });
  }
});
