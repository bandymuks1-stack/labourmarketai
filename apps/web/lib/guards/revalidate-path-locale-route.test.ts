import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `revalidatePath` must name a path that EXISTS under `app/[locale]/…`.
 *
 * Every page route of this app lives under `app/[locale]/`, so the cache
 * entries of `/dashboard/company` are tagged `_N_T_/en/dashboard/company`,
 * `_N_T_/[locale]/dashboard/company/page`, … — never `_N_T_/dashboard/company`.
 * A locale-less literal such as `revalidatePath("/dashboard/company")`
 * therefore invalidates NOTHING; Next 15.5 still flips `pathWasRevalidated`
 * for the action response (see `next/dist/server/web/spec-extension/
 * revalidate.js`: "TODO: only revalidate if the path matches"), which is
 * exactly why the bug hides: the header says `[[],1,0]`, the in-flight page
 * re-renders, and any cached segment stays stale until a manual reload.
 *
 * Measured 2026-09-17 on the local stack (PR after #1750): seven action files
 * carried the literal form — company public profile, learning, listings,
 * service requests, service offerings, evidence disputes / roster links and
 * the historical importer. The reference form is the route pattern plus the
 * `"page"` type: `revalidatePath("/[locale]/dashboard/company", "page")`.
 *
 * Accepted first arguments:
 *   - `"/"` (root — with `"layout"` it is the whole tree);
 *   - a template literal that STARTS with an interpolated locale
 *     (`` `/${locale}/dashboard/…` `` — a concrete path);
 *   - the route-pattern form `"/[locale]/…"`, which MUST carry a second
 *     argument of `"page"` or `"layout"` — without it Next warns and does
 *     nothing;
 *   - an identifier whose `const NAME = …` in the same file resolves to one of
 *     the above.
 * Everything else that starts with `/` is a locale-less literal and fails.
 */

const APP_ROOT = process.cwd();
const SCAN_ROOTS = ["app", "components", "lib"] as const;
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "guards"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

type Verdict =
  | { ok: true }
  | { ok: false; reason: "locale-less literal" | "route pattern without type" | "unresolved argument" };

export type Call = { file: string; line: number; arg: string; type: string | null; verdict: Verdict };

/** First argument = one quoted token (escapes and `${…}` allowed) or one
 *  identifier / member path; optional second argument = "page" | "layout". */
const CALL_RE =
  /revalidatePath\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z_$][\w$.]*)\s*(?:,\s*(["'`])(page|layout)\2\s*)?\)/g;
const ANY_CALL_RE = /revalidatePath\(/g;

/** Resolve `const NAME = <quoted>` in the same source. Returns the raw quoted
 *  token (quotes included) or null. */
function resolveConst(source: string, name: string): string | null {
  const m = source.match(new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*((["'\`])[^\\n]*?\\2)`));
  return m ? m[1] : null;
}

function judge(rawArg: string, type: string | null, source: string): Verdict {
  let arg = rawArg.trim();
  if (!/^["'`]/.test(arg)) {
    const resolved = /^[A-Za-z_$][\w$]*$/.test(arg) ? resolveConst(source, arg) : null;
    if (!resolved) return { ok: false, reason: "unresolved argument" };
    arg = resolved;
  }
  const text = arg.slice(1, -1);
  if (!text.startsWith("/")) return { ok: true }; // not a path literal we police
  if (text === "/") return { ok: true };
  if (text.startsWith("/${")) return { ok: true }; // concrete locale-first path
  if (text.startsWith("/[locale]")) {
    return type ? { ok: true } : { ok: false, reason: "route pattern without type" };
  }
  return { ok: false, reason: "locale-less literal" };
}

export function scan(source: string, file: string): Call[] {
  const calls: Call[] = [];
  const total = [...source.matchAll(ANY_CALL_RE)].length;
  const parsed = [...source.matchAll(CALL_RE)];
  if (parsed.length !== total) {
    // A call shape this parser does not understand must FAIL, not vanish.
    calls.push({
      file,
      line: 0,
      arg: `<${total - parsed.length} call(s) the guard could not parse>`,
      type: null,
      verdict: { ok: false, reason: "unresolved argument" },
    });
  }
  for (const m of parsed) {
    const line = source.slice(0, m.index).split("\n").length;
    calls.push({
      file,
      line,
      arg: m[1],
      type: m[3] ?? null,
      verdict: judge(m[1], m[3] ?? null, source),
    });
  }
  return calls;
}

function fmt(c: Call): string {
  return `${c.file}:${c.line}  revalidatePath(${c.arg}${c.type ? `, "${c.type}"` : ""})  — ${
    c.verdict.ok ? "ok" : c.verdict.reason
  }`;
}

describe("revalidatePath names a route that exists under app/[locale]", () => {
  const calls: Call[] = [];
  for (const root of SCAN_ROOTS) {
    for (const abs of walk(join(APP_ROOT, root))) {
      const source = readFileSync(abs, "utf8");
      if (!source.includes("revalidatePath(")) continue;
      calls.push(...scan(source, relative(APP_ROOT, abs).replace(/\\/g, "/")));
    }
  }

  it("scans a real, non-trivial call set (the guard cannot pass vacuously)", () => {
    expect(calls.length).toBeGreaterThan(100);
    expect(new Set(calls.map((c) => c.file)).size).toBeGreaterThan(40);
  });

  it("no locale-less literal, no untyped route pattern, no opaque argument", () => {
    const bad = calls.filter((c) => !c.verdict.ok).map(fmt);
    expect(bad, `\n${bad.join("\n")}\n`).toEqual([]);
  });

  it("the reference form is present (the fix is on disk, not only the rule)", () => {
    const patterned = calls.filter((c) => /^["'`]\/\[locale\]\//.test(c.arg.trim()) && c.type === "page");
    expect(patterned.length).toBeGreaterThanOrEqual(7);
  });
});

describe("negative controls — the detector sees what it claims to see", () => {
  const cases: Array<[string, boolean, string?]> = [
    [`revalidatePath("/dashboard/company");`, false, "locale-less literal"],
    [`revalidatePath('/dashboard/learning')`, false, "locale-less literal"],
    ["revalidatePath(`/business/${slug}`)", false, "locale-less literal"],
    [`revalidatePath("/[locale]/dashboard/company")`, false, "route pattern without type"],
    [`revalidatePath(someDynamicValue)`, false, "unresolved argument"],
    [`revalidatePath(pathFor(locale))`, false, "unresolved argument"],
    ["revalidatePath(`/business/${input.slug.toLowerCase()}`)", false, "locale-less literal"],
    [`const P = "/dashboard/services";\nrevalidatePath(P);`, false, "locale-less literal"],
    [`revalidatePath("/[locale]/dashboard/company", "page")`, true],
    [`revalidatePath("/[locale]/business/[slug]", "page")`, true],
    [`revalidatePath("/", "layout")`, true],
    ["revalidatePath(`/${locale}/dashboard/journal`)", true],
    ["revalidatePath(`/${input.locale}/dashboard/bookings`, \"page\")", true],
    ["const back = `/${locale}/dashboard/account`;\nrevalidatePath(back);", true],
    [`const PATH = "/[locale]/dashboard/company/history";\nrevalidatePath(PATH, "page");`, true],
  ];
  for (const [src, ok, reason] of cases) {
    it(`${ok ? "accepts" : "rejects"}: ${src.replace(/\n/g, " ⏎ ")}`, () => {
      const found = scan(src, "fixture.ts");
      expect(found).toHaveLength(1);
      expect(found[0].verdict.ok).toBe(ok);
      if (!ok) expect((found[0].verdict as { reason: string }).reason).toBe(reason);
    });
  }
});
