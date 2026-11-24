#!/usr/bin/env node
/**
 * PR board — groups open PRs into READY / RED-human-gate / WIP-draft lanes so
 * the owner sees one clear next action, not a mixed pile.
 *
 * Read-only: it never merges, labels, or edits anything. Uses the `gh` CLI
 * (must be authenticated). See docs/policies/pr-queue-hygiene-v1.md.
 *
 *   node scripts/pr-board.mjs
 */
import { execFileSync } from "node:child_process";

const GATE_LABEL = "needs-human-gate";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

let prs;
try {
  prs = JSON.parse(
    gh([
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,title,isDraft,labels,mergeStateStatus",
    ]),
  );
} catch (e) {
  console.error("Could not list PRs via gh. Is the gh CLI authenticated?");
  console.error(String(e.message || e));
  process.exit(2);
}

const hasGate = (pr) => (pr.labels || []).some((l) => l.name === GATE_LABEL);

const ready = [];
const redGate = [];
const wipDraft = [];
for (const pr of prs) {
  if (hasGate(pr) || /^\[RED/i.test(pr.title)) redGate.push(pr);
  else if (pr.isDraft) wipDraft.push(pr);
  else ready.push(pr);
}

const line = (pr) =>
  `  #${pr.number}  ${pr.title}` +
  (pr.mergeStateStatus ? `  (${pr.mergeStateStatus.toLowerCase()})` : "");

const section = (title, list) => {
  console.log(`\n${title} — ${list.length}`);
  if (list.length === 0) console.log("  (none)");
  else for (const pr of list.sort((a, b) => b.number - a.number)) console.log(line(pr));
};

console.log("PR BOARD (open)");
section("✅ READY (mergeable now)", ready);
section("⛔ RED / human-gate (owner decision — agent never merges)", redGate);
section("🚧 WIP draft (still being built)", wipDraft);

console.log("\nNEXT ACTION:");
if (ready.length === 1) {
  console.log(`  Review + merge #${ready[0].number}.`);
} else if (ready.length > 1) {
  console.log(
    `  ${ready.length} ready PRs: ${ready.map((p) => "#" + p.number).join(", ")} — merge oldest-green first.`,
  );
} else if (redGate.length > 0) {
  console.log(
    `  No ready PRs. ${redGate.length} await your gate decision: ${redGate
      .map((p) => "#" + p.number)
      .join(", ")}.`,
  );
} else {
  console.log("  Nothing to do — queue is clean.");
}

// Hygiene warnings: a ready PR must not carry the gate label; a gated PR must
// be a draft. Surfaced (non-fatal) so drift is visible.
const drift = [];
for (const pr of prs) {
  if (hasGate(pr) && !pr.isDraft)
    drift.push(`#${pr.number} has ${GATE_LABEL} but is NOT a draft (RED must stay draft)`);
  if (!hasGate(pr) && /^\[RED/i.test(pr.title))
    drift.push(`#${pr.number} title says [RED…] but lacks the ${GATE_LABEL} label`);
}
if (drift.length) {
  console.log("\n⚠ HYGIENE DRIFT:");
  for (const d of drift) console.log(`  ${d}`);
}
