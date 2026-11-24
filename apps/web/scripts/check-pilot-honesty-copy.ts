#!/usr/bin/env tsx
// SR-2 pilot honesty copy guard.
// Fails if user-facing copy claims fake AI matching, instant hiring,
// automatic verification, live demo, paid-plan activation, or other
// claims that the product does not actually do today. Narrow patterns
// only — historical decision docs are intentionally out of scope.
//
// Scanned: apps/web/messages/*.json (the user-visible i18n strings).
// JSON has no per-line allowlist — every locale string must hold.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

type Hit = { file: string; line: number; text: string; pattern: string };

const PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "AI match / AI matching", rx: /\bAI[\s-]+match(?:ing)?\b/gi },
  { name: "AI-powered matching", rx: /\bAI[\s-]+powered\s+matching\b/gi },
  { name: "instant hiring", rx: /\binstant\s+hiring\b/gi },
  { name: "automatic verification", rx: /\bautomatic\s+verification\b/gi },
  { name: "demo is live", rx: /\bdemo\s+is\s+live\b/gi },
  { name: "paid plan active", rx: /\bpaid\s+plan\s+active\b/gi },
  { name: "we guarantee", rx: /\bwe\s+guarantee\b/gi },
];

const TARGETS: string[] = [join(webRoot, "messages")];

function walk(p: string, acc: string[] = []): string[] {
  const s = statSync(p);
  if (s.isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f), acc);
  } else if (/\.json$/.test(p)) {
    acc.push(p);
  }
  return acc;
}

const files = TARGETS.flatMap((t) => walk(t));
const hits: Hit[] = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { name, rx } of PATTERNS) {
      rx.lastIndex = 0;
      if (rx.test(line)) {
        hits.push({
          file: file.replace(webRoot + "\\", "").replace(webRoot + "/", ""),
          line: i + 1,
          text: line.trim(),
          pattern: name,
        });
      }
    }
  });
}

if (hits.length) {
  process.stderr.write(
    "\nSR-2 pilot honesty copy guard — forbidden phrases detected:\n\n",
  );
  for (const h of hits) {
    process.stderr.write(`  ${h.file}:${h.line}  [${h.pattern}]\n`);
    process.stderr.write(`    ${h.text}\n`);
  }
  process.stderr.write(
    `\nRephrase honestly (no fake AI matching, instant hiring, automatic\n` +
      `verification, or paid activation). See docs/PRODUCT_CONSTITUTION.md §7.\n` +
      `Total hits: ${hits.length}\n`,
  );
  process.exit(1);
}
process.stdout.write("SR-2 pilot honesty copy guard — clean.\n");
