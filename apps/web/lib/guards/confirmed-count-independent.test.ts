import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONFIRMABLE_ENTRY_BY_WORKER_COLUMNS,
  confirmedEntriesByWorker,
  countConfirmedEntriesFromRows,
} from "@/lib/journal/review-status";

/**
 * ONLY A DECISION BY SOMEONE ELSE CONFIRMS WORK (EVID-2), and every figure agrees because
 * every figure asks `isConfirmedEntry`. A confirmation read that doesn't select
 * `confirmer_id` can't ask, so it counts a person's approval of their own work. New reads
 * either select it or say here why they count nothing.
 */
const ROOT = join(__dirname, "..", "..");

/** Reads of the table that count nothing about a person's confirmed work. */
const COUNTS_NOTHING: Record<string, string> = {
  "lib/conversation/dispatch.ts": "a replay key: the id of the entry's newest row",
  "lib/cv-export/verified-cv.ts": "marks each row self-confirmed by a second read that filters on confirmer_id",
  "lib/operations/manager-evidence.ts": "the reader's own decisions as a confirmer, filtered on confirmer_id",
  "lib/journal/own-recent-confirmations.ts": "the last 7 days on the reader's own entries: self-approval is refused since #2181, so no self row can be that recent",
  "lib/capabilities/journal-correction-capabilities.ts": "whether any decision exists, which locks a correction",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.|\.d\.ts$|supabase[\\/]types/.test(path) ? [path] : [];
  });
}

/** Every select of the confirmations table, flat or embedded, with the columns it names. */
function confirmationReads(): { file: string; columns: string }[] {
  const reads: { file: string; columns: string }[] = [];
  for (const dir of ["lib", "app", "components"]) {
    for (const path of sourceFiles(join(ROOT, dir))) {
      const file = relative(ROOT, path).replaceAll("\\", "/");
      if (file.startsWith("lib/guards/")) continue;
      const source = readFileSync(path, "utf8");
      for (const m of source.matchAll(/\.from\("journal_entry_confirmations"\)\s*\.select\(\s*("[^"]*"|`[^`]*`)/g)) {
        reads.push({ file, columns: m[1]! });
      }
      for (const m of source.matchAll(/journal_entry_confirmations(?:!inner)?\(([^)]*)\)/g)) {
        if (/^\s*\*/m.test(source.slice(source.lastIndexOf("\n", m.index), m.index))) continue;
        reads.push({ file, columns: m[1]! });
      }
    }
  }
  return reads;
}

describe("a confirmed figure can't skip the rule", () => {
  it("finds the reads it polices", () => {
    expect(confirmationReads().length).toBeGreaterThan(10);
  });

  it("every confirmation read selects confirmer_id, or says why it counts nothing", () => {
    const blind = confirmationReads().filter((r) => !r.columns.includes("confirmer_id") && !COUNTS_NOTHING[r.file]);
    expect(blind).toEqual([]);
  });

  it("no head count of the table: a row count can't ask who decided", () => {
    for (const dir of ["lib", "app", "components"]) {
      for (const path of sourceFiles(join(ROOT, dir))) {
        if (path.includes("guards")) continue;
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(/\.from\("journal_entry_confirmations"\)\s*\.select\([^)]*head: true/);
      }
    }
  });

  it("the four surfaces that counted rows go through the rule", () => {
    const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
    expect(read("lib/player-card/player-card.ts")).toMatch(/countConfirmedEntries\(/);
    expect(read("lib/agency/pool.ts")).toMatch(/confirmedEntriesByWorker\(/);
    expect(read("lib/admin/matching-workbench.ts")).toMatch(/confirmedEntriesByWorker\(/);
    expect(read("app/[locale]/dashboard/inbox/page.tsx")).toMatch(/subject_profile_id:/);
    expect(CONFIRMABLE_ENTRY_BY_WORKER_COLUMNS).toContain("confirmer_id");
  });
});

const ME = "11111111-1111-4111-8111-111111111111";
const BOSS = "22222222-2222-4222-8222-222222222222";
const approve = (confirmer: string, at = "2026-10-01T00:00:00Z") => ({
  confirmation_scope: { action: "review", decision: "approved" },
  created_at: at,
  confirmer_id: confirmer,
});

describe("confirmedEntriesByWorker", () => {
  const entry = (id: string, rows: ReturnType<typeof approve>[]) => ({
    id,
    worker_id: "w1",
    workers: { profile_id: ME },
    journal_entry_confirmations: rows,
  });

  it("a person's approval of their own work counts nothing", () => {
    expect(confirmedEntriesByWorker([entry("a", [approve(ME)]), entry("b", [approve(ME)])]).get("w1")).toBe(0);
  });

  it("someone else's approval counts once per entry", () => {
    const rows = [entry("a", [approve(BOSS), approve(BOSS, "2026-10-02T00:00:00Z")]), entry("b", [approve(ME)])];
    expect(confirmedEntriesByWorker(rows).get("w1")).toBe(1);
  });

  it("a client's acceptance is not an employer's confirmation (decision 0018)", () => {
    const client = {
      confirmation_scope: { action: "review", decision: "approved", authority: { basis: "counterparty" } },
      created_at: "2026-10-01T00:00:00Z",
      confirmer_id: BOSS,
    };
    expect(confirmedEntriesByWorker([{ ...entry("a", []), journal_entry_confirmations: [client] }]).get("w1")).toBe(0);
  });

  it("an unreadable author counts nothing, rather than a number that may hold self-approvals", () => {
    expect(confirmedEntriesByWorker([{ ...entry("a", [approve(BOSS)]), workers: null }]).get("w1")).toBe(0);
  });
});

describe("countConfirmedEntriesFromRows", () => {
  it("drops an entry only its author approved, and keeps others", () => {
    const rows = [
      { entry_id: "a", subject_profile_id: ME, ...approve(ME) },
      { entry_id: "b", subject_profile_id: ME, ...approve(BOSS) },
    ];
    expect(countConfirmedEntriesFromRows(rows).confirmed).toBe(1);
  });
});
