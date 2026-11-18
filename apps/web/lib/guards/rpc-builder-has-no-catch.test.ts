import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A Supabase query builder is a thenable, not a Promise: it defines `then` and
 * no `catch`. `rpc(...).catch(...)` therefore throws "catch is not a function"
 * synchronously, before any request is sent — and an `asAny(...)` cast hides it
 * from tsc. On 2026-10-23 this crashed the cancel action of every submitted
 * business trip in production (orders-bookings walk T-1): the withdraw and the
 * cancel RPCs were never called. Swallow a builder's failure with the two-
 * argument `.then(ok, fail)` (or `.then(...).catch(...)`, where `.then` has
 * already turned it into a Promise), never with `.catch` on the builder itself.
 */
const ROOTS = ["lib", "app", "components"];
const SKIP = /(\.test\.|\.spec\.|[\\/]node_modules[\\/]|[\\/]\.next[\\/])/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
}

/** Index just past the `)` matching the `(` at `open`, or -1. */
function closeParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return -1;
}

describe("a Supabase builder is never .catch()-ed directly", () => {
  it("no `.rpc(...)` / `.from(...)` chain ends in `.catch(` without a `.then(` first", () => {
    const base = join(__dirname, "..", "..");
    const files: string[] = [];
    for (const r of ROOTS) walk(join(base, r), files);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const re = /\.(rpc|from)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        // Follow THIS call chain only: skip the balanced argument list, then
        // each chained `.name(...)`, until the chain ends.
        let i = closeParen(src, m.index + m[0].length - 1);
        let sawThen = false;
        while (i > 0) {
          const next = /^\s*\.(\w+)\(/.exec(src.slice(i, i + 200));
          if (!next) break;
          if (next[1] === "then") sawThen = true;
          if (next[1] === "catch" && !sawThen) {
            const line = src.slice(0, m.index).split("\n").length;
            offenders.push(`${relative(base, f)}:${line}`);
            break;
          }
          i = closeParen(src, i + next[0].length - 1);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
