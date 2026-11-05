import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_FILES, judgeDocsOnly, liveBuildOf } from "../../../../.github/scripts/deploy-docs-only.mjs";

/**
 * A commit touching only docs/ skips the production deploy, and nothing else may. The check compares
 * with the build production serves, so a code commit that never shipped can't hide behind a docs commit.
 */
const file = (filename: string, previous_filename?: string) => ({ filename, previous_filename });

describe("judgeDocsOnly", () => {
  it("skips only when every file is under docs/", () => {
    expect(judgeDocsOnly({ status: "ahead", files: [file("docs/a.md"), file("docs/program/b.md")] }).skip).toBe(true);
  });

  it.each([
    ["app code", "apps/web/app/page.tsx"],
    ["a workflow", ".github/workflows/deploy-vps.yml"],
    ["a migration", "supabase/migrations/20261105000000_x.sql"],
    ["a root file", "README.md"],
    ["a path that only starts like docs", "docs-old/a.md"],
    ["a nested docs folder", "apps/web/docs/a.md"],
  ])("deploys when %s changed", (_name, path) => {
    expect(judgeDocsOnly({ status: "ahead", files: [file("docs/a.md"), file(path)] }).skip).toBe(false);
  });

  it("deploys when a file moved out of or into docs/", () => {
    expect(judgeDocsOnly({ status: "ahead", files: [file("apps/web/a.md", "docs/a.md")] }).skip).toBe(false);
    expect(judgeDocsOnly({ status: "ahead", files: [file("docs/a.md", "apps/web/a.md")] }).skip).toBe(false);
  });

  it.each(["behind", "diverged", "identical", undefined])("never skips when the commit is %s", (status) => {
    expect(judgeDocsOnly({ status, files: [file("docs/a.md")] }).skip).toBe(false);
  });

  it("never skips on a missing, empty or possibly cut list", () => {
    expect(judgeDocsOnly({ status: "ahead" }).skip).toBe(false);
    expect(judgeDocsOnly({ status: "ahead", files: [] }).skip).toBe(false);
    expect(judgeDocsOnly({ status: "ahead", files: Array(MAX_FILES).fill(file("docs/a.md")) }).skip).toBe(false);
    expect(judgeDocsOnly().skip).toBe(false);
  });
});

describe("liveBuildOf", () => {
  it("reads the build of a healthy answer only", () => {
    expect(liveBuildOf({ ok: true, build: "abc1234" })).toBe("abc1234");
    expect(liveBuildOf({ ok: false, build: "abc1234" })).toBeNull();
    expect(liveBuildOf({ ok: true, build: "not a sha" })).toBeNull();
    expect(liveBuildOf({ ok: true })).toBeNull();
    expect(liveBuildOf(null)).toBeNull();
  });
});

describe("deploy-vps.yml", () => {
  const workflow = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy-vps.yml"), "utf8").replace(/\r/g, "");

  it("asks only on the automatic path, so a manual deploy always ships", () => {
    expect(workflow).toMatch(/if \[ "\$EVENT" = "workflow_run" \]; then\n\s+verdict=\$\(node \.deploy-check\/\.github\/scripts\/deploy-docs-only\.mjs "\$sha"\)/);
  });

  it("deploys when the check itself fails", () => {
    expect(workflow).toContain('|| verdict="skip=false check did not run"');
  });

  it("keeps the deploy job behind the build's skip, and its health steps in place", () => {
    expect(workflow).toContain("if: needs.build.outputs.skip != 'true'");
    expect(workflow).toContain("Require a successful Quality Gates run for this sha");
    expect(workflow).toContain("Public verification through Cloudflare");
  });
});
