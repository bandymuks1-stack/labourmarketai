import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRow,
  firstDeploy,
  ledgerState,
  linkFunctions,
  moduleOf,
  parseFunctionRegister,
  scrub,
} from "../../../../.github/scripts/system-register.mjs";

/**
 * The generated SYSTEM_REGISTER (owner order 2026-11-03) cites FUNCTION_REGISTER and the
 * deploy runs — it never invents a status. Pin the derivations it makes.
 */
const snapshot = {
  read_at: "2026-09-08T11:07:02Z",
  rows: [
    { version: "0001", name: "initial_schema" },
    { version: "20260908110702", name: "search_public_vacancy_previews_count_v2" },
  ],
};

describe("system-register — derivations", () => {
  it("maps paths to coarse modules", () => {
    expect(moduleOf("apps/web/lib/journal/x.ts")).toBe("lib/journal");
    expect(moduleOf("apps/web/app/[locale]/(app)/dashboard/planning/page.tsx")).toBe("app/dashboard/planning");
    expect(moduleOf("apps/web/app/api/mcp/route.ts")).toBe("app/api/mcp");
    expect(moduleOf("apps/web/app/layout.tsx")).toBe("app/(root)");
    expect(moduleOf("apps/mobile/src/a.ts")).toBe("apps/mobile");
    expect(moduleOf("supabase/migrations/20261103130000_x.sql")).toBe("supabase/migrations");
    expect(moduleOf(".github/scripts/a.mjs")).toBe(".github/scripts");
    expect(moduleOf("docs/program/FUNCTION_REGISTER.md")).toBe("docs/program");
    expect(moduleOf("README.md")).toBe("(root)");
  });

  it("never claims 'not applied' for a migration the dated snapshot cannot know about", () => {
    expect(ledgerState("supabase/migrations/0001_initial_schema.sql", snapshot, "2026-05-01T00:00:00Z").ledger).toBe("in_snapshot");
    expect(
      ledgerState("supabase/migrations/20260906080000_search_public_vacancy_previews_count_v2.sql", snapshot, "2026-09-07T00:00:00Z"),
    ).toEqual({ ledger: "in_snapshot", version: "20260908110702" });
    expect(ledgerState("supabase/migrations/20260801000000_gone.sql", snapshot, "2026-08-02T00:00:00Z").ledger).toBe("not_in_snapshot");
    expect(ledgerState("supabase/migrations/20261103000000_new.sql", snapshot, "2026-11-03T12:00:00Z").ledger).toBe(
      "unknown_after_snapshot",
    );
    expect(ledgerState("supabase/migrations/20261103000000_open.sql", snapshot, null).ledger).toBe("unknown_after_snapshot");
  });

  it("a deploy of sha S ships every first-parent commit at or before S", () => {
    const order = new Map([["a", 0], ["b", 1], ["c", 2]]);
    const deploys = [
      { run: 1, sha: "a", at: "2026-10-17T00:00:00Z" },
      { run: 2, sha: "c", at: "2026-10-18T00:00:00Z" },
    ];
    expect(firstDeploy("a", order, deploys)?.run).toBe(1);
    expect(firstDeploy("b", order, deploys)?.run).toBe(2);
    expect(firstDeploy("zz", order, deploys)).toBeNull();
    expect(firstDeploy("c", order, deploys.slice(0, 1))).toBeNull();
  });

  it("links FUNCTION_REGISTER rows by PR number, merge commit or touched file — with confidence", () => {
    const rows = parseFunctionRegister(
      [
        "| ID | Function | Status | Last checked | Evidence | In production | Remaining |",
        "|---|---|---|---|---|---|---|",
        "| 1.1 | Sign-up | LIVE_VERIFIED | 2026-10-28 | walk (#2861/#2864) run 39849107061 | yes | |",
        "| 1.2 | OAuth | PASS_CI_ONLY | 2026-10-18 | live 2e4ae2b4b | no | |",
        "| 1.3 | Reset | FAIL | 2026-11-02 | `lib/auth/reset.ts` | no | |",
      ].join("\n"),
    );
    expect(rows.map((r) => r.id)).toEqual(["1.1", "1.2", "1.3"]);
    expect(rows[0].shas).toEqual([]); // a run id is not a commit
    const pr = { number: 2864, mergeSha: "2e4ae2b4b0000000000000000000000000000000", files: [{ path: "apps/web/lib/auth/reset.ts" }] };
    expect(linkFunctions(pr, rows)).toEqual([
      { id: "1.1", status: "LIVE_VERIFIED", confidence: "high" },
      { id: "1.2", status: "PASS_CI_ONLY", confidence: "medium" },
      { id: "1.3", status: "FAIL", confidence: "low" },
    ]);
  });

  it("an unmerged PR has no deploy and no merge commit; titles never carry an e-mail address", () => {
    const row = buildRow(
      {
        number: 5, title: "fix for someone@example.com", state: "CLOSED", createdAt: "2026-01-01T00:00:00Z", closedAt: "2026-01-02T00:00:00Z",
        mergedAt: null, baseRefName: "main", mergeSha: "abc", labels: [],
        files: [{ path: "supabase/migrations/20260101000000_x.sql", changeType: "ADDED" }, { path: "apps/web/lib/a/b.test.ts", changeType: "MODIFIED" }],
      },
      { snapshot, order: new Map(), deploys: [], functionRows: [] },
    );
    expect(row.deployState).toBe("n/a");
    expect(row.mergeSha).toBeNull();
    expect(row.title).toBe("fix for [e-mail]");
    expect(row.migrations).toEqual([{ file: "20260101000000_x.sql", ledger: "not_in_snapshot" }]);
    expect(row.tests).toEqual(["apps/web/lib/a/b.test.ts"]);
    expect(scrub("a.b+c@d-e.co.uk")).toBe("[e-mail]");
  });

  it("the generated file says it is generated, how to regenerate, and that FUNCTION_REGISTER is canonical", () => {
    const md = readFileSync(join(__dirname, "..", "..", "..", "..", "docs", "program", "SYSTEM_REGISTER.md"), "utf8");
    expect(md).toMatch(/GENERATED — do not edit by hand/);
    expect(md).toMatch(/node \.github\/scripts\/system-register\.mjs/);
    expect(md).toMatch(/FUNCTION_REGISTER\.md`\]\(FUNCTION_REGISTER\.md\) stays the ONE canonical status/);
    expect(md).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}\b(?!\/)/i);
  });
});
