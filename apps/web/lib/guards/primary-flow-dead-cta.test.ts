import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Primary-flow dead-CTA guard (placeholder-cleanup v1).
 *
 * A CTA that links to `href="#"` goes nowhere — to a real user it is a fake /
 * dead control on the primary flow. After the cleanup there must be none in the
 * app route tree. If you intentionally add an in-page anchor, give it a real
 * fragment id (e.g. `href="#pricing"`), never a bare `"#"`.
 */
const WEB = resolve(__dirname, "..", "..");

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

// Bare dead anchors only: href="#" or href={"#"} / href={`#`}. A real fragment
// like href="#pricing" is allowed.
const DEAD_CTA = /href=\{?["'`]#["'`]\}?/;

describe("primary-flow dead CTA guard", () => {
  for (const dir of ["app", "components"]) {
    it(`apps/web/${dir} has no bare href="#" dead CTAs`, () => {
      const root = join(WEB, dir);
      const files = walk(root, (p) => p.endsWith(".tsx"));
      const offenders: string[] = [];
      for (const f of files) {
        if (DEAD_CTA.test(readFileSync(f, "utf8"))) offenders.push(f.slice(WEB.length + 1).replace(/\\/g, "/"));
      }
      expect(offenders, `dead href="#" CTAs found in: ${offenders.join(", ")}`).toEqual([]);
    });
  }
});
