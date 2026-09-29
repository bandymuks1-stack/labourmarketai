/**
 * NO FUNCTION CROSSES THE SERVER → CLIENT BOUNDARY.
 *
 * A `"use client"` component receives only serializable props (plus server
 * actions). A server file that hands it an inline function throws "Functions
 * cannot be passed directly to Client Components" at REQUEST time — build,
 * typecheck, vitest and render harnesses are all green, and the route falls
 * to "Įvyko klaida. Bandykite dar kartą." for the visitors who reach that
 * branch.
 *
 * It happened twice in production:
 *   · 2026-09-16 — /dashboard/company/history (formatter props);
 *   · 2026-09-29 — /jobs/[id] for every signed-in reader of a foreign-
 *     language ad (the translate control's `remaining`/`exhausted` labels).
 *     The anonymous half rendered, so the page looked fine to a logged-out
 *     check while a registered visitor coming back to the job hit the error.
 *
 * This guard reads every SERVER file under `app/` with the TypeScript parser,
 * resolves each JSX tag to its import, and fails when a prop given to a
 * component whose module starts with "use client" contains an arrow function
 * or function expression anywhere in its value.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const isClientSource = (src: string) => /^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

function resolveModule(spec: string, fromFile: string): string | null {
  const base = spec.startsWith("@/") ? join(WEB, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(fromFile), spec) : null;
  if (!base) return null;
  for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

const clientCache = new Map<string, boolean>();
function isClientModule(file: string): boolean {
  if (!clientCache.has(file)) clientCache.set(file, isClientSource(readFileSync(file, "utf8")));
  return clientCache.get(file)!;
}

function hasInlineFunction(node: ts.Node): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  // A callback handed to a call (`rows.map((r) => …)`, `Object.fromEntries(…)`)
  // is RUN on the server; only its result reaches the prop. Its arguments are
  // skipped; the callee and the result shape are still read.
  if (ts.isCallExpression(node)) {
    return hasInlineFunction(node.expression) || node.arguments.some((a) => !(ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && hasInlineFunction(a));
  }
  // A nested JSX element is its own boundary decision, checked on its own.
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return false;
  return ts.forEachChild(node, (c) => (hasInlineFunction(c) ? true : undefined)) ?? false;
}

function violationsIn(file: string): string[] {
  const src = readFileSync(file, "utf8");
  if (isClientSource(src)) return [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const clientNames = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.importClause?.isTypeOnly) continue;
    const target = resolveModule(st.moduleSpecifier.text, file);
    if (!target || !isClientModule(target)) continue;
    const clause = st.importClause;
    if (clause?.name) clientNames.add(clause.name.text);
    const nb = clause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) clientNames.add(el.name.text);
  }
  if (clientNames.size === 0) return [];
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf).split(".")[0];
      if (clientNames.has(tag)) {
        for (const attr of node.attributes.properties) {
          const init = ts.isJsxAttribute(attr) ? attr.initializer : ts.isJsxSpreadAttribute(attr) ? attr.expression : undefined;
          if (init && hasInlineFunction(init)) {
            const name = ts.isJsxAttribute(attr) ? attr.name.getText(sf) : "{...spread}";
            const line = sf.getLineAndCharacterOfPosition(attr.getStart(sf)).line + 1;
            found.push(`${file.slice(WEB.length + 1).replace(/\\/g, "/")}:${line} <${tag} ${name}>`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("server → client boundary: no inline function props", () => {
  it("no server file under app/ hands a \"use client\" component an inline function", () => {
    const violations = walk(join(WEB, "app")).flatMap(violationsIn);
    expect(violations).toEqual([]);
  });

  it("the guard itself sees the 2026-09-29 shape", () => {
    // the exact shape that broke /jobs/[id], parsed through the same visitor
    const src = `import { VacancyTranslateControl } from "@/components/app/vacancy-translate-control";
export default function P() { return <VacancyTranslateControl labels={{ remaining: (c: number) => String(c) }} />; }`;
    const sf = ts.createSourceFile("x.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let seen = false;
    const visit = (n: ts.Node) => {
      if (ts.isJsxSelfClosingElement(n)) for (const a of n.attributes.properties) if (ts.isJsxAttribute(a) && a.initializer && hasInlineFunction(a.initializer)) seen = true;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(seen).toBe(true);
    expect(isClientModule(join(WEB, "components/app/vacancy-translate-control.tsx"))).toBe(true);
  });
});
