import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveActiveWorkspaceId, PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";

/**
 * Creating a brigade must not throw a sole-company owner out of their company
 * workspace (walk 2026-10-11). The single-organization default is why it
 * happened — a second (team) organization ends it — so the action pins the
 * workspace the brigade was created from, through the switcher's own core.
 */
const APP = resolve(__dirname, "..", "..");

describe("creating a brigade keeps the owner in their company workspace", () => {
  it("documents the cause: with two organizations and no pointer, the default is personal", () => {
    expect(resolveActiveWorkspaceId("company", ["co"], null)).toBe("co");
    expect(resolveActiveWorkspaceId("company", ["co", "team"], null)).toBe(PERSONAL_WORKSPACE_ID);
    expect(resolveActiveWorkspaceId("company", ["co", "team"], "co")).toBe("co");
  });

  it("the create action pins the workspace it was created from, via the validated core", () => {
    const a = readFileSync(resolve(APP, "lib/company/team-brigade-actions.ts"), "utf8");
    const fn = a.slice(a.indexOf("export async function createTeamAction"), a.indexOf("export type TeamInviteOutcome"));
    expect(fn).toMatch(/if \(outcome === "created"\)[\s\S]*switchActiveWorkspaceCore\(\{ supabase, userId: user\.id \}, expectedWorkspaceId\)/);
    expect(fn).toMatch(/expectedWorkspaceId !== PERSONAL_WORKSPACE_ID/);
  });
});
