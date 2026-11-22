/**
 * GUARD — owner P0 security directive (2026-11-21), the code-only fixes:
 *
 *   - exports: free text a person typed is never run as a spreadsheet formula
 *     (timesheets, finance and journal exports write csvExportCell);
 *     a plain signed number stays a number;
 *   - MCP: a cookie-identified call must be exactly application/json (the MIME
 *     essence), so a preflight-free "simple" request cannot pass;
 *   - a confirm tool is never advertised as idempotent (its token is single-use);
 *   - an invitation sign-up never forwards a `role` in the auth metadata.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { csvExportCell } from "@/lib/projects/operations-report";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("security P0 — code-only fixes", () => {
  it("guards formula-looking cells and keeps signed numbers", () => {
    for (const v of ["=HYPERLINK(\"x\")", "+1+1", "@SUM(A1)", "-1+cmd", "\tx", "\rx", "-x"]) {
      expect(csvExportCell(v).replace(/^"|"$/g, "").startsWith("'"), v).toBe(true);
    }
    for (const v of ["-12.50", "-3", "12", "plain text", ""]) expect(csvExportCell(v), v).toBe(v);
  });

  it("every person-text CSV export writes guarded cells", () => {
    for (const p of ["lib/timesheets/timesheets-model.ts", "lib/finance/finance-model.ts", "lib/journal/journal-export.ts"]) {
      const src = read(p);
      expect(src, p).toContain("cells.map(csvExportCell)");
      expect(src, p).not.toMatch(/cells\.map\(csvCell\)/);
    }
  });

  it("the MCP door compares the MIME essence exactly", () => {
    const src = read("app/api/mcp/route.ts");
    expect(src).toContain('.split(";")[0].trim().toLowerCase() !== "application/json"');
    expect(src).not.toContain('.includes("application/json")');
  });

  it("a confirm tool is not advertised as idempotent", () => {
    expect(read("lib/capabilities/domain-action-capabilities.ts")).toContain(
      "annotations: { readOnlyHint: false, destructiveHint: !!spec.destructive, idempotentHint: false, openWorldHint: false },",
    );
  });

  it("an invitation sign-up drops any role from the auth metadata", () => {
    const src = read("lib/invitations/signup-accept-action.ts");
    expect(src).toContain("...withoutRole(input.metadata)");
    expect(src).toContain('new Set(["role", "__proto__", "constructor", "prototype"])');
  });
});
