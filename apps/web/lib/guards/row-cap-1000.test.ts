import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * THE SERVER ANSWERS AT MOST 1000 ROWS PER REQUEST.
 *
 * A single `.limit(N)` with N > 1000 is a silent `.limit(1000)`: every row
 * past it disappears, and a "truncated when rows >= N" check never fires.
 * It happened to an organization's history records (#2551) and to the admin
 * activation funnel's telemetry (#2561). Reads that can exceed 1000 rows PAGE
 * with `.range()` (readAllPages in lib/journal/journal-list-core.ts or
 * lib/organization-evidence/evidence-pagination.ts).
 *
 * This guard resolves every `.limit(<literal | CONSTANT>[ + n])` in code
 * (constants resolved in the same file or from any `export const` in the
 * tree; a sentinel `CAP + 1` counts as CAP + 1) and compares each file with
 * its baseline EXACTLY: the baseline lists the latent cases known on
 * 2026-10-20 (tables that are small today). Paging a read lowers its count
 * and the baseline with it; a new over-cap read fails.
 */
const WEB = join(__dirname, "..", "..");
const ROOTS = ["lib", "app", "components"];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      out.push(...files(p));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** A numeric literal as written (`20_000`), or undefined. */
function numeric(node: ts.Node | undefined): number | undefined {
  return node && ts.isNumericLiteral(node) ? Number(node.text.replace(/_/g, "")) : undefined;
}

/** `const NAME = <number>` declarations of a file (exported or not). */
function numericConsts(sf: ts.SourceFile): Map<string, { value: number; exported: boolean }> {
  const out = new Map<string, { value: number; exported: boolean }>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node) && node.declarationList.flags & ts.NodeFlags.Const) {
      const exported = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of node.declarationList.declarations) {
        const v = numeric(d.initializer);
        if (ts.isIdentifier(d.name) && v !== undefined) out.set(d.name.text, { value: v, exported });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const parsed = new Map<string, ts.SourceFile>();
const sourceOf = (f: string) => {
  let sf = parsed.get(f);
  if (!sf) {
    sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    parsed.set(f, sf);
  }
  return sf;
};

const all = ROOTS.flatMap((r) => files(join(WEB, r)));
const exported = new Map<string, number>();
for (const f of all) {
  for (const [name, c] of numericConsts(sourceOf(f))) if (c.exported) exported.set(name, c.value);
}

/**
 * Over-cap `.limit(…)` CALLS in the syntax tree — a comment or a string that
 * merely mentions `.limit(5000)` (or contains `/*`) is not a call and is not
 * read. The argument is a literal, a constant (this file first, then any
 * exported one), or a constant + literal sentinel (`CAP + 1`).
 */
function overCapLimitsIn(sf: ts.SourceFile): number {
  const local = numericConsts(sf);
  const valueOf = (e: ts.Expression): number | undefined => {
    const lit = numeric(e);
    if (lit !== undefined) return lit;
    if (ts.isIdentifier(e)) return local.get(e.text)?.value ?? exported.get(e.text);
    if (ts.isParenthesizedExpression(e)) return valueOf(e.expression);
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = valueOf(e.left);
      const b = valueOf(e.right);
      return a !== undefined && b !== undefined ? a + b : undefined;
    }
    return undefined;
  };
  let n = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "limit" &&
      node.arguments.length === 1
    ) {
      const v = valueOf(node.arguments[0]!);
      if (v !== undefined && v > 1000) n += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

const overCapLimits = (src: string): number =>
  overCapLimitsIn(ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));

/** Exact. Paging a read lowers both; a new over-cap read fails. */
const BASELINE: Record<string, number> = {
  "lib/admin/ai-cost.ts": 2,
  "lib/admin/pilots.ts": 2,
  "lib/capabilities/marketplace-capabilities.ts": 1,
  "lib/communication/organization-scope.ts": 1,
  "lib/documents/document-centre.ts": 1,
  // ENTRY_LIMIT (1000) + 1 sentinel and CONFIRMATION_LIMIT: the sentinel's
  // `length > ENTRY_LIMIT` check can never fire on a 1000-row answer.
  "lib/education/recognition-evidence.ts": 2,
  "lib/evidence/confirmed-work-read.ts": 3,
  "lib/invitations/network.ts": 1,
  "lib/journal/project-gallery.ts": 1,
  // Matching stage-1 candidate scans; truncation is checked as rows >= cap,
  // which a 1000-row answer never reaches.
  "lib/market/match-subject.ts": 4,
  "lib/notifications/event-emitters.ts": 2,
  "lib/ops/product-metrics.ts": 1,
    "lib/organization-evidence/history-quality-read.ts": 1,
  "lib/organization-people/ingest-service.ts": 1,
  "lib/player-card/player-card.ts": 1,
  "lib/profile/trust-signals.ts": 1,
  "lib/worker/weekly-intelligence.ts": 1,
};

describe("no read asks the server for more than its 1000-row cap without paging", () => {
  it("every file's over-cap .limit() count equals its baseline exactly", () => {
    const found = new Map<string, number>();
    for (const f of all) {
      const n = overCapLimitsIn(sourceOf(f));
      if (n > 0) found.set(relative(WEB, f).replace(/\\/g, "/"), n);
    }
    const diff: string[] = [];
    for (const rel of new Set([...found.keys(), ...Object.keys(BASELINE)])) {
      const n = found.get(rel) ?? 0;
      const b = BASELINE[rel] ?? 0;
      if (n > b) diff.push(`${rel}: ${n} over-cap .limit() (baseline ${b}) — page it with .range()`);
      if (n < b) diff.push(`${rel}: ${n} over-cap .limit() but baseline says ${b} — lower the baseline`);
    }
    expect(diff).toEqual([]);
  });

  it("comments and strings are not calls, even with glob-like text before a real call", () => {
    const src = [
      "// providers/* are listed",
      'const G = "app/*";',
      'q.limit(5000); /* q.limit(9000) */ const s = "q.limit(7000)";',
    ].join("\n");
    expect(overCapLimits(src)).toBe(1);
  });

  it("the resolver sees a literal, a local constant, an exported constant and a sentinel", () => {
    expect(
      overCapLimits("const A = 5000; const C = 1000; q.limit(A); q.limit(2000); q.limit(1000); q.limit(C + 1); q.limit(B);"),
    ).toBe(3);
  });
});
