#!/usr/bin/env node
// migration-safety.mjs — static, secret-free, NO-DB safety gate for the
// Auto-merge Safety Envelope (AGENTS.md → "GREEN / RED merge tiers").
//
// THIS IS THE LOAD-BEARING CONTROL for conditional prod-apply autonomy
// (governance 2026-06-12). The executing agent may self-apply a merged
// migration to prod ONLY when this gate classifies it GREEN, so a missed RED
// pattern is a production-safety hole. The classifier therefore FAILS CLOSED:
// any unrecognized statement shape is RED by default, never GREEN.
//
// For each supabase/migrations/*.sql file ADDED or MODIFIED in a PR diff, it
// fails the job (RED class) when a risky pattern is present WITHOUT an explicit
// `-- @human-gate-approved` annotation:
//   (a) drop table/column/function not preceded by a 0-row assertion guard
//   (b) missing reversible rollback block (down / commented recreate)
//   (e) RLS-loosening: using/with check (true), to anon, grant to anon/public
//   (f) changes to auth-core (auth-schema) objects
//   (g) CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER (new or swap) —
//       bypasses RLS, must be human-reviewed (this is the class the gate
//       MISSED on PR #322 and the reason for this upgrade)
//   (h) any GRANT or REVOKE — privilege-surface change
//   (i) ALTER ... OWNER TO — ownership change
//   (j) ALTER POLICY / DROP POLICY — RLS policy change
//   (k) SET ROLE — in-migration privilege switch
//   (l) ALTER COLUMN SET/DROP NOT NULL — narrows/loosens a column guarantee
//   (m) bare DROP CONSTRAINT with no matching ADD CONSTRAINT — removes a CHECK
//       (the drop+re-add idiom that WIDENS a CHECK, e.g. the ru-locale list,
//       stays GREEN — that is why this only fires when no ADD CONSTRAINT
//       appears in the same file)
//   (n) UPDATE / DELETE of data — mutates existing rows
//   (o) other dangerous shapes hiding under a safe leading keyword:
//       DISABLE ROW LEVEL SECURITY, ALTER DEFAULT PRIVILEGES, TRUNCATE,
//       CREATE EXTENSION, CREATE TRIGGER, ALTER TYPE
//   (p) FAIL-CLOSED catch-all: any top-level statement whose leading keyword
//       is not on the recognized allowlist → RED `unrecognized-ddl`
// Three STRUCTURAL checks always hold and are NOT bypassable by the annotation
// (a human gate doesn't make a malformed name, a reused version, or a missing
// rollback FILE safe):
//   (c) filename not matching PLATFORM_DOCTRINE §16 YYYYMMDDHHMMSS_snake_case.sql
//   (d) version prefix already present on the base branch (re-run hazard) or
//       duplicated among the PR's added migrations
//   (q) ADDED migration with no sibling rollback file at
//       supabase/rollbacks/<same-name>.down.sql (governance backfill rule)
//
// NO-DB note: the live prod ledger cannot be queried from a secret-free job, so
// (d) uses the committed base-branch migration set as the static proxy for
// "already in the ledger" (the repo files mirror the ledger). True ledger
// collisions are additionally caught at MCP apply time.
//
// Detection boundary: risk patterns run on EXECUTABLE SQL with comments
// stripped; the fail-closed catch-all additionally strips dollar-quoted
// function bodies and single-quoted string literals before splitting on `;`,
// so a `;` inside a string or a PL/pgSQL body never spoofs a statement.
// Dangerous content INSIDE a function body (e.g. SECURITY DEFINER, an UPDATE)
// is still caught by the whole-file risk patterns above.
//
// Usage:
//   node .github/scripts/migration-safety.mjs            # analyze PR diff
//   node .github/scripts/migration-safety.mjs --self-test # run inline fixtures
//
// Env: BASE_SHA (or BASE_REF) = the PR base to diff against (default origin/main).

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
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

