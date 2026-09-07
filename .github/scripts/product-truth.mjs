#!/usr/bin/env node
// PRODUCT TRUTH — what LabourMarket.ai is, and what is actually true today.
//
// THE AGENT BOOTSTRAP. Run this before making an architectural or product
// change. It is one command, it needs no network, no database and no
// credentials, and it prints the things a new agent cannot get from reading
// code: what the product IS, what it must never be narrowed into, which of its
// ~100 capabilities are real, and which canonical journeys are honestly broken.
//
//   node .github/scripts/product-truth.mjs            # the briefing
//   node .github/scripts/product-truth.mjs --check    # CI: the two halves agree
//   node .github/scripts/product-truth.mjs --broken   # only the broken links
//
// WHY A SCRIPT AND NOT A DOCUMENT. A document is advice. This is the same data
// the guards enforce (`apps/web/lib/guards/capability-register.test.ts`,
// `product-graph-journeys.test.ts`), read from the same files, so the briefing
// cannot drift from what CI will let through. `--check` is the cheap half of
// that enforcement and runs in `quality.yml` beside the product gate.
//
// Deliberately NOT a proof of anything: it reports what the register claims and
// checks the claims that are checkable without a browser or a database. The
// evidence level on each row is the strongest ACTUALLY REACHED, and no part of
// this script can raise one.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const REGISTER = join(ROOT, "apps/web/lib/product-gate/capability-register.ts");
const GRAPH = join(ROOT, "apps/web/lib/product-gate/product-graph.ts");
const JOURNEYS = join(ROOT, "apps/web/lib/product-gate/journey-register.ts");
const SEPARATIONS = join(ROOT, "apps/web/lib/product-gate/semantic-separations.ts");
const INVENTORY = join(ROOT, "docs/CAPABILITY_INVENTORY.md");

const REQUIRED = [REGISTER, GRAPH, JOURNEYS, SEPARATIONS, INVENTORY];

function read(path) {
  if (!existsSync(path)) {
    console.error(`FATAL: ${path.slice(ROOT.length + 1)} is missing.`);
    console.error(
      "The executable product constitution is not optional. If you are removing it,\n" +
        "that is a product decision and belongs at the human gate, not in a refactor.",
    );
    process.exit(2);
  }
  // Normalised to LF. A Windows checkout hands these files back with CRLF, and
  // the structural patterns below anchor on a newline followed by four spaces.
  // On a CRLF working tree the journey register parsed to ZERO journeys and the
  // briefing printed "0 journeys" as if that were the truth — a parser handing
  // back an empty answer for a full file is exactly the SEP-7 failure this
  // register exists to stop. Fixed here, and asserted below so it cannot come
  // back quietly.
  return readFileSync(path, "utf8").split("\r\n").join("\n");
}

for (const f of REQUIRED) read(f);

// ── parse (text, not TS — same approach as product-gate.mjs) ────────────────

const registerSrc = read(REGISTER);
const graphSrc = read(GRAPH);
const journeySrc = read(JOURNEYS);
const separationSrc = read(SEPARATIONS);
const inventorySrc = read(INVENTORY);

const capabilities = [...registerSrc.matchAll(
  /id: "([A-Z]+-\d+)",\s*\n\s*domain: "([a-z_]+)",\s*\n(?:\s*internal: true,\s*\n)?\s*title: "((?:[^"\\]|\\.)*)",[\s\S]*?status: "([A-Z_]+)",\s*\n\s*strongestEvidence: "([A-Z_]+)",/g,
)].map((m) => ({ id: m[1], domain: m[2], title: m[3], status: m[4], evidence: m[5] }));

const nodes = [...graphSrc.matchAll(/\n    id: "([a-z_]+)",\n    name: "([^"]+)",/g)].map((m) => ({
  id: m[1],
  name: m[2],
}));

const journeys = [...journeySrc.matchAll(/\n    id: "(J-[A-Z-]+)",\n    actor: "([a-z]+)",\n    title:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => ({
  id: m[1],
  actor: m[2],
  title: m[3],
}));

const links = [...journeySrc.matchAll(/step:\s*\n?\s*"((?:[^"\\]|\\.)*)",[\s\S]*?link: "([A-Z_]+)"/g)].map((m) => ({
  step: m[1],
  link: m[2],
}));

const separations = [...separationSrc.matchAll(/id: "(SEP-\d+)",\s*\n\s*separates: \[([\s\S]*?)\]/g)].map((m) => ({
  id: m[1],
  separates: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join(" ≠ "),
}));

const forbidden = [...graphSrc.matchAll(/\{ to: "([^"]+)", wouldRequire: "((?:[^"\\]|\\.)*)" \}/g)].map((m) => ({
  to: m[1],
  why: m[2],
}));

// Row-by-row, never across rows: a span-matching regex would attribute one
// capability's owner decision to an earlier capability, which is exactly the
// kind of quiet wrong answer this whole register exists to stop.
const ownerDecisions = registerSrc
  .split(/\n  \{\n/)
  .map((chunk) => {
    const id = /^\s*id: "([A-Z]+-\d+)",/m.exec(chunk);
    const decision = /ownerDecision:\s*\n?\s*"((?:[^"\\]|\\.)*)",/.exec(chunk);
    return id && decision ? { id: id[1], decision: decision[1].replace(/\s+/g, " ") } : null;
  })
  .filter((x) => x !== null);

// ── --check: the two halves of the register may not drift ──────────────────

