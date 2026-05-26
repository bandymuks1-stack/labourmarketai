#!/usr/bin/env tsx
// SR-1 migration safety guard.
// Scans supabase/migrations/*.sql for obviously destructive statements
// that should never enter the additive-only migration ledger without
// explicit owner DB-validation approval. Failing patterns include:
//
//   - drop table / drop column
//   - truncate
//   - delete from
//   - alter column ... type
//   - update <table> WITHOUT a WHERE clause in the same statement
//   - set not null (retro-tightening an existing nullable column)
//
// Per-line allowlist marker: `-- migration-safe-allow: <reason>`. Use
// only when the action is genuinely safe (e.g., dropping a never-created
// shim) and document the reason inline so reviewers see it.
//
// Scope rules:
//   - SECURITY DEFINER function bodies (text between `$$ ... $$`
//     delimiters) are excluded from scanning. Those bodies are stored
//     procedures, not ad-hoc DDL, and their UPDATE/DELETE are gated by
//     the function's input validation + the caller's RLS.
//   - SQL comments (`-- ...`) are stripped before pattern matching.
//   - UPDATE statements are checked on a *statement* basis (split on `;`)
//     so multi-line UPDATE ... WHERE patterns don't trip the WHERE check.
//
// This guard is intentionally narrow. It catches the patterns that have
// historically caused production incidents; other risky shapes (heavy
// long-running ALTERs, lock contention, transaction sizing) still
// require human review.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");

type Hit = { file: string; statementStart: number; text: string; pattern: string };

// Historical allowlist — destructive statements in already-merged
// migrations that the project explicitly accepted at the time. Keyed by
// `<migration-file-basename>:<statement-start-line>`. New entries here
// should be rare and require a code-review pass.
const HISTORICAL_ALLOWLIST = new Set<string>([
  // 0003: profiles.role single-column legacy field dropped when the
  // multi-role profile_roles table replaced it (commit history shows
  // the data was migrated in the same transaction).
  "0003_multi_role.sql:28",
  // 0012: name_lt/name_en/...nl/de/pl/ru columns dropped from
  // professions + skills after a slug/i18n refactor (PR 0010/0011 path).
  "0012_drop_taxonomy_name_columns.sql:1",
  "0012_drop_taxonomy_name_columns.sql:33",
]);

const SIMPLE_PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "drop table", rx: /\bdrop\s+table\b/i },
  { name: "drop column", rx: /\bdrop\s+column\b/i },
  { name: "truncate", rx: /\btruncate\b/i },
  { name: "delete from", rx: /\bdelete\s+from\b/i },
  { name: "alter column type", rx: /\balter\s+column\b[^;]*\btype\b/i },
  { name: "set not null (retro)", rx: /\balter\s+column\b[^;]*\bset\s+not\s+null\b/i },
];

function stripCommentsAndBodies(raw: string): string {
  // Strip line comments first.
  let s = raw.replace(/--[^\n]*/g, "");
  // Strip $$ ... $$ blocks (PL/pgSQL function bodies). Non-greedy.
  s = s.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$");
  return s;
}

type Statement = { line: number; text: string };

function splitStatements(stripped: string): Statement[] {
  // Naive split on `;` is adequate here because we already removed
  // function bodies. Track the starting line number of each statement
  // for the error report.
  const out: Statement[] = [];
  let line = 1;
  let buf = "";
  let stmtStart = line;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "\n") {
      line++;
      buf += ch;
      continue;
    }
    if (ch === ";") {
      const text = buf.trim();
      if (text.length > 0) out.push({ line: stmtStart, text });
      buf = "";
      stmtStart = line;
      continue;
    }
    if (buf.length === 0 && /\s/.test(ch)) {
      stmtStart = line;
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push({ line: stmtStart, text: tail });
  return out;
}

function listMigrations(): string[] {
  try {
    return readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => join(migrationsDir, f))
      .sort();
  } catch {
    return [];
  }
}

const files = listMigrations();
if (files.length === 0) {
  process.stderr.write(
    "SR-1 migration safety guard — no migrations found (path resolution issue?).\n",
  );
  process.exit(1);
}

const hits: Hit[] = [];

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const allowedLines = new Set<number>();
  raw.split(/\r?\n/).forEach((l, i) => {
    if (l.includes("migration-safe-allow")) allowedLines.add(i + 1);
  });

  const stripped = stripCommentsAndBodies(raw);
  const statements = splitStatements(stripped);

  const basename = file.split(/[\\/]/).pop() ?? file;

  for (const stmt of statements) {
    if (allowedLines.has(stmt.line)) continue;
    if (HISTORICAL_ALLOWLIST.has(`${basename}:${stmt.line}`)) continue;

    for (const { name, rx } of SIMPLE_PATTERNS) {
      if (rx.test(stmt.text)) {
        hits.push({
          file: file.replace(repoRoot + "\\", "").replace(repoRoot + "/", ""),
          statementStart: stmt.line,
          text: stmt.text.split(/\n/)[0].slice(0, 120),
          pattern: name,
        });
      }
    }

    // UPDATE statement — must contain WHERE somewhere in the statement.
    // (Statement-level check, so multi-line UPDATE ... WHERE is fine.)
    if (/^\s*update\b/i.test(stmt.text) && !/\bwhere\b/i.test(stmt.text)) {
      hits.push({
        file: file.replace(repoRoot + "\\", "").replace(repoRoot + "/", ""),
        statementStart: stmt.line,
        text: stmt.text.split(/\n/)[0].slice(0, 120),
        pattern: "update without WHERE",
      });
    }
  }
}

if (hits.length) {
  process.stderr.write(
    "\nSR-1 migration safety guard — destructive patterns detected:\n\n",
  );
  for (const h of hits) {
    process.stderr.write(`  ${h.file}:${h.statementStart}  [${h.pattern}]\n`);
    process.stderr.write(`    ${h.text}\n`);
  }
  process.stderr.write(
    `\nIf the action is genuinely safe, add an inline\n` +
      `\`-- migration-safe-allow: <reason>\` comment on the same line\n` +
      `as the statement's first line. Otherwise rewrite as additive.\n` +
      `Total hits: ${hits.length}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `SR-1 migration safety guard — clean (${files.length} migrations scanned).\n`,
);
