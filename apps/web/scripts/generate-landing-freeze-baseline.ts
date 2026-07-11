import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeLandingFreezeSnapshot } from "../lib/guards/landing-freeze";

/**
 * Regenerate the landing-freeze baseline.
 *
 * OWNER-GATED: run this ONLY as part of the explicit landing real-data
 * replacement plan (or another owner-approved landing change). Any PR that
 * regenerates the baseline outside that plan violates the landing freeze.
 *
 * Usage: pnpm -F web exec tsx scripts/generate-landing-freeze-baseline.ts
 */
const webRoot = join(__dirname, "..");
const snapshot = computeLandingFreezeSnapshot(webRoot);
const target = join(webRoot, "lib", "guards", "landing-freeze-baseline.json");
writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `landing-freeze baseline written: ${Object.keys(snapshot.files).length} files, ` +
    `${Object.keys(snapshot.namespaces).length} locale namespaces`,
);
