#!/usr/bin/env node
// migration-safety.mjs — static, secret-free, NO-DB safety gate for the
// Auto-merge Safety Envelope (AGENTS.md → "GREEN / RED merge tiers").
//
// For each supabase/migrations/*.sql file ADDED or MODIFIED in a PR diff, it
// fails the job (RED class) when a risky pattern is present WITHOUT an explicit
// `-- @human-gate-approved` annotation:
//   (a) drop table/column/function not preceded by a 0-row assertion guard
//   (b) missing reversible rollback block (down / commented recreate)
//   (e) RLS-loosening: using/with check (true), to anon, grant to anon/public
//   (f) changes to auth-core (auth-schema) objects
// Two STRUCTURAL checks always hold and are NOT bypassable by the annotation
// (a human gate doesn't make a malformed name or a reused version safe):
//   (c) filename not matching PLATFORM_DOCTRINE §16 YYYYMMDDHHMMSS_snake_case.sql
//   (d) version prefix already present on the base branch (re-run hazard) or
//       duplicated among the PR's added migrations
//
// NO-DB note: the live prod ledger cannot be queried from a secret-free job, so
// (d) uses the committed base-branch migration set as the static proxy for
// "already in the ledger" (the repo files mirror the ledger). True ledger
// collisions are additionally caught at MCP apply time.
//
// Usage:
//   node .github/scripts/migration-safety.mjs            # analyze PR diff
//   node .github/scripts/migration-safety.mjs --self-test # run inline fixtures
//
// Env: BASE_SHA (or BASE_REF) = the PR base to diff against (default origin/main).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
const FILENAME_RE = /^\d{14}_[a-z0-9]+(_[a-z0-9]+)*\.sql$/;

// Strip SQL comments so risk patterns are detected only in EXECUTABLE SQL.
// This is what lets a commented `-- drop table ...` inside a ROLLBACK block NOT
// count as a real destructive drop.
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " "); // line comments
}

function versionOf(file) {
  const m = basename(file).match(/^(\d+)_/);
  return m ? m[1] : null;
}

/**
 * Pure analyzer. Returns { errors:[{id,msg}], notices:[{id,msg}], gated }.
 * @param {{filename:string, raw:string, isAdded:boolean,
 *          baseVersions:Set<string>, addedVersionCounts:Map<string,number>}} a
 */
export function analyzeMigration(a) {
  const { filename, raw, isAdded, baseVersions, addedVersionCounts } = a;
  const base = basename(filename);
  const code = stripComments(raw);
  const gated = ANNOTATION.test(raw);
  const errors = [];
  const notices = [];

  // A risk finding is an ERROR unless the file carries the human-gate
  // annotation, in which case it is downgraded to a NOTICE (acknowledged RED).
  const risk = (id, msg) =>
    (gated ? notices : errors).push({
      id,
      msg: gated ? `${msg} — bypassed by @human-gate-approved (RED, human-gated)` : msg,
    });
  // Structural findings always block (never bypassable).
  const structural = (id, msg) => errors.push({ id, msg });

  // (a) destructive drop must be preceded by a 0-row assertion guard.
  const firstDrop = code.search(/\bdrop\s+(table|function)\b|\bdrop\s+column\b/i);
  if (firstDrop !== -1) {
    const guard = /do\s+\$\$[\s\S]*?count\s*\(\s*\*\s*\)[\s\S]*?raise\s+exception[\s\S]*?\$\$/i.exec(
      code,
    );
    if (!guard || guard.index > firstDrop) {
      risk(
        "drop-without-zero-row-guard",
        "destructive drop (table/column/function) is not preceded by a 0-row assertion guard (do $$ ... if count(*) > 0 then raise exception ... $$)",
      );
    }
  }

  // (b) reversible rollback block required for every migration.
  const hasRollback =
    /--[^\n]*\brollback\b/i.test(raw) || /(^|\n)[ \t]*--[ \t]*down\b/i.test(raw);
  if (!hasRollback) {
    risk(
      "missing-rollback",
      "no reversible rollback block found (expected a `-- ROLLBACK` or `-- down` commented recreate / reverse SQL)",
    );
  }

  // (e) RLS-loosening.
  if (/\busing\s*\(\s*true\s*\)/i.test(code) || /\bwith\s+check\s*\(\s*true\s*\)/i.test(code)) {
    risk("rls-permissive-true", "permissive policy predicate `using (true)` / `with check (true)`");
  }
  if (/\bto\s+anon\b/i.test(code)) {
    risk("rls-to-anon", "policy or grant targets the `anon` (unauthenticated) role");
  }
  if (/\bgrant\b[\s\S]{0,120}?\bto\s+(anon|public)\b/i.test(code)) {
    risk("grant-anon-public", "table/object GRANT to `anon` or `public` (broad grant)");
  }
  // bare `to public` in a policy WITH a row predicate is the secure norm — not a
  // hard fail (that would block most policy migrations and defeat auto-merge);
  // surfaced as a notice for the reviewer's eye.
  if (/\b(create|alter)\s+policy\b[\s\S]*?\bto\s+public\b/i.test(code) &&
      !/\busing\s*\(\s*true\s*\)/i.test(code)) {
    notices.push({
      id: "policy-to-public",
      msg: "new/altered policy applies `to public` (all roles) — safe only if the USING predicate is restrictive; confirm the predicate",
    });
  }

  // (f) auth-core objects.
  const authCore = [
    /\b(alter|drop)\s+table\s+auth\./i,
    /\b(create|drop)\s+(or\s+replace\s+)?function\s+auth\./i,
    /\b(insert\s+into|update|delete\s+from)\s+auth\.users\b/i,
    /\bcreate\s+policy\b[\s\S]*?\bon\s+auth\./i,
    /\bgrant\b[\s\S]*?\bon\s+auth\./i,
    /\b(create|drop)\s+trigger\b[\s\S]*?\bon\s+auth\./i,
  ];
  if (authCore.some((re) => re.test(code))) {
    risk("auth-core-change", "modifies auth-core (auth schema) objects — auth.users / auth functions / policies / grants / triggers");
  }

  // (c) filename convention — STRUCTURAL, added files only.
  if (isAdded && !FILENAME_RE.test(base)) {
    structural(
      "filename-convention",
      `filename does not match §16 YYYYMMDDHHMMSS_snake_case.sql: ${base}`,
    );
  }

  // (d) version collision — STRUCTURAL, added files only.
  if (isAdded) {
    const v = versionOf(base);
    if (!v) {
      structural("version-unparseable", `cannot parse a version prefix from ${base}`);
    } else {
      if (baseVersions.has(v)) {
        structural(
          "version-already-applied",
          `version ${v} already exists on the base branch (re-run hazard — reusing an applied migration version)`,
        );
      }
      if ((addedVersionCounts.get(v) || 0) > 1) {
        structural("version-duplicate-in-pr", `version ${v} is used by more than one added migration in this PR`);
      }
    }
  }

  return { errors, notices, gated };
}

