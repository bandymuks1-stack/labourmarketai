import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `/dashboard/start/company?org=<id>` EDITS THAT ORGANIZATION OR SAYS WHY IT
 * CANNOT — never another one (owner program 2026-09-23).
 *
 * THE DEFECT, PROVEN ON PRODUCTION. The workspace chip's "Nurodyti
 * pavadinimą" door links `?org=<id>` for an unnamed organization. The page
 * never read `org`: it resolved the target from the ACTIVE workspace and fell
 * back to the single owned company. For the owner's unnamed agency-backed
 * organization (no company binding) that fallback opened the OTHER, verified
 * company — and the save "succeeded" against the wrong organization.
 *
 * Pinned: the page reads `org`; with `org` present the target is resolved
 * through the employer chain with THAT workspace as the active one (the
 * membership gate still decides); and the `org` branch contains no fallback
 * to the active workspace, to the owned list or to "the" company.
 */

const APP_ROOT = join(__dirname, "..", "..");
const PAGE = readFileSync(
  join(APP_ROOT, "app", "[locale]", "dashboard", "start", "company", "page.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const CHIP = readFileSync(
  join(APP_ROOT, "components", "app", "conversation", "chat", "workspace-chip.tsx"),
  "utf8",
);

/** Executable code only — the comments tell the incident in prose. */
const codeOf = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The `org` branch: from `if (requestedOrg !== "")` to the `else if` after it. */
function orgBranch(src: string): string {
  const code = codeOf(src);
  const start = code.indexOf('if (requestedOrg !== "") {');
  const end = code.indexOf("} else if (createRequested", start);
  return start >= 0 && end > start ? code.slice(start, end) : "";
}

function violations(src: string): string[] {
  const out: string[] = [];
  const code = codeOf(src);
  if (!/org\?: string/.test(code)) out.push("searchParams does not declare `org`");
  if (!/sp\.org/.test(code)) out.push("the page never reads `org`");
  const branch = orgBranch(src);
  if (!branch) {
    out.push("no exclusive `org` branch ahead of the legacy target chain");
    return out;
  }
  if (!/resolveEmployerCompanyCore\(/.test(branch)) out.push("`org` is not resolved through the employer chain");
  if (!/activeWorkspaceId: requestedOrg/.test(branch)) out.push("the requested org is not the resolved workspace");
  if (!/"no-company-binding"/.test(branch)) out.push("no-company-binding is not its own honest state");
  // THE FALLBACKS THAT WROTE THE WRONG ORGANIZATION'S NAME.
  for (const [pattern, why] of [
    [/resolveEmployerCompanyContext\(/, "falls back to the ACTIVE workspace"],
    [/ownedRows\[0\]/, "falls back to the first owned company"],
    [/ownedRows\.length === 1/, "falls back to the single owned company"],
    [/\bshell\b/, "falls back to a shell company"],
  ] as const) {
    if (pattern.test(branch)) out.push(`the org branch ${why}`);
  }
  return out;
}

describe("?org= names the ONE organization the setup form may touch", () => {
  it("the page reads `org` and resolves it with no fallback branch", () => {
    expect(violations(PAGE)).toEqual([]);
  });

  it("the honest states replace the form — a form is never shown for an organization it cannot edit", () => {
    const code = codeOf(PAGE);
    expect(code).toMatch(/requestedOrgState === "no-company-profile"/);
    expect(code).toMatch(/requestedOrgState === "not-available"/);
    expect(code).toMatch(
      /!ambiguous &&\s*\(requestedOrgState === null \|\| requestedOrgState === "edit"\)/,
    );
    // The one canonical action for an organization without a company profile.
    expect(code).toMatch(/\/dashboard\/start\/company\?new=1/);
  });

  it("the chip still sends the organization it means", () => {
    expect(CHIP).toMatch(/\/dashboard\/start\/company\?org=\$\{encodeURIComponent\(w\.id\)\}/);
  });

  it("NEGATIVE CONTROL — every fallback is caught if it returns to the org branch", () => {
    const anchor = 'requestedOrgState = "no-company-profile";';
    expect(PAGE.includes(anchor)).toBe(true);
    for (const fallback of [
      "const ctx = await resolveEmployerCompanyContext();",
      "company = ownedRows[0];",
      "if (ownedRows.length === 1) company = ownedRows[0];",
    ]) {
      const mutated = PAGE.replace(anchor, `${anchor}\n        ${fallback}`);
      expect(violations(mutated).length, `undetected: ${fallback}`).toBeGreaterThan(0);
    }
    // …and a page that stops reading `org` at all is caught too.
    expect(violations(PAGE.replace(/sp\.org/g, "sp.new")).length).toBeGreaterThan(0);
  });
});
