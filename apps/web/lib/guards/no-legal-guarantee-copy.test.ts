/**
 * Safe-wording guard (Stage 3 / §6 of pre-payment-product-readiness.md).
 *
 * The product gives an INFORMATIONAL readiness checklist, never legal advice
 * and never a guarantee of legal work. This guard scans all user-facing message
 * JSON for phrases that would assert such a guarantee (EN + LT) and fails the
 * build if any appear. It deliberately does NOT ban the safe phrasings the
 * product DOES use ("needs legal review", "consult a legal advisor", "documents
 * likely required", "confirm with the authority").
 *
 * Lives as a vitest because the repo's `check:*` copy scripts are not wired into
 * the `quality` gate; vitest guards are (see lib/guards/*).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const messagesDir = resolve(here, "..", "..", "messages");

const BANNED: { name: string; rx: RegExp }[] = [
  { name: "guaranteed legal", rx: /\bguaranteed\s+legal\b/i },
  { name: "legally guaranteed", rx: /\blegally\s+guaranteed\b/i },
  { name: "we guarantee legal/work", rx: /\bwe\s+guarantee[^."]{0,40}\b(legal|work|compliance|employment)\b/i },
  { name: "guarantee you can work", rx: /\bguarantee[sd]?\b[^."]{0,30}\bcan\s+work\b/i },
  { name: "compliance guaranteed", rx: /\bcompliance\s+guaranteed\b/i },
  { name: "legally approved", rx: /\blegally\s+approved\b/i },
  { name: "certified compliant", rx: /\bcertified\s+compliant\b/i },
  { name: "fully compliant (absolute)", rx: /\bfully\s+(legally\s+)?compliant\b/i },
  // Lithuanian
  { name: "garantuojame legalų/teisėtą darbą", rx: /\bgarantuojame[^."]{0,40}\b(legal|teis[ėe])/i },
  { name: "teisiškai garantuota", rx: /\bteisi[šs]kai\s+garantuot/i },
  { name: "garantuotai legaliai", rx: /\bgarantuotai\s+legal/i },
];

function jsonFiles(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) jsonFiles(p, acc);
    else if (/\.json$/.test(p)) acc.push(p);
  }
  return acc;
}

describe("no-legal-guarantee copy guard", () => {
  const files = jsonFiles(messagesDir);

  it("finds message files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no message asserts a legal-work guarantee", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const { name, rx } of BANNED) {
          if (rx.test(line)) {
            hits.push(`${file.split(/[\\/]messages[\\/]/)[1]}:${i + 1} [${name}] ${line.trim()}`);
          }
        }
      });
    }
    expect(hits, `legal-guarantee phrases found:\n${hits.join("\n")}`).toEqual([]);
  });
});