// ── git-backed PR-diff runner ──────────────────────────────────────────────
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
function listSql(out) {
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("supabase/migrations/") && s.endsWith(".sql"));
}

function runDiff() {
  const base = process.env.BASE_SHA || process.env.BASE_REF || "origin/main";
  const range = `${base}...HEAD`;
  let changed, addedList, baseFilesOut;
  try {
    changed = listSql(git(["diff", "--diff-filter=AMR", "--name-only", range, "--", "supabase/migrations"]));
    addedList = listSql(git(["diff", "--diff-filter=AR", "--name-only", range, "--", "supabase/migrations"]));
  } catch (e) {
    console.error(`::error::migration-safety could not diff against ${base}: ${e.message}`);
    process.exit(2);
  }
  try {
    baseFilesOut = git(["ls-tree", "-r", "--name-only", base, "--", "supabase/migrations"]);
  } catch {
    baseFilesOut = ""; // base has no migrations dir yet
  }
  const baseVersions = new Set(listSql(baseFilesOut).map(versionOf).filter(Boolean));
  const addedSet = new Set(addedList);
  const addedVersionCounts = new Map();
  for (const f of addedSet) {
    const v = versionOf(f);
    if (v) addedVersionCounts.set(v, (addedVersionCounts.get(v) || 0) + 1);
  }

  if (changed.length === 0) {
    console.log("migration-safety: no migration files changed in this PR — GREEN.");
    return;
  }

  let errorCount = 0;
  console.log(`migration-safety: checking ${changed.length} changed migration file(s) against base ${base}\n`);
  for (const f of changed) {
    const raw = readFileSync(f, "utf8");
    const { errors, notices, gated } = analyzeMigration({
      filename: f,
      raw,
      isAdded: addedSet.has(f),
      baseVersions,
      addedVersionCounts,
    });
    const tag = gated ? " [human-gated]" : "";
    console.log(`• ${f}${tag}`);
    for (const n of notices) console.log(`  ::notice file=${f}::[${n.id}] ${n.msg}`);
    for (const er of errors) {
      console.log(`  ::error file=${f}::[${er.id}] ${er.msg}`);
      errorCount++;
    }
    if (!errors.length && !notices.length) console.log("  ok");
  }

  if (errorCount > 0) {
    console.log(`\nmigration-safety: RED — ${errorCount} blocking finding(s). Auto-merge is NOT allowed.`);
    console.log("Fix the migration, or (for an intentional, human-reviewed change) add `-- @human-gate-approved`,");
    console.log("open the PR as a draft with the `needs-human-gate` label, and request explicit DI/Chat-Claude approval.");
    process.exit(1);
  }
  console.log("\nmigration-safety: GREEN — all changed migrations pass the static safety gate.");
}

