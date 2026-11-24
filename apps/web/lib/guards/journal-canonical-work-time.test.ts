import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CANONICAL WORK-TIME GUARD — owner ruling 2026-08-18.
 *
 * `journal_entry_metrics` is the canonical persisted source for derived
 * work-time. `journal_entry_work_items` is deprecated and must never become a
 * second hours authority.
 *
 * What this protects:
 *  1. the SQL derivation and its TypeScript mirror state the SAME rule
 *     (fragment times win; entry-level quantity only when none; never summed);
 *  2. NOTHING writes to `journal_entry_work_items`, ever — the fix must not
 *     regress into "populate it because a reader expects rows";
 *  3. no live read path derives hours from it any more;
 *  4. no invented workday length anywhere;
 *  5. the applied v1 migration file is never edited in place;
 *  6. the deprecation is recorded in the database itself, and the table is
 *     not dropped by this slice (destructive DDL stays owner-gated).
 *
 * Update this guard when the contract changes deliberately — never weaken it.
 */

const ROOT = resolve(__dirname, "../../../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const CANONICAL = resolve(
  MIGRATIONS,
  "20260818150000_journal_canonical_work_time_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "supabase/rollbacks/20260818150000_journal_canonical_work_time_v1.down.sql",
);
const MODULE = resolve(ROOT, "apps/web/lib/journal/work-time.ts");

/** Line endings normalised: the signature assertion below spans newlines
 *  (`"p_worker_id uuid,\n  p_organization_id uuid,…"`), and these files are
 *  checked out CRLF on Windows — so the literal never matched there and this
 *  guard failed for every Windows developer while CI (Linux) stayed green.
 *  The assertion is about the SQL, never about the line-ending style. */
const readText = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const sql = readText(CANONICAL);
const ts = readText(MODULE);

/** The migration WITHOUT its `--` comment lines, so an assertion about what
 *  the migration DOES can never be satisfied or broken by prose about it. */
