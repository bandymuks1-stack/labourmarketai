import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REGEXP_LOOKBEHIND_SHIM } from "./regexp-lookbehind-shim";

/**
 * 2026-10-18 production incident: on browsers without regex lookbehind
 * (Safari / iOS < 16.4, old in-app web views) the home, sign-up and sign-in
 * pages died on load. The shim must (a) do nothing where lookbehind works,
 * (b) turn the SyntaxError into a working, lookbehind-free expression where it
 * does not, and (c) run before any application module.
 */

const Native = RegExp;
const LOOKBEHIND = /\(\?<[=!]/;

/** A constructor that behaves like an old browser: lookbehind does not compile. */
function OldBrowserRegExp(this: unknown, pattern: string, flags?: string): RegExp {
  if (typeof pattern === "string" && LOOKBEHIND.test(pattern)) {
    throw new SyntaxError("Invalid regular expression: invalid group specifier name");
  }
  return Reflect.construct(Native, flags === undefined ? [pattern] : [pattern, flags], new.target ?? OldBrowserRegExp);
}
OldBrowserRegExp.prototype = Native.prototype;

function run(RegExpCtor: unknown): { RegExp: RegExpConstructor } {
  const w = { RegExp: RegExpCtor as RegExpConstructor };
  new Function("window", REGEXP_LOOKBEHIND_SHIM)(w);
  return w;
}

describe("regexp lookbehind shim", () => {
  it("is a no-op where lookbehind compiles (every current browser)", () => {
    expect(run(Native).RegExp).toBe(Native);
  });

  it("an old browser gets a working expression instead of a SyntaxError", () => {
    const R = run(OldBrowserRegExp).RegExp;
    expect(R).not.toBe(OldBrowserRegExp);
    const cases: Array<[string, string, string]> = [
      // value-statement.ts — the module that crashed the home page on load
      [String.raw`(?<![\p{L}])(?:remontuoju|i\s+(?:repair|fix))(?![\p{L}])`, "u", "aš remontuoju namus"],
      // intent-router.ts — the Unicode word boundary
      [String.raw`(?:(?<![0-9A-Za-z])(?=[0-9A-Za-z])|(?<=[0-9A-Za-z])(?![0-9A-Za-z]))cv`, "u", "my cv"],
      [String.raw`(?<=[.!?])\s+`, "u", "A. B"],
      [String.raw`(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])`, "u", "on 2026-10-18"],
      [String.raw`(?<![\p{L}\p{N}_\-–—/.:])(\d{1,2})\s*-\s*(\d{1,2})`, "iu", "8-17"],
      [String.raw`(?<!pa)slaug`, "u", "slaugytoja"],
      // a lookbehind holding a group and a class with ")" is removed whole
      [String.raw`x(?<!(a|[)])y)z`, "", "xz"],
    ];
    for (const [pattern, flags, text] of cases) {
      const re = new R(pattern, flags);
      expect(re instanceof Native, pattern).toBe(true);
      expect(re.flags, pattern).toBe(flags);
      expect(LOOKBEHIND.test(re.source), pattern).toBe(false);
      expect(re.test(text), pattern).toBe(true);
    }
  });

  it("keeps everything else a RegExp does", () => {
    const R = run(OldBrowserRegExp).RegExp;
    expect((R as unknown as (p: string) => RegExp)("ab").test("ab")).toBe(true);
    expect(() => new R("(")).toThrow(SyntaxError);
    expect(new R("(?<name>a)b").exec("ab")?.groups?.name).toBe("a");
    class Sub extends R {
      hello() {
        return "hi";
      }
    }
    expect(new Sub("(?<!a)b").hello()).toBe("hi");
  });

  it("runs first in <head>, before any application module", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "layout.tsx"), "utf8");
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    const firstScript = head.indexOf("<script");
    expect(firstScript).toBeGreaterThan(-1);
    expect(head.slice(firstScript, firstScript + 120)).toContain("REGEXP_LOOKBEHIND_SHIM");
  });
});
