#!/usr/bin/env node
/**
 * COVERAGE INVENTORY — how much of LabourMarket.ai is analysed, tested and
 * proven in production, with the denominator always printed next to the share.
 *
 *   node .github/scripts/coverage-inventory.mjs          # human table
 *   node .github/scripts/coverage-inventory.mjs --json   # machine output
 *
 * Two independent inventories, never blended into one number:
 *
 *   A. CAPABILITIES — the 111+ rows of `apps/web/lib/product-gate/
 *      capability-register.ts`, per domain. Each row carries the STRONGEST
 *      evidence level actually reached (the owner's ladder). Shares:
 *        analysis   = rows with evidence >= CODE_PROVEN
 *        test       = rows with evidence == TEST_PROVEN or any PRODUCTION_* /
 *                     HUMAN_UI level (the ladder records only the strongest
 *                     level, so a production-proven row is counted as tested;
 *                     that is an upper bound and is labelled as such)
 *        production = rows with evidence >= PRODUCTION_RPC_PROVEN
 *        human UI   = rows with evidence == HUMAN_UI_PROVEN
 *
 *   B. SURFACE — what exists on disk, enumerated mechanically: route pages,
 *      API routes, server-action modules, SQL functions and tables declared by
 *      migrations. For each item: is it NAMED by at least one test file?
 *      "Named by a test" is a reference count, not proof of behaviour — it is
 *      reported as "test-referenced", never as "tested". Surface items have no
 *      production evidence field, so their production share is UNKNOWN, not 0
 *      (SEP-7: UNKNOWN ≠ ZERO).
 *
 * Pure filesystem read. No network, no database, no credentials.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const WEB = join(ROOT, "apps/web");
const REGISTER = join(WEB, "lib/product-gate/capability-register.ts");
const MIGRATIONS = join(ROOT, "supabase/migrations");

function read(path) {
  return readFileSync(path, "utf8").split("\r\n").join("\n");
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (p) => relative(WEB, p).split(sep).join("/");

// ── A. capabilities ─────────────────────────────────────────────────────────

const LADDER = [
  "NONE",
  "CODE_PROVEN",
  "TEST_PROVEN",
  "PRODUCTION_RPC_PROVEN",
  "PRODUCTION_DATA_PATH_PROVEN",
  "PRODUCTION_PERSISTENCE_PROVEN",
  "HUMAN_UI_PROVEN",
];
const rank = (e) => LADDER.indexOf(e);

const capabilities = read(REGISTER)
  .split(/\n  \{\n/)
  .slice(1)
  .map((chunk) => {
    const id = /^\s*id: "([A-Z]+-\d+)",/m.exec(chunk);
    const domain = /^\s*domain: "([a-z_]+)",/m.exec(chunk);
    const status = /^\s*status: "([A-Z_]+)",/m.exec(chunk);
    const evidence = /^\s*strongestEvidence: "([A-Z_]+)",/m.exec(chunk);
    const internal = /^\s*internal: true,/m.test(chunk);
    return id && domain && status && evidence
      ? { id: id[1], domain: domain[1], status: status[1], evidence: evidence[1], internal }
      : null;
  })
  .filter((x) => x !== null);

if (capabilities.length < 100) {
  console.error(`FATAL: parsed ${capabilities.length} capabilities — the parser is broken, not the product.`);
  process.exit(2);
}

function capabilityStats(rows) {
  const n = rows.length;
  const count = (pred) => rows.filter(pred).length;
  return {
    identified: n,
    analysed: count((r) => rank(r.evidence) >= rank("CODE_PROVEN")),
    tested: count((r) => rank(r.evidence) >= rank("TEST_PROVEN")),
    production: count((r) => rank(r.evidence) >= rank("PRODUCTION_RPC_PROVEN")),
    humanUi: count((r) => r.evidence === "HUMAN_UI_PROVEN"),
    working: count((r) => r.status === "BUILT_AND_USABLE"),
    defective: count((r) => ["PARTIAL", "BUILT_NOT_CONNECTED", "BLOCKED"].includes(r.status)),
    unbuilt: count((r) => ["MISSING", "ARCHITECTURE_ONLY"].includes(r.status)),
    untested: count((r) => rank(r.evidence) < rank("TEST_PROVEN")),
  };
}

const live = capabilities.filter((c) => c.status !== "RETIRED");
const domains = [...new Set(live.map((c) => c.domain))];
const byDomain = Object.fromEntries(domains.map((d) => [d, capabilityStats(live.filter((c) => c.domain === d))]));
const capTotal = capabilityStats(live);

// ── B. surface ──────────────────────────────────────────────────────────────

const allWebFiles = walk(WEB).filter((f) => /\.(ts|tsx|mjs)$/.test(f));
const testFiles = allWebFiles.filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f) || rel(f).startsWith("e2e/"));
const testCorpus = testFiles.map(read).join("\n");
const sourceFiles = allWebFiles.filter((f) => !testFiles.includes(f));

function moduleOf(path) {
  const m =
    /^app\/\[locale\]\/dashboard\/([^/]+)/.exec(path) ||
    /^app\/api\/([^/]+)/.exec(path) ||
    /^app\/\[locale\]\/([^/]+)/.exec(path) ||
    /^lib\/([^/]+)/.exec(path) ||
    /^components\/([^/]+)/.exec(path);
  return m ? m[1].replace(/\.(ts|tsx)$/, "") : "(root)";
}

const surface = [];

for (const f of sourceFiles) {
  const p = rel(f);
  if (/^app\/.*\/page\.tsx$/.test(p)) {
    // The URL a test would name: strip the locale segment and route groups.
    const url = p
      .replace(/^app\/\[locale\]/, "")
      .replace(/^app/, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\/\([^)]+\)/g, "");
    const needle = url.replace(/\[[^\]]+\]/g, "").replace(/\/+$/, "") || "/";
    surface.push({ kind: "page", module: moduleOf(p), name: url || "/", referenced: needle !== "/" && testCorpus.includes(needle) });
  } else if (/^app\/api\/.*\/route\.ts$/.test(p)) {
    const url = "/" + p.replace(/^app\//, "").replace(/\/route\.ts$/, "");
    const needle = url.replace(/\/\[[^\]]+\].*$/, "");
    surface.push({ kind: "api", module: moduleOf(p), name: url, referenced: testCorpus.includes(needle) || testCorpus.includes(p) });
  } else {
    const src = read(f);
    if (/^\s*["']use server["'];?/m.test(src.slice(0, 400))) {
      for (const m of src.matchAll(/^export async function (\w+)/gm)) {
        surface.push({ kind: "server_action", module: moduleOf(p), name: m[1], referenced: new RegExp(`\\b${m[1]}\\b`).test(testCorpus) });
      }
    }
  }
}

const sqlFunctions = new Map();
const sqlTables = new Map();
if (existsSync(MIGRATIONS)) {
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const src = read(join(MIGRATIONS, f));
    for (const m of src.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(/gi)) sqlFunctions.set(m[1].toLowerCase(), f);
    for (const m of src.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(/gi)) sqlTables.set(m[1].toLowerCase(), f);
    for (const m of src.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
      // a later create re-adds it; only a trailing drop removes it
      if (sqlFunctions.get(m[1].toLowerCase()) && !new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?"?${m[1]}"?\\s*\\(`, "i").test(src.slice(src.toLowerCase().lastIndexOf(m[0].toLowerCase()))))
        sqlFunctions.delete(m[1].toLowerCase());
    }
    for (const m of src.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) sqlTables.delete(m[1].toLowerCase());
  }
}
for (const name of sqlFunctions.keys()) surface.push({ kind: "sql_function", module: "database", name, referenced: new RegExp(`\\b${name}\\b`).test(testCorpus) });
for (const name of sqlTables.keys()) surface.push({ kind: "sql_table", module: "database", name, referenced: new RegExp(`\\b${name}\\b`).test(testCorpus) });

const kinds = ["page", "api", "server_action", "sql_function", "sql_table"];
const surfaceByKind = Object.fromEntries(
  kinds.map((k) => {
    const items = surface.filter((s) => s.kind === k);
    return [k, { identified: items.length, testReferenced: items.filter((s) => s.referenced).length }];
  }),
);
const surfaceModules = [...new Set(surface.filter((s) => s.kind !== "sql_function" && s.kind !== "sql_table").map((s) => s.module))].sort();
const surfaceByModule = Object.fromEntries(
  surfaceModules.map((m) => {
    const items = surface.filter((s) => s.module === m);
    return [m, { identified: items.length, testReferenced: items.filter((s) => s.referenced).length }];
  }),
);
const surfaceTotal = { identified: surface.length, testReferenced: surface.filter((s) => s.referenced).length };

// ── output ──────────────────────────────────────────────────────────────────

const pct = (a, b) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);

const result = {
  generatedFrom: { register: rel(REGISTER), testFiles: testFiles.length, sourceFiles: sourceFiles.length },
  capabilities: { total: capTotal, byDomain },
  surface: { total: surfaceTotal, byKind: surfaceByKind, byModule: surfaceByModule },
  notInventoried: [
    "apps/mobile (Expo) — not scanned",
    "Edge functions and GitHub workflows — not counted as product functions",
    "Client components without a route or action — counted only through the page that renders them",
    "Production evidence for SURFACE items — no per-item evidence exists; UNKNOWN, not 0",
  ],
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log("LABOURMARKET.AI — COVERAGE INVENTORY");
console.log("====================================\n");
console.log(`A. CAPABILITIES (denominator: ${capTotal.identified} live rows of the capability register)\n`);
console.log("domain               ident  analysed   tested*    production human-UI  working defects unbuilt");
for (const [d, s] of Object.entries(byDomain)) {
  console.log(
    `${d.padEnd(20)} ${String(s.identified).padStart(5)}  ${pct(s.analysed, s.identified).padStart(7)}  ${pct(s.tested, s.identified).padStart(7)}  ${pct(s.production, s.identified).padStart(9)}  ${pct(s.humanUi, s.identified).padStart(7)}  ${String(s.working).padStart(6)} ${String(s.defective).padStart(7)} ${String(s.unbuilt).padStart(7)}`,
  );
}
const t = capTotal;
console.log(
  `${"TOTAL".padEnd(20)} ${String(t.identified).padStart(5)}  ${pct(t.analysed, t.identified).padStart(7)}  ${pct(t.tested, t.identified).padStart(7)}  ${pct(t.production, t.identified).padStart(9)}  ${pct(t.humanUi, t.identified).padStart(7)}  ${String(t.working).padStart(6)} ${String(t.defective).padStart(7)} ${String(t.unbuilt).padStart(7)}`,
);
console.log("  * tested is an upper bound: the ladder stores only the strongest level reached.\n");

console.log(`B. SURFACE (denominator: ${surfaceTotal.identified} items found on disk; production share UNKNOWN)\n`);
for (const [k, s] of Object.entries(surfaceByKind)) {
  console.log(`  ${k.padEnd(14)} ${String(s.identified).padStart(5)} identified   ${String(s.testReferenced).padStart(5)} named by a test (${pct(s.testReferenced, s.identified)})`);
}
console.log(`  ${"TOTAL".padEnd(14)} ${String(surfaceTotal.identified).padStart(5)} identified   ${String(surfaceTotal.testReferenced).padStart(5)} named by a test (${pct(surfaceTotal.testReferenced, surfaceTotal.identified)})\n`);
console.log("  module               items  test-referenced");
for (const [m, s] of Object.entries(surfaceByModule)) {
  console.log(`  ${m.padEnd(20)} ${String(s.identified).padStart(5)}  ${pct(s.testReferenced, s.identified).padStart(7)}`);
}
console.log("\nNOT INVENTORIED");
for (const n of result.notInventoried) console.log(`  · ${n}`);