// Strip dollar-quoted bodies ($$...$$ / $tag$...$tag$) and single-quoted
// string literals (with '' escapes) so the fail-closed statement splitter is
// not fooled by a `;` inside a PL/pgSQL body or a string.
function stripBodiesAndStrings(code) {
  return code
    .replace(/\$([a-zA-Z_]*)\$[\s\S]*?\$\1\$/g, " $$BODY$$ ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

// Statement leads we recognize. Each is either inherently additive-safe or is
// judged separately by a risk pattern above (grant/revoke/update/delete/drop
// are "recognized" — RED, but not unknown). Anything else is fail-closed RED.
const ALLOWED_LEADS = new Set([
  "begin", "commit", "rollback", "savepoint", "reset",
  "create", "alter", "drop", "grant", "revoke", "comment",
  "insert", "update", "delete", "do", "set", "select", "with", "values",
  // recognized but separately judged RED by an explicit detector above —
  // listed here so the fail-closed catch-all does not double-flag them.
  "truncate",
]);

/**
 * Pure analyzer. Returns { errors:[{id,msg}], notices:[{id,msg}], gated }.
 * @param {{filename:string, raw:string, isAdded:boolean,
 *          baseVersions:Set<string>, addedVersionCounts:Map<string,number>,
 *          rollbackFileExists?:boolean}} a
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

  // ── Upgraded RED patterns (governance 2026-06-12) — the classes the gate
  //    MUST catch now that GREEN can self-apply to prod. Each is a RED risk
  //    (a `-- @human-gate-approved` annotation moves the PR to the RED human
  //    gate; it never makes these GREEN). ────────────────────────────────

  // (g) SECURITY DEFINER function (new or swap) — bypasses RLS.
  if (/\bcreate\s+(or\s+replace\s+)?function\b[\s\S]*?\bsecurity\s+definer\b/i.test(code)) {
    risk(
      "security-definer-function",
      "CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER — bypasses RLS; requires human review",
    );
  }
  // (h) any GRANT / REVOKE — privilege-surface change. (`grant_org_manager`
  //     and similar identifiers are safe: the keyword must be followed by
  //     whitespace, not `_`.)
  if (/(^|;|\s)(grant|revoke)\s+/i.test(code)) {
    risk("grant-or-revoke", "GRANT/REVOKE present — any privilege change is RED");
  }
  // (i) ownership change.
  if (/\balter\s+\w+[\s\S]{0,80}?\sowner\s+to\b/i.test(code)) {
    risk("alter-owner", "ALTER ... OWNER TO — object ownership change");
  }
  // (j) RLS policy mutation/removal (CREATE POLICY is normal and stays GREEN).
  if (/\b(alter|drop)\s+policy\b/i.test(code)) {
    risk("alter-drop-policy", "ALTER/DROP POLICY — RLS policy change");
  }
  // (k) in-migration privilege switch.
  if (/\bset\s+role\b/i.test(code)) {
    risk("set-role", "SET ROLE — in-migration privilege switch");
  }
  // (l) column-guarantee narrowing/loosening.
  if (/\bset\s+not\s+null\b/i.test(code)) {
    risk("set-not-null", "ALTER COLUMN ... SET NOT NULL — narrows the column (can fail on existing rows)");
  }
  if (/\bdrop\s+not\s+null\b/i.test(code)) {
    risk("drop-not-null", "ALTER COLUMN ... DROP NOT NULL — removes a guarantee");
  }
  // (m) bare constraint removal. The WIDENING idiom (drop + re-add a CHECK in
  //     the same file, e.g. extending an IN-list) is GREEN; a drop with no
  //     matching add removes a guarantee → RED.
  if (/\bdrop\s+constraint\b/i.test(code) && !/\badd\s+constraint\b/i.test(code)) {
    risk("drop-constraint-bare", "DROP CONSTRAINT with no matching ADD CONSTRAINT — removes a data guarantee");
  }
  // (n) data DML. Statement-leading match (with `m`) so `grant update`,
  //     `for update`, and policy text never trip it; a mutating function body
  //     statement does (and that is correct — it is also RED).
  if (/(^|;)\s*(update|delete\s+from)\s+\w/im.test(code)) {
    risk("data-dml", "UPDATE/DELETE of data — mutates existing rows");
  }
  // (o) dangerous shapes that hide under a safe leading keyword.
  if (/\bdisable\s+row\s+level\s+security\b/i.test(code)) {
    risk("disable-rls", "DISABLE ROW LEVEL SECURITY — turns off RLS on a table");
  }
  if (/\balter\s+default\s+privileges\b/i.test(code)) {
    risk("alter-default-privileges", "ALTER DEFAULT PRIVILEGES — changes future-object grants");
  }
  if (/\btruncate\b/i.test(code)) {
    risk("truncate", "TRUNCATE — bulk row removal (not subject to RLS)");
  }
  if (/\bcreate\s+extension\b/i.test(code)) {
    risk("create-extension", "CREATE EXTENSION — installs server-side code");
  }
  if (/\bcreate\s+(or\s+replace\s+)?trigger\b/i.test(code)) {
    risk("create-trigger", "CREATE TRIGGER — installs behavior that fires on writes");
  }
  if (/\balter\s+type\b/i.test(code)) {
    risk("alter-type", "ALTER TYPE — enum/type change can break dependents");
  }

  // (p) FAIL-CLOSED catch-all. Split top-level statements (dollar bodies and
  //     string literals removed first) and RED any whose leading keyword is
  //     not recognized. False positives here are acceptable by design —
  //     reclassification only goes in the cautious direction (RED → human
  //     review), never the reverse.
  const statements = stripBodiesAndStrings(code)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknownLeads = new Set();
  for (const stmt of statements) {
    const lead = (stmt.match(/^[a-zA-Z]+/) || [""])[0].toLowerCase();
    if (lead && !ALLOWED_LEADS.has(lead)) unknownLeads.add(lead);
  }
  if (unknownLeads.size > 0) {
    risk(
      "unrecognized-ddl",
      `unrecognized statement shape(s) [${[...unknownLeads].sort().join(", ")}] — fail-closed RED; if intentional, human-gate it`,
    );
  }

  // (q) rollback FILE — STRUCTURAL, added files only. Every new migration must
  //     ship supabase/rollbacks/<name>.down.sql (governance 2026-06-12). The
  //     in-file `-- ROLLBACK` comment (b) is necessary but no longer enough.
  if (isAdded && a.rollbackFileExists === false) {
    structural(
      "missing-rollback-file",
      `no rollback file at supabase/rollbacks/${base.replace(/\.sql$/, ".down.sql")} (required for every added migration)`,
    );
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
    const downFile = `supabase/rollbacks/${basename(f).replace(/\.sql$/, ".down.sql")}`;
    const { errors, notices, gated } = analyzeMigration({
      filename: f,
      raw,
      isAdded: addedSet.has(f),
      baseVersions,
      addedVersionCounts,
      rollbackFileExists: existsSync(downFile),
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

    // ── Governance 2026-06-12 — upgraded RED patterns + the two canonical
    //    fixtures named in the DI decision. ─────────────────────────────────

    // CANONICAL GREEN — PR #321 ru-locale CHECK widening: drop + re-add a
    // CHECK with a wider IN-list (drop-constraint-bare must NOT fire because an
    // ADD CONSTRAINT is present), no grants, no function, no data DML.
    {
      name: "CANONICAL GREEN: PR #321 original_language CHECK widening",
      a: {
        filename: "supabase/migrations/20260612130000_widen_original_language_ru.sql",
        raw:
          "alter table public.journal_entries drop constraint if exists journal_entries_original_language_chk;\n" +
          "alter table public.journal_entries add constraint journal_entries_original_language_chk check (original_language in ('en','lt','ru')) not valid;\n" +
          "alter table public.journal_entries validate constraint journal_entries_original_language_chk;\n" +
          "-- ROLLBACK: re-add the narrower set",
        isAdded: true, baseVersions, addedVersionCounts: av("20260612130000"),
        rollbackFileExists: true,
      },
      expectErrors: [],
    },
    // CANONICAL RED — PR #322 conversation participant revocation: a function
    // swapped to SECURITY DEFINER plus REVOKE/GRANT. This is the class the
    // gate MISSED before this upgrade. (Sorted ids: grant-or-revoke,
    // security-definer-function.)
    {
      name: "CANONICAL RED: PR #322 SECURITY DEFINER swap + grant hardening",
      a: {
        filename: "supabase/migrations/20260612170000_conversation_participant_revocation.sql",
        raw:
          "create or replace function public.is_conversation_participant(p uuid)\n" +
          "returns boolean language sql security definer set search_path = public stable as $$\n" +
          "  select exists (select 1 from public.conversation_participants cp where cp.conversation_id = p and cp.profile_id = auth.uid() and cp.revoked_at is null);\n" +
          "$$;\n" +
          "revoke all on public.conversations from anon, public;\n" +
          "grant select, insert on public.conversations to authenticated;\n" +
          "-- ROLLBACK: restore prior grants + invoker function",
        isAdded: true, baseVersions, addedVersionCounts: av("20260612170000"),
        rollbackFileExists: true,
      },
      expectErrors: ["grant-or-revoke", "security-definer-function"],
    },

    // Per-pattern RED fixtures (each fires exactly one new id).
    {
      name: "SECURITY DEFINER function alone → RED",
      a: { filename: "supabase/migrations/20260613000000_definer.sql", raw: `create function public.f() returns int language sql security definer as $$ select 1 $$;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000000"), rollbackFileExists: true },
      expectErrors: ["security-definer-function"],
    },
    {
      name: "bare GRANT → RED",
      a: { filename: "supabase/migrations/20260613000100_grant.sql", raw: `grant select on public.t to authenticated;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000100"), rollbackFileExists: true },
      expectErrors: ["grant-or-revoke"],
    },
    {
      name: "ALTER POLICY → RED",
      a: { filename: "supabase/migrations/20260613000200_alterpolicy.sql", raw: `alter policy p on public.t to authenticated using (owner = auth.uid());\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000200"), rollbackFileExists: true },
      expectErrors: ["alter-drop-policy"],
    },
    {
      name: "ALTER COLUMN SET NOT NULL → RED",
      a: { filename: "supabase/migrations/20260613000300_notnull.sql", raw: `alter table public.t alter column c set not null;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000300"), rollbackFileExists: true },
      expectErrors: ["set-not-null"],
    },
    {
      name: "bare DROP CONSTRAINT (no re-add) → RED",
      a: { filename: "supabase/migrations/20260613000400_dropchk.sql", raw: `alter table public.t drop constraint if exists t_chk;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000400"), rollbackFileExists: true },
      expectErrors: ["drop-constraint-bare"],
    },
    {
      name: "data UPDATE → RED",
      a: { filename: "supabase/migrations/20260613000500_dataupd.sql", raw: `update public.t set c = 1 where id = '00000000-0000-0000-0000-000000000000';\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000500"), rollbackFileExists: true },
      expectErrors: ["data-dml"],
    },
    {
      name: "DISABLE ROW LEVEL SECURITY → RED",
      a: { filename: "supabase/migrations/20260613000600_disablerls.sql", raw: `alter table public.t disable row level security;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000600"), rollbackFileExists: true },
      expectErrors: ["disable-rls"],
    },
    {
      name: "TRUNCATE → RED (fail-closed dangerous shape)",
      a: { filename: "supabase/migrations/20260613000700_trunc.sql", raw: `truncate public.t;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000700"), rollbackFileExists: true },
      expectErrors: ["truncate"],
    },
    {
      name: "unrecognized statement shape → RED (fail-closed catch-all)",
      a: { filename: "supabase/migrations/20260613000800_vacuum.sql", raw: `vacuum analyze public.t;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000800"), rollbackFileExists: true },
      expectErrors: ["unrecognized-ddl"],
    },
    {
      name: "added migration with no .down.sql file → RED (structural)",
      a: { filename: "supabase/migrations/20260613000900_norollbackfile.sql", raw: `alter table public.t add column y text;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613000900"), rollbackFileExists: false },
      expectErrors: ["missing-rollback-file"],
    },
    {
      name: "human-gate moves SECURITY DEFINER + grant to RED-review, not GREEN (no job-level error)",
      a: { filename: "supabase/migrations/20260613001000_gated_definer.sql", raw: `-- @human-gate-approved\ncreate function public.f() returns int language sql security definer as $$ select 1 $$;\ngrant execute on function public.f() to authenticated;\n${ROLL}`, isAdded: true, baseVersions, addedVersionCounts: av("20260613001000"), rollbackFileExists: true },
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
