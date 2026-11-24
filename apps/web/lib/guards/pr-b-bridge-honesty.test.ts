import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * PR B bridge-honesty guard.
 *
 * Pins the audit conclusions so a later change can't quietly fake what the
 * bridge audits marked as MISSING:
 *   - no fabricated contact quota ("free contacts left" / "contacts remaining"),
 *     because no quota logic exists (contact-permission-quota-bridge-v1.md);
 *   - the two PR B audit docs exist and actually record the missing bridges.
 *
 * PR B adds NO cross-user markers and NO marker action sheet (see
 * market-map-visual-action-bridge-v1.md), so there is no surface that could
 * carry a fake quota — this guard keeps it that way.
 */

const web = join(__dirname, "..", "..");
const repoRoot = join(web, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("Guard: no fabricated contact quota anywhere in app/components", () => {
  // Source-text honesty: there is no quota bridge, so no UI may render a
  // "free contacts left"-style counter. (Audit/doc files are excluded — they
  // describe the rule.)
  const FAKE_QUOTA =
    /free\s+contacts\s+(left|remaining)|contacts?\s+remaining|nemokam\w*\s+kontakt\w*\s+(liko|likę)/i;
  const roots = [join(web, "app"), join(web, "components")];
  it("renders no 'free contacts left' / quota-remaining string", () => {
    const offenders: string[] = [];
    for (const r of roots) {
      for (const f of walk(r)) {
        if (FAKE_QUOTA.test(readFileSync(f, "utf8"))) offenders.push(f);
      }
    }
    expect(offenders, `fake-quota strings in: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("Guard: PR B audit docs record the missing bridges honestly", () => {
  const docs = {
    map: join(repoRoot, "docs/audits/market-map-visual-action-bridge-v1.md"),
    contact: join(repoRoot, "docs/audits/contact-permission-quota-bridge-v1.md"),
  };
  it("both audit docs exist", () => {
    expect(existsSync(docs.map)).toBe(true);
    expect(existsSync(docs.contact)).toBe(true);
  });
  it("map audit marks cross-user markers as a missing bridge (no fake markers)", () => {
    const md = readFileSync(docs.map, "utf8");
    expect(md).toMatch(/missing bridge/i);
    expect(md).toMatch(/omit for now/i);
  });
  it("contact audit forbids faking the free-contact quota", () => {
    const md = readFileSync(docs.contact, "utf8");
    expect(md).toMatch(/missing bridge/i);
    expect(md).toMatch(/free contacts left/i); // appears as the forbidden example
  });
});
