// migration-ledger-parity.mjs — READ-ONLY check that the repo's migration files
// and the production migration ledger describe the same history.
//
// WHY. The Supabase GitHub "Preview" check compares ledger VERSIONS with repo
// filename prefixes. Production migrations are applied through the Supabase MCP
// `apply_migration`, which stamps the APPLY time as the version (e.g.
// 20261012192944) while the file keeps its authored prefix (20261012190000_…).
// Versions therefore never match, by construction, and the check fails on every
// commit. Rewriting the ledger or renaming frozen files would be a history
// rewrite (owner: forbidden). This tool answers the real question instead:
// does every repo migration have its applied twin, by NAME and by CONTENT?
//
// HOW (no credentials, no network, no writes):
//   1. `--emit-sql` prints ONE constant read-only SELECT over
//      `supabase_migrations.schema_migrations`: version, name and a content
//      fingerprint of `statements`. Run it with the official Supabase MCP
//      `execute_sql` — no new role, grant, function or table.
//   2. `--evaluate <ledger.json>` pairs that answer with the repo files locally.
//
// FINGERPRINT (identical on both sides): drop `--` line comments, drop all
// whitespace, lower-case, drop a leading `begin;` and a trailing `commit;`, md5.
// RULES: MATCH = same name AND same content; CONTENT_ONLY = same content under
// another ledger name (legacy naming); DIFFERS = one ledger row by name, content
// differs (applied body edited, or file edited after apply — review by hand);
// UNKNOWN = several ledger rows share the name and none has the same content;
// NOT_APPLIED = no ledger row by name or content; LEDGER_ONLY = applied, no file.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "supabase", "migrations");

export function normalize(sql) {
  let s = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, "").toLowerCase();
  s = s.replace(/^begin;/, "").replace(/commit;$/, "");
  return s;
}
export const md5 = (s) => createHash("md5").update(s).digest("hex");

export function repoMigrations() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const stem = f.replace(/\.sql$/, "");
      const suffix = stem.replace(/^\d+_/, "");
      const body = normalize(readFileSync(join(DIR, f), "utf8"));
      return { file: f, stem, suffix, fp: md5(body), body };
    });
}

/** THE read-only ledger query (constant; no literals, no writes). */
export const LEDGER_SQL = String.raw`select json_agg(json_build_object('v', version, 'n', coalesce(name, ''), 'f', left(md5(
  regexp_replace(regexp_replace(lower(regexp_replace(regexp_replace(
    array_to_string(statements, E'\n'), '--[^\n]*', '', 'g'), '\s+', '', 'g')),
    '^begin;', ''), 'commit;$', '')), 16)) order by version) as ledger
from supabase_migrations.schema_migrations;`;

/**
 * Pair every repo file with the ledger. `ledger` = [{ v, n, f }] (f = first 16
 * hex of the normalized-content md5).
 */
export function evaluate(ledger, rows = repoMigrations()) {
  const report = { MATCH: [], CONTENT_ONLY: [], DIFFERS: [], NOT_APPLIED: [], UNKNOWN: [], LEDGER_ONLY: [] };
  const used = new Set();
  for (const r of rows) {
    const fp = r.fp.slice(0, 16);
    const byName = ledger.filter((l) => l.n === r.stem || l.n === r.suffix);
    const byContent = ledger.filter((l) => l.f === fp);
    const exact = byName.find((l) => l.f === fp);
    if (exact) {
      report.MATCH.push({ file: r.file, version: exact.v });
      used.add(exact.v);
    } else if (byContent.length === 1) {
      // Same content applied under another name (legacy naming) — still the same migration.
      report.CONTENT_ONLY.push({ file: r.file, version: byContent[0].v, name: byContent[0].n });
      used.add(byContent[0].v);
    } else if (byName.length === 1) {
      report.DIFFERS.push({ file: r.file, version: byName[0].v, name: byName[0].n });
      used.add(byName[0].v);
    } else if (byName.length > 1) {
      report.UNKNOWN.push({ file: r.file, candidates: byName.map((l) => l.v) });
      byName.forEach((l) => used.add(l.v));
    } else {
      report.NOT_APPLIED.push({ file: r.file });
    }
  }
  for (const l of ledger) if (!used.has(l.v)) report.LEDGER_ONLY.push({ version: l.v, name: l.n });
  return report;
}

