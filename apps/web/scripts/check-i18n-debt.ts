#!/usr/bin/env tsx
// DA/DE i18n untranslated-key debt inventory + ratchet gate.
//
// Runs the same pure scan as lib/guards/i18n-debt.test.ts and writes an
// owner-facing inventory under the gitignored runtime/ tree:
//
//   runtime/project-quality/i18n-da-de-inventory.md
//   runtime/project-quality/i18n-da-de-inventory.html
//   runtime/project-quality/i18n-da-de-inventory.json
//
// Exits non-zero only on a debt REGRESSION (DA/DE above baseline, or a primary
// locale showing [EN]). Existing debt is allowed. Never translates anything.
//
// Run from the web workspace:
//   pnpm -F web check:i18n-debt
//
// No network, no env, no DB. Reads message catalogs + writes the runtime report.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  debtRegressions,
  scanI18nDebt,
  type I18nDebtReport,
  type LocaleDebt,
} from "../lib/guards/i18n-debt";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(here, "..", "..", "..");
const outDir = resolve(repoRoot, "runtime", "project-quality");

function nsTable(debt: LocaleDebt): string {
  if (debt.byNamespace.length === 0) return "_None._\n";
  return (
    "| Namespace | Untranslated `[EN]` |\n|---|---|\n" +
    debt.byNamespace.map((n) => `| \`${n.namespace}\` | ${n.count} |`).join("\n") +
    "\n"
  );
}

function buildMarkdown(report: I18nDebtReport, generatedAt: string): string {
  const regressions = debtRegressions(report);
  const status = regressions.length === 0 ? "✅ PASS — no debt regression" : `❌ FAIL — ${regressions.length} regression(s)`;
  const da = report.tracked.find((d) => d.locale === "da");
  const de = report.tracked.find((d) => d.locale === "de");

  return `# DA / DE i18n Untranslated-Key Debt Inventory

> Generated ${generatedAt} by \`pnpm -F web check:i18n-debt\`.
> Status: **${status}**

This is an **inventory + ratchet guard**, not a translation. It counts strings
still marked \`[EN]\` (showing English to the user) in the Danish and German
catalogs, allows the existing debt as a recorded baseline, and fails only if the
debt grows. **No machine translation is performed** — real human translation is
the only way to lower these numbers.

## Summary

| Locale | Untranslated \`[EN]\` | Baseline | Status |
|--------|----------------------|----------|--------|
| **da** | ${da?.total ?? 0} | ${report.baseline.da ?? 0} | ${(da?.total ?? 0) <= (report.baseline.da ?? 0) ? "within baseline" : "OVER"} |
| **de** | ${de?.total ?? 0} | ${report.baseline.de ?? 0} | ${(de?.total ?? 0) <= (report.baseline.de ?? 0) ? "within baseline" : "OVER"} |

Primary locales (must stay 0): ${report.primary.map((p) => `**${p.locale}**=${p.total}`).join(", ")}.

> Note: the same \`[EN]\` debt pattern exists in 6 other non-primary locales
> (et, lv, nl, no, pl, sv) at the same magnitude. This guard scopes DA/DE per the
> owner's priority; extend \`TRACKED_LOCALES\` to ratchet the rest.

## What to translate first (DA)

The largest namespaces carry the most user-visible English. Recommended order:

${nsTable(da ?? { locale: "da", total: 0, byNamespace: [] })}

## What to translate first (DE)

${nsTable(de ?? { locale: "de", total: 0, byNamespace: [] })}

## How the guard behaves

- ✅ Translating strings (reducing \`[EN]\`) always passes — then lower the
  baseline in \`apps/web/lib/guards/i18n-debt.ts\` to lock the gain in.
- ❌ Shipping a NEW untranslated string (count rises above baseline) fails
  \`pnpm -F web test\` and \`pnpm -F web check:i18n-debt\`.
- ❌ Any \`[EN]\` appearing in \`en\` or \`lt\` fails (primary-locale regression).

## Next recommended step

1. Owner picks a target locale (e.g. DA) and namespace (e.g. \`auth\`, the
   largest) for a human translation pass.
2. After translating, lower that locale's baseline and re-run
   \`pnpm -F web check:i18n-debt\`.
3. Optionally extend \`TRACKED_LOCALES\` to ratchet the other six locales.
`;
}

