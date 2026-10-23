import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The review report (`/dashboard/inbox/report`, registry row 5.19) summarises
 * the SAME reviewable set the inbox lists, so it must read it the same way:
 *
 *  1. LEFT join on workers — an inner join dropped every entry whose worker
 *     row the reviewer may not read (a learner's, for their institution), so
 *     the report counted fewer pending entries than the inbox beside it;
 *  2. a read that did not answer is UNKNOWN, never "nothing to review" (SEP-7);
 *  3. workers are keyed by id, never by display name (two people can share a
 *     name, and every unreadable name shares the same fallback).
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const loader = read("lib/journal/review-report.ts");
const page = read("app/[locale]/dashboard/inbox/report/page.tsx");
const inbox = read("app/[locale]/dashboard/inbox/page.tsx");

describe("the review report reads the inbox's set the inbox's way", () => {
  it("joins workers LEFT, like the inbox", () => {
    expect(inbox).toMatch(/workers\(\$\{WORKER_NAME_FIELDS\}\)/);
    expect(loader).toMatch(/workers\(\$\{WORKER_NAME_FIELDS\}\)/);
    expect(loader).not.toMatch(/workers!inner/);
  });

  it("a failed read renders the inbox's load-failed line, not the empty state", () => {
    expect(loader).toMatch(/if \(idError\) \{\s*loadFailed = true;/);
    expect(loader).toMatch(/if \(rowsError\) loadFailed = true;/);
    expect(page).toMatch(/report\.loadFailed \? \(/);
    expect(page).toContain('tJournal("inbox.loadFailed")');
  });

  it("each worker section is keyed by the grouping key, not the name", () => {
    expect(page).toMatch(/key=\{w\.workerKey\}/);
    expect(page).not.toMatch(/key=\{w\.workerName\}/);
  });
});
