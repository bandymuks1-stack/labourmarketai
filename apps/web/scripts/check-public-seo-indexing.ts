/**
 * CLI guard: `pnpm -F web check:public-seo-indexing`.
 *
 * Thin wrapper around the pure audit in lib/seo/seo-indexing-audit.ts.
 * Exits non-zero (with a readable report) when any public SEO indexing
 * invariant regresses. The same audit runs in CI via
 * lib/guards/public-seo-indexing.test.ts.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditPublicSeoIndexing } from "../lib/seo/seo-indexing-audit";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string | null {
  try {
    return readFileSync(join(APP_ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

const { violations } = auditPublicSeoIndexing(read);

if (violations.length > 0) {
  console.error("✗ public SEO indexing audit failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log("✓ public SEO indexing audit passed.");
