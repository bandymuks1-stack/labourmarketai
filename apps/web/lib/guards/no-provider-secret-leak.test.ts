/**
 * Guard — NO PROVIDER SECRET LEAK (Internal LLM Agents v1, PR2).
 *
 * The live AI provider key lives ONLY in server env (AI_API_KEY), never in
 * source, never in a client bundle. Fails the build if:
 *   - a real AI key literal (a quoted `sk-…` of real length) appears in source;
 *   - the live adapter sources its key from anything other than env.
 *
 * Comments are stripped before the literal scan so docstrings explaining the
 * key shape (and the config-core `AI_KEY_SHAPE` regex) are not flagged.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
/** Strip block + line comments so the scan checks real CODE only. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(abs)) acc.push(abs);
  }
  return acc;
}

const SCAN_DIRS = ["lib", "app", "components"].map((d) => join(APP_ROOT, d));
// A REAL key literal: quoted, prefix sk- / sk-ant- / sk-proj-, then 16+ chars.
// The config-core regex literal (`/^(sk-ant-|sk-|sk-proj-).../`) is not quoted
// like this and short test placeholders (<16 chars after prefix) don't match.
const KEY_LITERAL = /["'`]sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}["'`]/;

describe("no provider secret leak", () => {
  it("no real AI key literal appears in source", () => {
    const hits: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        if (/\.test\.tsx?$/.test(file)) continue; // tests use placeholders
        if (KEY_LITERAL.test(code(read(file)))) {
          hits.push(file.slice(APP_ROOT.length + 1).replace(/\\/g, "/"));
        }
      }
    }
    expect(hits, `AI key literal found:\n${hits.join("\n")}`).toEqual([]);
  });

  it("the live adapter sources its key from server env, never a literal", () => {
    const adapter = join(APP_ROOT, "lib", "ai", "runtime", "providers", "anthropic.ts");
    expect(existsSync(adapter)).toBe(true);
    const src = adapter ? read(adapter) : "";
    expect(src).toMatch(/process\.env\.AI_API_KEY/);
    expect(KEY_LITERAL.test(code(src))).toBe(false);
  });

  it("the detector is real (matches a long key, ignores short placeholders)", () => {
    expect(KEY_LITERAL.test('"sk-ant-abcdefghij0123456789"')).toBe(true);
    expect(KEY_LITERAL.test('"sk-ant-x"')).toBe(false);
  });
});
