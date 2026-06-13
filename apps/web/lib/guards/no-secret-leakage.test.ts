/**
 * Guard — NO SECRET LEAKAGE (Stripe sprint PR1). Fails the build if a real
 * secret VALUE is committed to source: Stripe secret/restricted keys, webhook
 * signing secrets, or Supabase service-role JWTs. Test/placeholder shapes that
 * are clearly not real keys (e.g. `sk_test_123`, `whsec_123`, `sk_test_abc`)
 * are allowed in tests; only long, real-looking secrets are flagged.
 *
 * Secrets live in Vercel env / .env.local only — never in the repo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist", "out"].includes(f)) continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx|js|jsx|json|md|sql|env|example)$/.test(p) &&
             !/no-secret-leakage\.test\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

const rel = (file: string) => file.replace(repoRoot, "").replace(/\\/g, "/");

// Real-looking secrets: long random tails. Placeholders like `sk_test_123` or
// `sk_test_abc` (<= 12 trailing chars) are NOT flagged.
const PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "stripe live secret/restricted key", rx: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { name: "stripe test secret key (real)", rx: /\bsk_test_[A-Za-z0-9]{20,}/ },
  { name: "stripe webhook secret (real)", rx: /\bwhsec_[A-Za-z0-9]{20,}/ },
  { name: "supabase service-role JWT", rx: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
];

describe("no secret leakage in the repo", () => {
  it("no real secret value is committed to source", () => {
    const hits: string[] = [];
    for (const file of sources(join(webRoot, "lib"))
      .concat(sources(join(webRoot, "app")))
      .concat(sources(join(webRoot, "scripts")))
      .concat(existsSync(join(repoRoot, ".env.example")) ? [join(repoRoot, ".env.example")] : [])) {
      const txt = readFileSync(file, "utf8");
      for (const { name, rx } of PATTERNS) {
        if (rx.test(txt)) hits.push(`${rel(file)} [${name}]`);
      }
    }
    expect(hits, `possible committed secret(s):\n${hits.join("\n")}`).toEqual([]);
  });
});
