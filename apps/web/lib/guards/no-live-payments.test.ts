/**
 * Guard — payments stay OFF for the pre-payment sprint (Stage 8 / Stage 11C).
 *
 * Fails the build if:
 *   - PAYMENTS_ENABLED is flipped true;
 *   - any app/lib source imports a payment SDK (stripe / montonio);
 *   - a live checkout/billing ROUTE appears under app/.
 *
 * This is the hard line: the later Stripe sprint flips the flag deliberately;
 * nothing should turn payments on by accident before then.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAYMENTS_ENABLED } from "../billing/plans";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx)$/.test(p) && !/no-live-payments\.test\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

// Real SDK import shapes only — not the word "stripe" in prose/comments.
const SDK_IMPORT =
  /\b(?:import|require)\b[^\n;]*?["']((?:@?stripe|stripe\/|@stripe\/)[^"']*|montonio[^"']*)["']/i;

describe("no live payments (pre-payment guard)", () => {
  it("PAYMENTS_ENABLED is false", () => {
    expect(PAYMENTS_ENABLED).toBe(false);
  });

  it("no source imports a payment SDK (stripe / montonio)", () => {
    const hits: string[] = [];
    for (const file of [...sources(join(webRoot, "lib")), ...sources(join(webRoot, "app"))]) {
      const txt = readFileSync(file, "utf8");
      for (const line of txt.split(/\r?\n/)) {
        if (SDK_IMPORT.test(line)) {
          hits.push(`${file.split(/[\\/]apps[\\/]web[\\/]/)[1]}: ${line.trim()}`);
        }
      }
    }
    expect(hits, `payment SDK import found:\n${hits.join("\n")}`).toEqual([]);
  });

  it("no live checkout/billing route exists under app/", () => {
    const appDir = join(webRoot, "app");
    const bad: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (!statSync(p).isDirectory()) continue;
        if (/^(checkout|billing|subscribe|buy)$/i.test(f) && existsSync(join(p, "page.tsx"))) {
          bad.push(p.split(/[\\/]app[\\/]/)[1]);
        }
        walk(p);
      }
    };
    walk(appDir);
    expect(bad, `checkout/billing route(s) found: ${bad.join(", ")}`).toEqual([]);
  });
});