/**
 * Compact one-shot check: the repo's fingerprints travel as literals (index +
 * 16 hex each, a few KB); production answers ONLY what does not pair by
 * content. Still a single read-only SELECT.
 */
export function checkSql(rows = repoMigrations()) {
  const values = rows.map((r, i) => `(${i},'${r.fp.slice(0, 16)}')`).join(",");
  return String.raw`with repo(i, f) as (values ${values}),
l as (select version v, coalesce(name,'') n, left(md5(regexp_replace(regexp_replace(lower(regexp_replace(regexp_replace(
  array_to_string(statements, E'\n'), '--[^\n]*', '', 'g'), '\s+', '', 'g')), '^begin;', ''), 'commit;$', '')), 16) f
  from supabase_migrations.schema_migrations)
select json_build_object(
  'repo_unmatched', (select json_agg(i order by i) from repo where not exists (select 1 from l where l.f = repo.f)),
  'ledger_unmatched', (select json_agg(json_build_object('v', v, 'n', n, 'f', f) order by v) from l where not exists (select 1 from repo where repo.f = l.f))
) as check;`;
}

/** Turn the compact answer into the same classification, by name for the leftovers. */
export function evaluateCheck(answer, rows = repoMigrations()) {
  const c = answer?.check ?? answer?.[0]?.check ?? answer;
  const unmatched = new Set(c.repo_unmatched ?? []);
  const ledgerLeft = c.ledger_unmatched ?? [];
  const report = { MATCH: [], DIFFERS: [], UNKNOWN: [], NOT_APPLIED: [], LEDGER_ONLY: [] };
  const usedLedger = new Set();
  rows.forEach((r, i) => {
    if (!unmatched.has(i)) return report.MATCH.push({ file: r.file });
    const byName = ledgerLeft.filter((l) => l.n === r.stem || l.n === r.suffix);
    if (byName.length === 1) {
      report.DIFFERS.push({ file: r.file, version: byName[0].v, name: byName[0].n });
      usedLedger.add(byName[0].v);
    } else if (byName.length > 1) {
      report.UNKNOWN.push({ file: r.file, candidates: byName.map((l) => l.v) });
      byName.forEach((l) => usedLedger.add(l.v));
    } else report.NOT_APPLIED.push({ file: r.file });
  });
  for (const l of ledgerLeft) if (!usedLedger.has(l.v)) report.LEDGER_ONLY.push({ version: l.v, name: l.n });
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = process.argv[2];
  if (arg === "--emit-check-sql") {
    process.stdout.write(`${checkSql()}
`);
  } else if (arg === "--evaluate-check" && process.argv[3]) {
    const report = evaluateCheck(JSON.parse(readFileSync(process.argv[3], "utf8")));
    const counts = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify({ counts, ...report, MATCH: undefined }, null, 2));
    process.exitCode = report.DIFFERS.length + report.UNKNOWN.length > 0 ? 2 : 0;
  } else if (arg === "--emit-sql") {
    process.stdout.write(`${LEDGER_SQL}\n`);
  } else if (arg === "--evaluate" && process.argv[3]) {
    const raw = JSON.parse(readFileSync(process.argv[3], "utf8"));
    const ledger = raw.ledger ?? raw[0]?.ledger ?? raw;
    const report = evaluate(ledger);
    const counts = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify({ counts, ...report }, null, 2));
    process.exitCode = report.DIFFERS.length + report.UNKNOWN.length > 0 ? 2 : 0;
  } else {
    console.error("usage: migration-ledger-parity.mjs --emit-sql | --evaluate <result.json>");
    process.exitCode = 64;
  }
}
