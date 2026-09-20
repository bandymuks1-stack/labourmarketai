import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * LOCALE LEAK DETECTOR — every statically-written message key resolves in
 * every active locale (owner completion window 2026-09-20, §13).
 *
 * next-intl resolves a missing key to ITSELF, so `t("foo.bar")` under a
 * namespace that lacks it renders the literal text "ns.foo.bar" on screen.
 * No type error, no test failure — only a walk sees it (see the memory note
 * `raw-message-key-leak-class`). `i18n-key-resolution.test.ts` pins the
 * handful of keys an audit once caught; this guard makes the check
 * exhaustive and deterministic without a browser:
 *
 *   1. In every source file under app/, components/ and lib/ (tests and
 *      this guards folder excluded) find the translator BINDINGS —
 *      `const t = useTranslations("ns")`, `await getTranslations("ns")`,
 *      `getTranslations({ locale, namespace: "ns" })`, the root form with
 *      no namespace, and the `const [a, b] = await Promise.all([...])`
 *      destructuring that server pages use.
 *   2. Find every LITERAL call on those bindings — `t("key")`, `t.rich(…)`,
 *      `t.raw(…)` — and resolve `ns.key` against the runtime's merged
 *      catalog (base `<locale>.json` + the per-namespace files that
 *      `lib/i18n/request.ts` spreads OVER it, read from request.ts itself so
 *      a new namespace file is covered automatically).
 *   3. Assert the key exists — for `t()` / `t.rich()` as a leaf string, for
 *      `t.raw()` as any node — in EVERY active locale.
 *
 * Keys built at runtime (template literals with `${}`, identifiers) and
 * bindings whose namespace is not a string literal are NOT checkable here;
 * they are counted and reported, never asserted. `t.has()` is an existence
 * probe by design and is skipped. The check reads code, not HTML, so a
 * person's name or user content can never trip it.
 *
 * When a name is bound more than once in one file (two components, or a
 * translator prop next to a local binding) the key is accepted if ANY of
 * that name's namespaces resolves it — lenient on purpose: no false
 * positives, every genuine miss still surfaces.
 *
 * A miss is fixed by ADDING the key with real copy to every active
 * locale — never by allow-listing it here.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const MESSAGES = join(WEB_ROOT, "messages");
const SCAN_ROOTS = ["app", "components", "lib"] as const;
const SOURCE_EXT = /\.(ts|tsx)$/;
const SKIP_FILE = /\.(test|spec)\.(ts|tsx)$|\.d\.ts$/;
const SKIP_DIR = new Set(["node_modules", ".next", "guards", "__tests__", "__mocks__"]);

type Json = Record<string, unknown>;

// ── catalog: the runtime's merged view, derived from request.ts ────────────

function namespaceOverrides(): Array<{ key: string; file: string }> {
  const src = readFileSync(join(WEB_ROOT, "lib", "i18n", "request.ts"), "utf8");
  const files = [...src.matchAll(/messages\/\$\{locale\}\/([a-z-]+)\.json/g)].map((m) => m[1]!);
  const keys = [...src.matchAll(/^\s+([A-Za-z]+):\s*[A-Za-z]+\.default,?$/gm)].map((m) => m[1]!);
  expect(files.length, "request.ts namespace imports").toBeGreaterThan(0);
  expect(keys.length, "request.ts message keys").toBe(files.length);
  return files.map((file, i) => ({ key: keys[i]!, file: `${file}.json` }));
}

function mergedCatalog(locale: string, overrides: Array<{ key: string; file: string }>): Json {
  const base = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")) as Json;
  const merged: Json = { ...base };
  for (const { key, file } of overrides) {
    merged[key] = JSON.parse(readFileSync(join(MESSAGES, locale, file), "utf8")) as Json;
  }
  return merged;
}

function resolve(catalog: Json, path: string): unknown {
  let node: unknown = catalog;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = (node as Json)[part];
  }
  return node;
}

// ── source scan ───────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name) && !SKIP_FILE.test(name)) out.push(full);
  }
  return out;
}