// ── inline self-test (no git, no DB) ───────────────────────────────────────
function selfTest() {
  const baseVersions = new Set(["0001", "20260530120000"]);
  const av = (...vs) => {
    const m = new Map();
    for (const v of vs) m.set(v, (m.get(v) || 0) + 1);
    return m;
  };
  const GUARD = "do $$ begin if (select count(*) from public.t) > 0 then raise exception 'x'; end if; end $$;";
  const ROLL = "-- ROLLBACK\n-- alter table public.t drop column y;";
  const cases = [
    {
      name: "additive add-column with rollback → GREEN",
      a: { filename: "supabase/migrations/20260601000000_add_col.sql", raw: `alter table public.t add column y text;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000000") },
      expectErrors: [],
    },
    {
      name: "guarded drop with rollback → GREEN",
      a: { filename: "supabase/migrations/20260601000100_drop_t.sql", raw: `${GUARD}\ndrop table if exists public.t cascade;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000100") },
      expectErrors: [],
    },
    {
      name: "drop without guard → RED",
      a: { filename: "supabase/migrations/20260601000200_drop_unguarded.sql", raw: `drop table public.t;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000200") },
      expectErrors: ["drop-without-zero-row-guard"],
    },
    {
      name: "missing rollback → RED",
      a: { filename: "supabase/migrations/20260601000300_no_rollback.sql", raw: `alter table public.t add column y text;`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000300") },
      expectErrors: ["missing-rollback"],
    },
    {
      name: "bad filename → RED (structural)",
      a: { filename: "supabase/migrations/0099_bad_name.sql", raw: `alter table public.t add column y text;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("0099") },
      expectErrors: ["filename-convention"],
    },
    {
      name: "version already on base → RED (structural)",
      a: { filename: "supabase/migrations/20260530120000_reuse.sql", raw: `alter table public.t add column y text;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260530120000") },
      expectErrors: ["version-already-applied"],
    },
    {
      name: "permissive using(true) → RED",
      a: { filename: "supabase/migrations/20260601000400_rls.sql", raw: `create policy p on public.t for select to authenticated using (true);\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000400") },
      expectErrors: ["rls-permissive-true"],
    },
    {
      name: "to anon → RED",
      a: { filename: "supabase/migrations/20260601000500_anon.sql", raw: `create policy p on public.t for select to anon using (owner = auth.uid());\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000500") },
      expectErrors: ["rls-to-anon"],
    },
    {
      name: "auth-core change → RED",
      a: { filename: "supabase/migrations/20260601000600_auth.sql", raw: `alter table auth.users add column z text;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000600") },
      expectErrors: ["auth-core-change"],
    },
    {
      name: "human-gated unguarded drop → risk bypassed, GREEN at job level",
      a: { filename: "supabase/migrations/20260601000700_gated.sql", raw: `-- @human-gate-approved\ndrop table public.t;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000700") },
      expectErrors: [],
    },
    {
      name: "human-gate does NOT excuse bad filename (structural still RED)",
      a: { filename: "supabase/migrations/0100_gated_badname.sql", raw: `-- @human-gate-approved\ndrop table public.t;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("0100") },
      expectErrors: ["filename-convention"],
    },
    {
      name: "to public with restrictive predicate → GREEN (notice only)",
      a: { filename: "supabase/migrations/20260601000800_pub.sql", raw: `create policy p on public.t for select to public using (owner = auth.uid());\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260601000800") },
      expectErrors: [],
    },
    {
      name: "modified legacy file (not added) skips filename/version checks",
      a: { filename: "supabase/migrations/0001_initial_schema.sql", raw: `${GUARD}\ndrop table if exists public.t cascade;\n${ROLL}`, isAdded: false, baseVersions, addedVersionCounts: av() },
      expectErrors: [],
    },
  ];

  let pass = 0,
    fail = 0;
  for (const c of cases) {
    const { errors } = analyzeMigration(c.a);
    const got = errors.map((e) => e.id).sort();
    const want = [...c.expectErrors].sort();
    const ok = got.length === want.length && got.every((id, i) => id === want[i]);
    if (ok) {
      pass++;
      console.log(`  PASS  ${c.name}`);
    } else {
      fail++;
      console.log(`  FAIL  ${c.name}\n        want [${want}] got [${got}]`);
    }
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();
else runDiff();
