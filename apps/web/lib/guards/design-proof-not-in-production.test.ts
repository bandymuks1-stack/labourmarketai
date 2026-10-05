import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * /design-proof is DEVELOPMENT EVIDENCE, not product (owner decision
 * 2026-10-05): fixture people, English-only copy, a switchable "context"
 * control. It must never be publicly served in production, never indexed and
 * never linked from a real route. The committed source stays (history and
 * evidence); only its production reachability is pinned here.
 *
 * Browser-level proof (a production build answers 404) is recorded with the
 * slice that introduced this guard; this file pins the structural causes of
 * that behaviour so a later edit cannot quietly reopen the route.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("app/[locale]/design-proof/page.tsx");

const GATE = 'if (process.env.NODE_ENV === "production") notFound();';

/** The first statement inside the page function's body. */
function firstStatement(source: string): string {
  const fn = source.indexOf("export default async function DesignProofPage");
  const open = source.indexOf(") {\n", fn);
  return source.slice(open + 4).trimStart();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const abs = join(dir, e);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(tsx?|mjs)$/.test(e)) out.push(abs);
  }
  return out;
}

const PROOF_OWNED = [
  "app/[locale]/design-proof/",
  "components/app/system/",
  "components/app/signature/",
  "components/app/spatial/",
  "lib/design-proof/",
  "lib/guards/",
];

describe("/design-proof is not a production route", () => {
  it("the page 404s in production BEFORE it reads params or renders anything", () => {
    expect(firstStatement(PAGE).startsWith(GATE)).toBe(true);
  });

  it("is never indexed", () => {
    expect(PAGE).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("no real route, sitemap or navigation links to it", () => {
    const offenders = [...walk(join(WEB, "app")), ...walk(join(WEB, "components")), ...walk(join(WEB, "lib"))]
      .map((abs) => relative(WEB, abs).split(sep).join("/"))
      .filter((rel) => !PROOF_OWNED.some((p) => rel.startsWith(p)))
      .filter((rel) => /["'`]\/(?:\$\{[^}]+\}\/)?design-proof/.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it("NEGATIVE CONTROL: a route without the production gate would fail the first check", () => {
    const ungated = "export default async function DesignProofPage() {\n  const { locale } = await params;\n}";
    expect(firstStatement(ungated).startsWith(GATE)).toBe(false);
  });
});