/** Returns the text between the `(` at `open` and its balanced `)`, or null. */
function balanced(src: string, open: number, opener = "(", closer = ")"): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return { inner: src.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Namespace of a `useTranslations(...)` / `getTranslations(...)` argument
 *  list. `""` = root (no namespace); `null` = not a string literal (dynamic). */
function namespaceOf(args: string): string | null {
  const a = args.trim();
  if (a === "") return "";
  const literal = /^(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)$/.exec(a);
  if (literal) return literal[1] ?? literal[2] ?? literal[3] ?? "";
  if (a.startsWith("{")) {
    if (!/\bnamespace\s*:/.test(a)) return "";
    const ns = /\bnamespace\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*[,}]/.exec(a);
    return ns ? (ns[1] ?? ns[2] ?? ns[3] ?? "") : null;
  }
  return null;
}

type Binding = { name: string; ns: string | null };

/** Split a bracketed list on top-level commas. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function bindingsIn(src: string): Binding[] {
  const out: Binding[] = [];
  // const t = useTranslations("ns") / const t = await getTranslations({...})
  const single = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(/g;
  for (const m of src.matchAll(single)) {
    const open = m.index! + m[0].length - 1;
    const b = balanced(src, open);
    if (!b) continue;
    out.push({ name: m[1]!, ns: namespaceOf(b.inner) });
  }
  // const [a, b] = await Promise.all([ getTranslations("x"), getTranslations("y") ])
  const promiseAll = /\b(?:const|let|var)\s*\[([^\]]*)\]\s*=\s*await\s+Promise\.all\s*\(\s*\[/g;
  for (const m of src.matchAll(promiseAll)) {
    const names = m[1]!.split(",").map((s) => s.trim());
    const open = m.index! + m[0].length - 1;
    const b = balanced(src, open, "[", "]");
    if (!b) continue;
    const elements = splitTopLevel(b.inner);
    elements.forEach((el, i) => {
      const name = names[i];
      if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return;
      const call = /^\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(/.exec(el);
      if (!call) return;
      const inner = balanced(el, call[0].length - 1);
      if (!inner) return;
      out.push({ name, ns: namespaceOf(inner.inner) });
    });
  }
  return out;
}

type Call = { name: string; method: "t" | "rich" | "raw"; key: string | null; line: number };

function callsIn(src: string, names: Set<string>): Call[] {
  if (names.size === 0) return [];
  const alternation = [...names].map((n) => n.replace(/\$/g, "\\$")).join("|");
  const re = new RegExp(`(?<![\\w$.])(${alternation})(?:\\.(rich|raw|has|markup))?\\s*\\(`, "g");
  const out: Call[] = [];
  for (const m of src.matchAll(re)) {
    const method = m[2];
    if (method === "has" || method === "markup") continue;
    const open = m.index! + m[0].length - 1;
    const args = balanced(src, open);
    if (!args) continue;
    const first = splitTopLevel(args.inner)[0]?.trim() ?? "";
    const literal = /^(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)$/.exec(first);
    const line = src.slice(0, m.index!).split("\n").length;
    out.push({
      name: m[1]!,
      method: (method as "rich" | "raw" | undefined) ?? "t",
      key: literal ? (literal[1] ?? literal[2] ?? literal[3] ?? "") : null,
      line,
    });
  }
  return out;
}

/** Inline `(await getTranslations("ns"))("key")` — one-shot, no binding. */
function inlineCallsIn(src: string): Array<{ ns: string; key: string; line: number }> {
  const out: Array<{ ns: string; key: string; line: number }> = [];
  const re = /\(\s*await\s+getTranslations\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*\)\s*\)\s*\(\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of src.matchAll(re)) {
    out.push({
      ns: m[1] ?? m[2] ?? "",
      key: m[3] ?? m[4] ?? "",
      line: src.slice(0, m.index!).split("\n").length,
    });
  }
  return out;
}

// ── run ───────────────────────────────────────────────────────────────────

type Miss = { file: string; line: number; full: string; locales: string[]; reason: string };

