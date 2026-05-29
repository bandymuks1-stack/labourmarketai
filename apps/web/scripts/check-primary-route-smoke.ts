#!/usr/bin/env tsx
// Primary route smoke / dead-UI QA guard — owner-facing report + CI gate.
//
// Runs the same pure scan that lib/guards/primary-route-smoke.test.ts uses
// (scanPrimaryRouteSmoke) and writes a human-readable owner report plus a
// machine-readable inventory under the gitignored runtime/ tree:
//
//   runtime/project-quality/primary-route-smoke-report.md
//   runtime/project-quality/primary-route-smoke-report.html
//   runtime/project-quality/primary-route-smoke-inventory.json
//
// Exits non-zero if any BLOCKING finding exists (dead link, copy leak, missing
// primary route), so it doubles as a CI gate — mirroring placeholders:check.
//
// Run from the web workspace:
//   pnpm -F web check:primary-route-smoke
//
// No network, no env reads, no DB. Only reads source + writes the runtime report.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  blockingFindings,
  scanPrimaryRouteSmoke,
  type Finding,
  type InventoryRow,
  type SmokeReport,
} from "../lib/guards/primary-route-smoke";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, ".."); // apps/web
const repoRoot = resolve(here, "..", "..", ".."); // repo root
const outDir = resolve(repoRoot, "runtime", "project-quality");

function findingsByCategory(findings: readonly Finding[], cat: Finding["category"]): readonly Finding[] {
  return findings.filter((f) => f.category === cat);
}

function mdFindingList(findings: readonly Finding[]): string {
  if (findings.length === 0) return "_None — clean._\n";
  return findings.map((f) => `- \`${f.file}:${f.line}\` — \`${f.evidence}\` — ${f.why}`).join("\n") + "\n";
}

function mdInventoryList(rows: readonly InventoryRow[], limit = 60): string {
  if (rows.length === 0) return "_None found._\n";
  const shown = rows.slice(0, limit);
  const body = shown.map((r) => `- **${r.token}** — \`${r.file}:${r.line}\` — ${r.excerpt}`).join("\n");
  const more = rows.length > limit ? `\n- _…and ${rows.length - limit} more (see inventory JSON)._` : "";
  return body + more + "\n";
}

function buildMarkdown(report: SmokeReport, generatedAt: string): string {
  const blocking = blockingFindings(report);
  const dead = findingsByCategory(report.findings, "dead-link");
  const leaks = findingsByCategory(report.findings, "copy-leak");
  const missing = findingsByCategory(report.findings, "missing-route");
  const status = blocking.length === 0 ? "✅ PASS — primary routes clean" : `❌ FAIL — ${blocking.length} blocking finding(s)`;

  return `# Primary Route Smoke / Dead UI QA Guard

> Generated ${generatedAt} by \`pnpm -F web check:primary-route-smoke\`.
> Status: **${status}**

This guard locks in the product-honesty wins from PR #121 (placeholder cleanup /
dead-CTA removal) and PR #125 (always-on Sample affordance). It is a safety net,
not a new feature: it prevents dead links, placeholder leaks, and broken primary
routes from silently returning.

## What was checked

- **Route inventory integrity** — every primary public / role-flow route page
  still exists on disk (a rename/delete is caught as a flow regression).
- **Dead links / dead CTAs** — no bare \`href="#"\` or empty \`href=""\` anywhere
  in the \`app/\` + \`components/\` UI tree. Real fragment anchors (e.g. the
  \`#main-content\` skip-link) are allowed.
- **User-visible copy leaks** — no lorem-ipsum filler and no untranslated
  \`[XX]\` locale-tag leaks in the primary-locale message catalogs (en / lt).
- **Honest sample/preview states** — inventoried (allowed), not failed.
- **Strong product claims** — inventoried as an owner review surface.

## Routes covered

${report.routes.length} primary routes:

${report.routes.map((r) => `- \`${r.urlPattern}\` — ${r.kind}${r.requiresAuth ? " (auth)" : ""} → \`${r.sourceFile}\``).join("\n")}

## Issues prevented

### Dead links / dead CTAs (blocking)
${mdFindingList(dead)}
### Placeholder / copy leaks (blocking)
${mdFindingList(leaks)}
### Missing / renamed primary routes (blocking)
${mdFindingList(missing)}

## Allowed honest states

These are **permitted** under platform doctrine §7 (clearly-marked sample /
preview / honest empty-state copy). They are listed for transparency, not
flagged. The guard only fails on *unlabeled* fake states and dead UI.

${mdInventoryList(report.honestStates)}

## Remaining risks

