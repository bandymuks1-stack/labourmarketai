/**
 * Guard — the pricing/billing surfaces never CLAIM live payments are active
 * (Stripe sprint PR7). Test-mode is allowed and clearly labelled; an affirmative
 * "payments are live / pay now / buy now / live checkout active" claim fails the
 * build. Honest negations ("no live checkout", "live is hard-blocked") are fine.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");

const BILLING_NAMESPACES = [
  "pricing",
  "planBoundary",
  "billingTest",
  "billingStatus",
  "adminBilling",
];

// Affirmative live-payment claims (not negations like "no live checkout").
const BANNED: { name: string; rx: RegExp }[] = [
  { name: "payments are live", rx: /\bpayments?\s+(?:are|is)\s+live\b/i },
  { name: "live checkout active/enabled", rx: /\blive\s+checkout\s+(?:is\s+)?(?:active|enabled|on)\b/i },
  { name: "buy now", rx: /\bbuy\s+now\b/i },
  { name: "pay now", rx: /\bpay\s+now\b/i },
  { name: "live payments enabled", rx: /\blive\s+payments?\s+(?:are\s+)?(?:enabled|active|on)\b/i },
];

function flatten(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") out.push(obj);
  else if (obj && typeof obj === "object")
    for (const v of Object.values(obj as Record<string, unknown>)) flatten(v, out);
  return out;
}

function componentFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) componentFiles(p, acc);
    else if (/billing|pricing/i.test(f) && /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f)) acc.push(p);
  }
  return acc;
}

describe("pricing/billing make no live-payment claim", () => {
  it("billing i18n (en/lt/ru) never claims live payments", () => {
    const hits: string[] = [];
    for (const loc of ["en", "lt", "ru"]) {
      const m = JSON.parse(readFileSync(join(webRoot, "messages", `${loc}.json`), "utf8"));
      for (const ns of BILLING_NAMESPACES) {
        for (const s of flatten(m[ns])) {
          for (const { name, rx } of BANNED) if (rx.test(s)) hits.push(`${loc}.${ns} [${name}] ${s}`);
        }
      }
    }
    expect(hits, `live-payment claim(s):\n${hits.join("\n")}`).toEqual([]);
  });

  it("billing/pricing components make no live-payment claim", () => {
    const hits: string[] = [];
    for (const file of [
      ...componentFiles(join(webRoot, "components", "marketing")),
      ...componentFiles(join(webRoot, "app")),
    ]) {
      // Strip comments — a negating comment ("no Pay now") is not a claim.
      const txt = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
      for (const { name, rx } of BANNED) if (rx.test(txt)) hits.push(`${file.split(/[\\/]apps[\\/]web[\\/]/)[1]} [${name}]`);
    }
    expect(hits, `live-payment claim(s) in components:\n${hits.join("\n")}`).toEqual([]);
  });
});