function buildHtml(report: I18nDebtReport, statusText: string, generatedAt: string): string {
  const rows = report.tracked
    .map((d) => `<tr><td><b>${d.locale}</b></td><td>${d.total}</td><td>${report.baseline[d.locale] ?? 0}</td></tr>`)
    .join("\n");
  const daTop = (report.tracked.find((d) => d.locale === "da")?.byNamespace ?? [])
    .slice(0, 10)
    .map((n) => `<tr><td><code>${n.namespace}</code></td><td>${n.count}</td></tr>`)
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>DA/DE i18n Debt Inventory</title>
<style>
 body{font:15px/1.6 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111}
 h1{font-size:1.4rem} h2{font-size:1.1rem;margin-top:1.4rem}
 .status{padding:.4rem .8rem;border-radius:6px;display:inline-block;font-weight:700}
 .pass{background:#e7f7ec;color:#11633a}.fail{background:#fdecec;color:#a01818}
 table{border-collapse:collapse;width:100%;margin:.5rem 0} th,td{border:1px solid #ddd;padding:.35rem .6rem;text-align:left;font-size:13px} th{background:#f5f5f5}
 code{background:#f3f3f3;padding:1px 4px;border-radius:3px} small{color:#666}
</style></head><body>
<h1>DA / DE i18n Untranslated-Key Debt Inventory</h1>
<p><span class="status ${statusText.startsWith("PASS") ? "pass" : "fail"}">${statusText}</span></p>
<p><small>Generated ${generatedAt} · inventory + ratchet guard · no machine translation</small></p>
<h2>Summary</h2>
<table><tr><th>Locale</th><th>Untranslated [EN]</th><th>Baseline</th></tr>
${rows}
</table>
<p><small>Primary locales (must be 0): ${report.primary.map((p) => `${p.locale}=${p.total}`).join(", ")}. Same debt pattern exists in et/lv/nl/no/pl/sv.</small></p>
<h2>Translate first — DA (top namespaces)</h2>
<table><tr><th>Namespace</th><th>[EN]</th></tr>
${daTop}
</table>
<p><small>Full per-namespace breakdown in <code>i18n-da-de-inventory.json</code>.</small></p>
</body></html>
`;
}

function main(): number {
  const report = scanI18nDebt(webRoot);
  const regressions = debtRegressions(report);
  const generatedAt = new Date().toISOString();
  const statusText = regressions.length === 0 ? "PASS — no debt regression" : `FAIL — ${regressions.length} regression(s)`;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "i18n-da-de-inventory.md"), buildMarkdown(report, generatedAt), "utf-8");
  writeFileSync(resolve(outDir, "i18n-da-de-inventory.html"), buildHtml(report, statusText, generatedAt), "utf-8");
  writeFileSync(
    resolve(outDir, "i18n-da-de-inventory.json"),
    JSON.stringify({ generatedAt, statusText, ...report, regressions }, null, 2),
    "utf-8",
  );

  if (regressions.length === 0) {
    const totals = report.tracked.map((d) => `${d.locale}=${d.total}`).join(", ");
    // eslint-disable-next-line no-console
    console.log(`check:i18n-debt OK — within baseline (${totals}). Report: runtime/project-quality/`);
    return 0;
  }
  // eslint-disable-next-line no-console
  console.error(`check:i18n-debt FAILED — ${regressions.length} regression(s):`);
  for (const r of regressions) {
    // eslint-disable-next-line no-console
    console.error(`  - ${r.locale}: ${r.kind} (current ${r.current} vs baseline ${r.baseline})`);
  }
  return 1;
}

process.exit(main());
