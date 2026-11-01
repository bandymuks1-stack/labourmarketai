import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeLandingFreezeSnapshot } from "../lib/guards/landing-freeze";

/**
 * Regenerate the landing-freeze baseline.
 *
 * When to run it (owner 2026-10-25): the freeze guards against ACCIDENTAL
 * drift of the landing; it must not block a justified functional or UX fix.
 * Run this in the same PR as such a fix and name the reason in the PR body.
 * Preserving the current design is not a goal in itself; a deliberate
 * redesign still goes through the owner-approved landing plan.
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
