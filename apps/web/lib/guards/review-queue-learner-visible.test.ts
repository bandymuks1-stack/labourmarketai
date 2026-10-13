import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * An institution may read and review a learner's journal entry, but the
 * learner's `workers` row is hidden from it by least privilege. An inner join
 * on workers therefore dropped every student entry from the review surfaces
 * (proved on the local stack 2026-10-11: 1 entry readable, 0 after the join).
 */
const APP = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");

describe("review surfaces never inner-join the worker row", () => {
  it.each(["app/[locale]/dashboard/inbox/page.tsx", "lib/journal/review-queue.ts"])("%s", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/from\("journal_entries"\)[\s\S]{0,300}workers\(\$\{WORKER_NAME_FIELDS\}\)/);
    expect(src).not.toMatch(/journal_entries"\)[\s\S]{0,300}workers!inner/);
  });
});
