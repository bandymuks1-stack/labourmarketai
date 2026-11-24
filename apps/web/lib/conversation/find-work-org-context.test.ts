import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canRenderInline } from "./result-registry";

const CHAT = readFileSync(
  join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);

/**
 * Production walk 2026-10-01: after "Ieškau darbo" the worker chat showed
 * "Šis rezultatas nepasiekiamas dabartiniame kontekste" beside a working
 * "Atidaryti galimybes". The job matches are a personal-context result; a
 * worker standing in an ORGANIZATION workspace has the person identity but an
 * organization result context, so the search ran and its card was refused.
 */
describe("the job search follows the ACTIVE WORKSPACE, like its result does", () => {
  it("the opportunities result is personal-context only", () => {
    expect(canRenderInline("opportunities", "personal")).toBe(true);
    expect(canRenderInline("opportunities", "organization")).toBe(false);
  });

  it("findWork refuses in an organization workspace (not only for the company role) and offers the personal space", () => {
    const handler = CHAT.slice(CHAT.indexOf("findWork: () => runWorkflow("), CHAT.indexOf("professionStatement: () => {"));
    expect(handler).toMatch(
      /identity === "company" \|\| Boolean\(auth\?\.activeOrganizationId \|\| auth\?\.activeOrgName\)/,
    );
    expect(handler).toContain("findWorkInCompanyContext");
    expect(handler).toMatch(/`ws:\$\{personal\.id\}`/);
  });
});
