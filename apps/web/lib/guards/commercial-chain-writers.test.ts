import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY STAGE OF THE COMMERCIAL → REAL-WORK CHAIN KEEPS A REACHABLE WRITER.
 *
 * ── §14, audited against PRODUCTION DATA 2026-09-27
 *
 * The chain the owner named — reply → requirement → matching → presentation →
 * agreement → placement → project/object → assignment → planning → task →
 * execution → evidence → approval → Work Journal — is CONTINUOUS in stored
 * production data. Row counts along it:
 *
 *   customer_requests 20 · demand_interest_signals 6 · agency_candidate_offers 2
 *   · engagement_contexts 79 · company_worker_engagements 1 · projects 9
 *   · work_objects 19 · project_worker_assignments 5 · booking_requests 1
 *   · work_tasks 2 · journal_entries 40 (photos 8, metrics 275)
 *   · journal_entry_confirmations 13 · timesheets 2 (events 6)
 *
 * TWO STAGES HAVE ZERO ROWS AND ARE NOT BREAKS. `agreements` and
 * `journal_entry_tasks` are both fully built and reachable; nobody has used them
 * yet. That is adoption, and this repo has a rule about not reading it as a code
 * gap. What it IS, though, is the precise state in which a future cleanup deletes
 * a working feature for being "unused" — so the wiring is pinned here instead of
 * depending on someone remembering.
 *
 * ONE STAGE IS GENUINELY NOT IN THE LIVE CHAIN: `matches` / `match_actions` hold
 * 0 rows AND have 0 references in the application. Matching is DERIVED live from
 * canonical facts (the opportunities board, the fit bands) and never persisted.
 * That is a design, not a defect — so this guard deliberately does NOT demand a
 * writer for them. It records the fact so nobody "fixes" the empty tables by
 * starting to write a second, stored notion of a match beside the derived one.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const has = (rel: string): boolean => existsSync(join(WEB, rel));

describe("§14 — the task↔evidence link stays wired end to end", () => {
  /*
   * The transition the owner called out: task → execution → evidence. Without
   * this link, "was the work on this task actually done" cannot be answered from
   * the graph, however many journal entries exist. In production: work_tasks 2,
   * journal_entries 40, journal_entry_tasks 0 — every part built, none used yet.
   */
  it("the READ side exists and is bounded", () => {
    const rel = "lib/journal/task-evidence.ts";
    expect(has(rel)).toBe(true);
    const src = read(rel);
    expect(src).toContain('.from("journal_entry_tasks")');
    // Batched for the list page — a per-card read would be an N+1 on the journal.
    expect(src).toMatch(/getTaskEvidenceByTask/);
    // Withdrawn links are excluded by `unlinked_at`, never deleted (§4.3).
    expect(src).toMatch(/unlinked_at/);
  });

  it("the WRITE side exists, through the canonical RPCs", () => {
    const rel = "lib/journal/task-evidence-actions.ts";
    expect(has(rel)).toBe(true);
    const src = read(rel);
    // Verified present in production as SECURITY DEFINER on 2026-09-27.
    expect(src).toContain("link_journal_entry_to_task_v1");
    expect(src).toContain("unlink_journal_entry_from_task_v1");
    // Writes go through the RPC, never a direct table insert from the action.
    expect(src).not.toMatch(/from\("journal_entry_tasks"\)[\s\S]{0,80}\.insert/);
  });

  it("a person can actually reach both — the form is on the tasks page", () => {
    // Presence is not reachability (the calendar, #1881). The link and unlink
    // actions must be bound to real forms a person can submit.
    const page = "app/[locale]/dashboard/tasks/page.tsx";
    expect(has(page)).toBe(true);
    const src = read(page);
    expect(src).toContain("linkTaskEvidenceAction");
    expect(src).toContain("unlinkTaskEvidenceAction");
    expect(src).toMatch(/<form\s+action=\{(link|unlink)TaskEvidenceAction\}/);
  });

  it("an unapplied migration is NAMED, not rendered as 'no evidence'", () => {
    // SEP-7 again: a missing migration and an empty link set are different
    // answers, and the read distinguishes them.
    const src = read("lib/journal/task-evidence.ts");
    expect(src).toMatch(/needs-migration/);
    expect(src).toMatch(/isMigrationMissingCode/);
  });
});

describe("§14 — matching stays DERIVED, not quietly persisted", () => {
  it("nothing writes a stored match beside the derived one", () => {
    /*
     * `matches` and `match_actions` exist in the schema with 0 rows and 0 app
     * references. Fit is computed from canonical facts instead
     * (lib/opportunities/*), which is why the board can explain itself.
     *
     * If somebody starts writing these tables, the product gains a SECOND notion
     * of "a match" that can disagree with the derived one — the parallel-fact
     * defect, on the most consequential object in the system. Persisting a match
     * may be a legitimate future decision, but it is an owner decision and a
     * migration-bearing one, not a quiet insert.
     */
    const roots = ["lib", "app"] as const;
    const offenders: string[] = [];
    for (const root of roots) {
      const dir = join(WEB, root);
      const stack = [dir];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const name of readdirSync(cur)) {
          if (name === "node_modules" || name === ".next") continue;
          const p = join(cur, name);
          const st = statSync(p);
          if (st.isDirectory()) {
            stack.push(p);
            continue;
          }
          if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
          const src = readFileSync(p, "utf8");
          if (/\.from\("(matches|match_actions)"\)[\s\S]{0,120}\.(insert|upsert|update)/.test(src)) {
            offenders.push(p.slice(WEB.length + 1));
          }
        }
      }
    }
    expect(offenders, `a stored match would be a second notion of a match`).toEqual([]);
  });
});