function scan() {
  const overrides = namespaceOverrides();
  const catalogs = new Map<string, Json>();
  for (const locale of activeLocales) catalogs.set(locale, mergedCatalog(locale, overrides));

  const files = SCAN_ROOTS.flatMap((r) => walk(join(WEB_ROOT, r)));
  let filesWithBindings = 0;
  let staticChecked = 0;
  let dynamicKeys = 0;
  let dynamicBindings = 0;
  const misses: Miss[] = [];

  const check = (file: string, line: number, full: string, method: "t" | "rich" | "raw") => {
    staticChecked++;
    const bad: string[] = [];
    let reason = "missing";
    for (const [locale, catalog] of catalogs) {
      const node = resolve(catalog, full);
      if (node === undefined) bad.push(locale);
      else if (method !== "raw" && typeof node !== "string") {
        bad.push(locale);
        reason = "not a leaf string (t() on a message group)";
      }
    }
    if (bad.length) misses.push({ file, line, full, locales: bad, reason });
  };

  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    if (!src.includes("Translations(")) continue;
    const rel = relative(WEB_ROOT, abs).replace(/\\/g, "/");
    const bindings = bindingsIn(src);
    const inline = inlineCallsIn(src);
    if (bindings.length === 0 && inline.length === 0) continue;
    filesWithBindings++;

    for (const c of inline) check(rel, c.line, c.ns ? `${c.ns}.${c.key}` : c.key, "t");

    // name -> set of literal namespaces; a dynamic binding poisons the name.
    const byName = new Map<string, Set<string> | null>();
    for (const b of bindings) {
      if (b.ns === null) {
        dynamicBindings++;
        byName.set(b.name, null);
        continue;
      }
      const cur = byName.get(b.name);
      if (cur === null) continue;
      (cur ?? byName.set(b.name, new Set()).get(b.name)!).add(b.ns);
    }

    for (const call of callsIn(src, new Set(byName.keys()))) {
      const namespaces = byName.get(call.name);
      if (namespaces === null || namespaces === undefined) {
        dynamicKeys++;
        continue;
      }
      if (call.key === null) {
        dynamicKeys++;
        continue;
      }
      staticChecked++;
      const candidates = [...namespaces].map((ns) => (ns ? `${ns}.${call.key}` : call.key!));
      const bad: string[] = [];
      let reason = "missing";
      for (const [locale, catalog] of catalogs) {
        const ok = candidates.some((full) => {
          const node = resolve(catalog, full);
          if (node === undefined) return false;
          if (call.method !== "raw" && typeof node !== "string") {
            reason = "not a leaf string (t() on a message group)";
            return false;
          }
          return true;
        });
        if (!ok) bad.push(locale);
      }
      if (bad.length) misses.push({ file: rel, line: call.line, full: candidates.join(" | "), locales: bad, reason });
    }
  }

  return { files: files.length, filesWithBindings, staticChecked, dynamicKeys, dynamicBindings, misses };
}

describe("i18n — every statically-written message key resolves in every active locale", () => {
  const result = scan();

  it("scans the real tree (guard is not vacuous)", () => {
    expect(result.files).toBeGreaterThan(500);
    expect(result.filesWithBindings).toBeGreaterThan(300);
    expect(result.staticChecked).toBeGreaterThan(3000);
    // Reported, not asserted: keys the guard cannot check statically.
    // eslint-disable-next-line no-console
    console.info(
      `[i18n-key-resolution-static] files=${result.files} withTranslator=${result.filesWithBindings} ` +
        `staticKeysChecked=${result.staticChecked} notStaticallyCheckable=${result.dynamicKeys} ` +
        `(dynamic bindings: ${result.dynamicBindings}) locales=${activeLocales.join(",")}`,
    );
  });

  it("no literal key is missing from any active locale (raw-key leak)", () => {
    const report = result.misses
      .map((m) => `${m.file}:${m.line}  ${m.full}  [${m.locales.join(",")}]  ${m.reason}`)
      .join("\n");
    expect(
      result.misses,
      `These keys are written in code but do not resolve — next-intl would render the raw key path. ` +
        `Add the key with real copy to every active locale (never allow-list it):\n${report}`,
    ).toEqual([]);
  });
});
