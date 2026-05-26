#!/usr/bin/env tsx
// SR-5 pricing honesty copy guard.
// Fails if user-facing copy claims self-serve checkout, active paid
// subscriptions, automatic billing, guaranteed match/hire, automatic
// verification, or an AI match score — claims the product does not
// support today. Complements SR-2 (pilot-honesty) and SR-6 (fit-signal).
//
// Scanned: apps/web/messages/*.json. Decision/history docs are out of scope.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

type Hit = { file: string; line: number; text: string; pattern: string };

const PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "checkout now", rx: /\bcheckout\s+now\b/gi },
  { name: "pay now", rx: /\bpay\s+now\b/gi },
  { name: "subscription active", rx: /\bsubscription\s+active\b/gi },
  { name: "automatic billing", rx: /\bautomatic\s+billing\b/gi },
  { name: "guaranteed hiring", rx: /\bguaranteed\s+hiring\b/gi },
  { name: "guaranteed match", rx: /\bguaranteed\s+match(?:ing)?\b/gi },
  { name: "verified automatically", rx: /\bverified\s+automatically\b/gi },
  { name: "AI match score", rx: /\bAI[\s-]+match\s+score\b/gi },
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
    "\nSR-5 pricing honesty copy guard — forbidden phrases detected:\n\n",
  );
  for (const h of hits) {
    process.stderr.write(`  ${h.file}:${h.line}  [${h.pattern}]\n`);
    process.stderr.write(`    ${h.text}\n`);
  }
  process.stderr.write(
    `\nRephrase: no self-serve checkout / automatic billing / guaranteed\n` +
      `hiring / automatic verification claims. Pilot pricing is manual.\n` +
      `Total hits: ${hits.length}\n`,
  );
  process.exit(1);
}
process.stdout.write("SR-5 pricing honesty copy guard — clean.\n");
