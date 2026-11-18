/**
 * GUARD — the phone's Today shows the organization-only stations (find
 * candidates, agency offers, programmes) only where they can work, decided by
 * the WORKSPACE axis the server reports (`context.list`), never by a guessed
 * role (SEP-5). A loading or failed read keeps them; posting a need is open to
 * a person too and is never hidden.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const today = readFileSync(resolve(REPO, "apps/mobile/app/(shell)/today.tsx"), "utf8");

const ORG_ONLY = ["today-open-candidates", "today-open-agency-offers", "today-open-education", "today-open-agency"];

describe("mobile Today follows the active workspace", () => {
  it("hides organization stations only when the server says the workspace is personal", () => {
    expect(today).toContain('useCapability<ContextListData>("context.list")');
    expect(today).toMatch(/workspaces\.state\.status === "loaded" &&/);
    expect(today).toContain('w.active && w.kind === "personal"');
    expect(today).not.toMatch(/organizationType|relationship/);
  });

  it("gates exactly the organization stations", () => {
    const start = today.indexOf("{personal ? null : (");
    const end = today.indexOf("</>", start);
    expect(start).toBeGreaterThan(-1);
    const gated = today.slice(start, end);
    for (const id of ORG_ONLY) expect(gated, id).toContain(`testID="${id}"`);
    expect(gated).not.toContain('testID="today-open-need"');
    expect(today).toContain('testID="today-open-need"');
  });
});
