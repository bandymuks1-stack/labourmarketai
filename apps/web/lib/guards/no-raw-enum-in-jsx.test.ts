import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO RAW ENUM AS COPY — owner directive 2026-10-09 ("no raw technical enums or
 * untranslated labels"). A database value such as `pending`, `in_progress` or
 * `staffing_agency` must reach a person through a translation, never as the
 * JSX text itself: `<span>{inv.status}</span>` shows the English token in
 * every language and leaks the schema.
 *
 * What is caught: a JSX TEXT child that is exactly `{x.status}`, `{x.kind}`,
 * `{x.state}`, `{x.category}`, `{x.direction}`, `{x.stage}` or
 * `{x.contract_type}`. Attribute uses (`data-status={x.status}`,
 * `value={x.kind}`) are not copy and are not matched.
 *
 * The allowlist is the set of occurrences that are NOT user copy today:
 *   - admin/diagnostic surfaces (operators read the raw state on purpose);
 *   - a field that already holds a TRANSLATED label despite its name.
 * It may only shrink. Adding a user-facing surface here is the defect.
 */
const ROOT = join(__dirname, "..", "..");
const SCAN = ["components", "app"];
const RAW = /(>|^\s*)\{[A-Za-z_][A-Za-z0-9_?.]*\.(status|kind|state|category|direction|stage|contract_type)\}\s*(<|$)/;

const ALLOWED = new Set([
  // operator-only diagnostics
  "components/admin/vacancy-source-run-panel.tsx",
  "app/[locale]/dashboard/admin/language-feedback/page.tsx",
  "app/[locale]/dashboard/admin/project-truth/page.tsx",
  "app/[locale]/dashboard/admin/users/[id]/page.tsx",
  // `o.status` is a label string (`labels.tooLarge` / `labels.refusals.*`), see lines ~115-141
  "components/app/organization/historical-photo-import-form.tsx",
  // `labels.kind` is a translated label prop
  "components/app/institution-recognition-form.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

describe("no raw enum rendered as JSX text", () => {
  it("only allow-listed, non-copy occurrences exist", () => {
    const offenders: string[] = [];
    for (const dir of SCAN) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (ALLOWED.has(rel)) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((l, i) => {
          if (RAW.test(l)) offenders.push(`${rel}:${i + 1}  ${l.trim().slice(0, 90)}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