const executable = sql
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("the canonical migration is a safe, reviewable replacement", () => {
  it("carries the human gate and a paired rollback", () => {
    expect(sql).toContain("@human-gate-approved");
    expect(sql).toContain("needs-human-gate");
    expect(existsSync(ROLLBACK)).toBe(true);
  });

  it("quotes the owner ruling it implements", () => {
    expect(sql).toContain("OWNER RULING 2026-08-18");
    expect(sql).toContain("journal_entry_metrics` is the canonical");
  });

  it("changes ONE function body and no table, policy, grant or trigger", () => {
    expect(sql).toMatch(
      /create or replace function public\.timesheet_compute_lines_v1\(/,
    );
    for (const forbidden of [
      /create table/i,
      /drop table/i,
      /alter table/i,
      /create policy/i,
      /drop policy/i,
      /create trigger/i,
      /\bgrant\b/i,
    ]) {
      expect(executable).not.toMatch(forbidden);
    }
  });

  it("re-asserts the reviewed REVOKEs and widens nothing", () => {
    const fn = "public.timesheet_compute_lines_v1(uuid, uuid, date, date)";
    for (const role of ["public", "anon", "authenticated"]) {
      expect(executable).toContain(
        `revoke all on function ${fn} from ${role};`,
      );
    }
  });

  it("performs NO DML at apply time — no data is created, moved or rewritten", () => {
    for (const dml of [
      /insert\s+into/i,
      /\bupdate\s+public\./i,
      /delete\s+from/i,
      /\btruncate\b/i,
    ]) {
      expect(executable).not.toMatch(dml);
    }
  });

  it("keeps the exact function signature, so the anon/SECDEF allowlist is untouched", () => {
    expect(sql).toContain(
      "p_worker_id       uuid,\n  p_organization_id uuid,\n  p_start           date,\n  p_end             date\n) returns jsonb",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
  });
});

describe("the rule itself — double counting is structurally impossible", () => {
  it("SQL selects ONE source per entry: fragments win, quantity is the fallback", () => {
    expect(sql).toContain("m.metric_slug = 'fragment_time'");
    expect(sql).toContain("m.metric_slug = 'quantity'");
    // The `not exists` over the fragment CTE is the mechanism.
    expect(sql).toMatch(
      /where not exists \(select 1 from frag f where f\.entry_id = e\.id\)/,
    );
  });

  it("the TypeScript mirror states the SAME selection", () => {
    expect(ts).toContain('m.metric_slug !== "fragment_time"');
    expect(ts).toContain('m.metric_slug === "quantity"');
    expect(ts).toContain("if (fragmentByIndex.size > 0)");
    expect(ts).toContain("} else if (entryQuantity) {");
  });

  it("an ignored entry-level duration is REPORTED on both sides", () => {
    expect(sql).toContain("entry_quantity_ignored_fragments_present");
    expect(ts).toContain("entry_quantity_ignored_fragments_present");
  });

  it("only TIME units can become work time, on both sides", () => {
    expect(sql).toMatch(
      /join public\.productivity_units u\s*\n\s*on u\.slug = m\.unit_slug and u\.category = 'time'/,
    );
    expect(ts).toContain('WORK_TIME_UNIT_SLUGS = ["hours", "minutes", "days"]');
  });

  it("minutes convert at 1/60 and 'days' NEVER becomes hours, on both sides", () => {
    expect(sql).toContain("round(r.value / 60.0, 2)");
    expect(sql).toMatch(/when 'minutes' then round\(r\.value \/ 60\.0, 2\)\s*\n\s*else 0/);
    expect(ts).toContain("if (unit === \"minutes\") return round2(value / 60);");
    // No invented workday length on either side.
    expect(executable).not.toMatch(/\* *8\b/);
    expect(ts).not.toMatch(/\* *8\b/);
  });

  it("tenant scope comes from the entry's OWN engagement context", () => {
    expect(sql).toContain("ec.organization_id = p_organization_id");
    expect(sql).toContain(
      "join public.engagement_contexts ec on ec.id = je.engagement_context_id",
    );
  });

  it("deleted, superseded and live-corrected entries are excluded", () => {
    expect(sql).toContain("je.deleted_at is null");
    expect(sql).toContain("je.superseded_by is null");
    expect(sql).toContain("c.correction_of = je.id");
  });

  it("provenance travels with every derived hour", () => {
    for (const key of ["'metricId'", "'metricSource'", "'derivedFrom'", "'evidencePhrase'"]) {
      expect(sql).toContain(key);
    }
    for (const key of ["metricId", "metricSource", "derivedFrom", "evidencePhrase"]) {
      expect(ts).toContain(key);
    }
  });
});

describe("the deprecated table is deprecated, not populated", () => {
  const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

  it("NO migration ever writes a row into journal_entry_work_items", () => {
    const writers: string[] = [];
    for (const file of migrationFiles) {
      const body = readFileSync(resolve(MIGRATIONS, file), "utf8");
      if (
        /insert\s+into\s+public\.journal_entry_work_items/i.test(body) ||
        /update\s+public\.journal_entry_work_items/i.test(body)
      ) {
        writers.push(file);
      }
    }
    expect(writers).toEqual([]);
  });

  it("the canonical migration records the deprecation in the database", () => {
    expect(sql).toContain("comment on table public.journal_entry_work_items");
    expect(sql).toContain("DEPRECATED 2026-08-18");
    expect(sql).toContain("NOT an hours authority");
  });

  it("this slice does NOT drop the table — destructive DDL stays owner-gated", () => {
    expect(executable).not.toMatch(/drop table[^;]*journal_entry_work_items/i);
  });

  it("no application code reads or writes it any more", () => {
    const roots = ["apps/web/lib", "apps/web/app", "apps/web/components"];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        // Guards and this file talk ABOUT the table by name on purpose.
        if (full.includes(`${"lib"}/guards/`)) continue;
        const body = readFileSync(full, "utf8");
        if (/\.from\(\s*["']journal_entry_work_items["']\s*\)/.test(body)) {
          offenders.push(full.slice(ROOT.length + 1));
        }
      }
    };
    for (const r of roots) walk(resolve(ROOT, r));
    expect(offenders).toEqual([]);
  });
});

describe("the applied v1 migration file is never edited in place", () => {
  it("20260817170000 still declares its own original derivation", () => {
    const v1 = readFileSync(
      resolve(MIGRATIONS, "20260817170000_timesheets_v1.sql"),
      "utf8",
    );
    // Its body is superseded at runtime by 20260818150000, but the FILE is an
    // applied migration and must stay a faithful record of what was applied.
    expect(v1).toContain("from public.journal_entry_work_items wi");
  });
});
