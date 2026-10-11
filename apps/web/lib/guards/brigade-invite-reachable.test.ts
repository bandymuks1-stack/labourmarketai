import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A crew can actually be formed (walk 2026-10-11): `profiles` is own-row-only,
 * so the worker's address could never be read and EVERY brigade invitation
 * ended `no_email`. The owner now types the address when it cannot be read
 * (the worker still accepts with their own account — consent unchanged), and
 * people who joined the organization by invitation are in the pool.
 * No service-role read was added for this.
 */
const APP = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");

describe("brigade invitations can reach a worker", () => {
  it("the action accepts an owner-typed address only when lookup fails, validated", () => {
    const a = read("lib/company/team-brigade-actions.ts");
    expect(a).toMatch(/\(await lookupLinkedWorkerEmail\(input\.workerId\)\) \?\?/);
    expect(a).toMatch(/invitationType: "join_team"/);
  });

  it("the panel asks for the address after no_email and resends with it", () => {
    const p = read("components/app/team-brigades-panel.tsx");
    expect(p).toMatch(/setAskEmail\(\(a\) => \(\{ \.\.\.a, \[teamId\]: res\.outcome === "no_email" \}\)\)/);
    expect(p).toContain("team-invite-email-");
  });

  it("the pool includes the organization's engagement employees, and no admin client is used", () => {
    const b = read("lib/company/team-brigades.ts");
    expect(b).toMatch(/from\("engagement_contexts"\)[\s\S]{0,200}\.eq\("organization_id", employer\.organizationId\)/);
    expect(b).not.toMatch(/createAdminClient/);
  });
});