- The guard is **source-level**, not a live browser render: it proves the page
  files exist and contain no dead/placeholder markers, but does not click CTAs.
  A full E2E pass (Playwright) remains the next layer.
- Copy-leak scanning covers the **primary** locales (en / lt). DA/DE and other
  locales are intentionally out of scope for this PR (no machine translation).
- **Strong-claim review surface** (${report.claimSurface.length} occurrence(s)) —
  the following claim words appear in copy and should each be backed by a real
  function or marked sample; reviewed by owner, not auto-failed:

${mdInventoryList(report.claimSurface)}

## Next recommended PR

- Wire \`check:primary-route-smoke\` into the CI workflow (alongside
  \`placeholders:check\`) so the gate runs on every push.
- Add a Playwright primary-route render smoke (real HTTP 200 + CTA target
  resolution) as the live-render layer above this static guard.
- DA/DE localisation pass for primary routes (separate, human-reviewed PR).
`;
}

function buildHtml(markdownStatus: string, report: SmokeReport, generatedAt: string): string {
  const blocking = blockingFindings(report);
  const rows = report.routes
    .map((r) => `<tr><td><code>${r.urlPattern}</code></td><td>${r.kind}${r.requiresAuth ? " (auth)" : ""}</td><td><code>${r.sourceFile}</code></td></tr>`)
    .join("\n");
  const findingRows =
    blocking.length === 0
      ? `<tr><td colspan="4" class="ok">No blocking findings — primary routes clean.</td></tr>`
      : blocking
          .map((f) => `<tr><td>${f.category}</td><td><code>${f.file}:${f.line}</code></td><td><code>${escapeHtml(f.evidence)}</code></td><td>${escapeHtml(f.why)}</td></tr>`)
          .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Primary Route Smoke / Dead UI QA Guard</title>
<style>
 body{font:15px/1.6 system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#111}
 h1{font-size:1.5rem} .status{padding:.4rem .8rem;border-radius:6px;display:inline-block;font-weight:600}
 .pass{background:#e7f7ec;color:#11633a} .fail{background:#fdecec;color:#a01818}
 table{border-collapse:collapse;width:100%;margin:1rem 0} th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:13px}
 th{background:#f5f5f5} code{background:#f3f3f3;padding:1px 4px;border-radius:3px} .ok{color:#11633a}
 small{color:#666}
</style></head><body>
<h1>Primary Route Smoke / Dead UI QA Guard</h1>
<p><span class="status ${blocking.length === 0 ? "pass" : "fail"}">${markdownStatus}</span></p>
<p><small>Generated ${generatedAt} · ${report.routes.length} routes · ${report.honestStates.length} honest sample state(s) · ${report.claimSurface.length} claim-review item(s)</small></p>
<h2>Blocking findings</h2>
<table><tr><th>Category</th><th>Location</th><th>Evidence</th><th>Why</th></tr>
${findingRows}
</table>
<h2>Routes covered</h2>
<table><tr><th>Route</th><th>Kind</th><th>Source</th></tr>
${rows}
</table>
<p><small>Full inventory (honest states, claim surface) in
<code>primary-route-smoke-inventory.json</code>.</small></p>
</body></html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function main(): number {
  const report = scanPrimaryRouteSmoke(webRoot);
  const blocking = blockingFindings(report);
  const generatedAt = new Date().toISOString();
  const status = blocking.length === 0 ? "PASS — primary routes clean" : `FAIL — ${blocking.length} blocking finding(s)`;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(resolve(outDir, "primary-route-smoke-report.md"), buildMarkdown(report, generatedAt), "utf-8");
  writeFileSync(resolve(outDir, "primary-route-smoke-report.html"), buildHtml(status, report, generatedAt), "utf-8");
  writeFileSync(
    resolve(outDir, "primary-route-smoke-inventory.json"),
    JSON.stringify(
      {
        generatedAt,
        status,
        routes: report.routes,
        blockingFindings: blocking,
        honestStates: report.honestStates,
        claimSurface: report.claimSurface,
      },
      null,
      2,
    ),
    "utf-8",
  );

  if (blocking.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `check:primary-route-smoke OK — ${report.routes.length} routes, 0 blocking findings. Report: runtime/project-quality/`,
    );
    return 0;
  }
  // eslint-disable-next-line no-console
  console.error(`check:primary-route-smoke FAILED — ${blocking.length} blocking finding(s):`);
  for (const f of blocking) {
    // eslint-disable-next-line no-console
    console.error(`  - [${f.category}] ${f.file}:${f.line} — ${f.evidence} :: ${f.why}`);
  }
  return 1;
}

process.exit(main());