if (process.argv.includes("--check")) {
  const sectionSix = inventorySrc.slice(inventorySrc.indexOf("## 6. CANONICAL MASTER PRODUCT REGISTER"));
  const documented = [...sectionSix.matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((m) => m[1]);
  const registered = capabilities.map((c) => c.id);

  const problems = [];
  // A parse that comes back empty is a BROKEN PARSER, never a small product.
  // UNKNOWN is not ZERO (SEP-7): every one of these files is known to hold
  // rows, so an empty read is this script failing, and it must say so instead
  // of printing a confident zero.
  if (capabilities.length === 0) problems.push("the machine register parsed to zero capabilities");
  if (documented.length === 0) problems.push("docs/CAPABILITY_INVENTORY.md §6 parsed to zero capabilities");
  if (nodes.length === 0) problems.push("the product graph parsed to zero nodes");
  if (journeys.length === 0) problems.push("the journey register parsed to zero journeys");
  if (links.length === 0) problems.push("the journey register parsed to zero links");
  if (separations.length === 0) problems.push("the semantic separations parsed to zero rules");
  if (forbidden.length === 0) problems.push("the forbidden-reductions list parsed to zero entries");
  for (const id of documented) if (!registered.includes(id)) problems.push(`§6 documents ${id}; the machine register does not`);
  for (const id of registered) if (!documented.includes(id)) problems.push(`the machine register holds ${id}; §6 does not`);

  if (problems.length > 0) {
    console.error("PRODUCT TRUTH: the register's two halves disagree.\n");
    for (const p of problems) console.error(`  · ${p}`);
    console.error(
      "\nA capability may not exist in prose alone, and may not leave the product by\n" +
        "being dropped from one file. Fix both halves, or record a retirement.",
    );
    process.exit(1);
  }
  console.log(`PRODUCT TRUTH: register halves agree — ${registered.length} capabilities, ${nodes.length} graph nodes, ${journeys.length} journeys.`);
  process.exit(0);
}

// ── the briefing ────────────────────────────────────────────────────────────

const brokenOnly = process.argv.includes("--broken");
const count = (status) => capabilities.filter((c) => c.status === status).length;
const pad = (s, n) => String(s).padEnd(n);

if (!brokenOnly) {
  console.log(`
LABOURMARKET.AI — PRODUCT TRUTH
===============================

WHAT THIS PRODUCT IS
  A living global labour/work graph: people, real work, skills, experience,
  evidence, qualifications, organizations, teams, projects, sites, tasks,
  services, availability, time, capacity, current and future demand,
  education, jurisdictions, mobility, market signals and commercial
  opportunities — one graph, ${nodes.length} nodes.

  REAL WORK → EVIDENCE → CAPABILITY → CAPACITY → DEMAND → MATCH → EXECUTION
  → VERIFIED RESULT → LIVING HISTORY → BETTER DECISION.

WHAT IT MUST NEVER BE NARROWED INTO
  Each of these is ONE EDGE of that graph. A task may work on one edge; it may
  never redefine the product as that edge.`);
  for (const f of forbidden) console.log(`  · ${pad(f.to, 28)} would require ${f.why}`);

  console.log(`
DISTINCTIONS THAT MAY NEVER COLLAPSE (each has collapsed before)`);
  for (const s of separations) console.log(`  ${pad(s.id, 7)} ${s.separates}`);

  console.log(`
CAPABILITY TRUTH — ${capabilities.length} registered
  BUILT_AND_USABLE      ${count("BUILT_AND_USABLE")}
  PARTIAL               ${count("PARTIAL")}
  BUILT_NOT_CONNECTED   ${count("BUILT_NOT_CONNECTED")}
  BLOCKED               ${count("BLOCKED")}
  ARCHITECTURE_ONLY     ${count("ARCHITECTURE_ONLY")}
  MISSING               ${count("MISSING")}

  Human-UI-proven: ${capabilities.filter((c) => c.evidence === "HUMAN_UI_PROVEN").length}. Everything else is weaker evidence than a
  person using it. A green unit suite is TEST_PROVEN and nothing more.`);
}

console.log(`
CANONICAL JOURNEYS — ${links.filter((l) => l.link === "LIVE").length} live links, ${links.filter((l) => l.link !== "LIVE").length} honestly broken or unbuilt`);
for (const j of journeys) console.log(`  ${pad(j.id, 24)} ${j.title}`);

console.log(`
  Broken and unbuilt links (the real backlog):`);
for (const l of links) {
  if (l.link === "LIVE") continue;
  console.log(`  ${pad(l.link, 10)} ${l.step}`);
}

if (!brokenOnly) {
  console.log(`
OPEN OWNER DECISIONS — ${ownerDecisions.length}. None of these may be resolved by an agent.`);
  for (const d of ownerDecisions) console.log(`  ${pad(d.id, 8)} ${d.decision}`);

  console.log(`
BEFORE YOU CHANGE ANYTHING
  1. docs/ARCHITECTURE.md          — the canonical entry point, §7 process
  2. docs/PRODUCT_CONSTITUTION.md  — axioms, the graph (§14), separations (§15),
                                     journeys (§16), and what is NOT machine-
                                     checkable (§17)
  3. docs/CAPABILITY_INVENTORY.md  — §6, the master register (human half)
  4. Two review questions, not one:
       (A) did we break something that worked?
       (B) did we make impossible something the architecture allowed?
     A change can pass every test and still fail (B).
`);
}
