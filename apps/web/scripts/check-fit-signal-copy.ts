#!/usr/bin/env tsx
// SR-6 fit-signal copy guard.
// Fails if user-facing copy reintroduces universal-value scoring language
// (OVR / verified skills / profile strength / 0-99 rating / universal score /
// overall rating). See docs/CONTEXTUAL_FIT_SIGNALS.md §6 and TASKS.md SR-6.
//
// Scanned: apps/web/messages/*.json, apps/web/content/placeholders.ts.
// Per-line allowlist marker (TS only): `// sr6-allow`. JSON has no escape hatch
// by design — every locale string is user-visible.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

type Hit = { file: string; line: number; text: string; pattern: string };

const PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "OVR", rx: /\bOVR\b/g },
  { name: "verified skills", rx: /verified\s+skills/gi },
  { name: "profile strength", rx: /profile\s+strength/gi },
  { name: "universal score", rx: /universal\s+score/gi },
  { name: "overall rating", rx: /overall\s+rating/gi },
  { name: "overall score", rx: /overall\s+score/gi },
  { name: "0-99 rating", rx: /0\s*[-–]\s*99\s*rating/gi },
];

const TARGETS: string[] = [
  join(webRoot, "messages"),
  join(webRoot, "content", "placeholders.ts"),
];

function walk(p: string, acc: string[] = []): string[] {
  const s = statSync(p);
  if (s.isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f), acc);
  } else if (/\.(?:json|ts|tsx)$/.test(p)) {
    acc.push(p);
  }
  return acc;
}

const files = TARGETS.flatMap((t) => walk(t));
const hits: Hit[] = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("sr6-allow")) return;
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
    "\nSR-6 fit-signal copy guard — forbidden phrases detected:\n\n",
  );
  for (const h of hits) {
    process.stderr.write(`  ${h.file}:${h.line}  [${h.pattern}]\n`);
    process.stderr.write(`    ${h.text}\n`);
  }
  process.stderr.write(
    `\nReframe to contextual fit signals (docs/CONTEXTUAL_FIT_SIGNALS.md §6).\n` +
      `Total hits: ${hits.length}\n`,
  );
  process.exit(1);
}
process.stdout.write("SR-6 fit-signal copy guard — clean.\n");
