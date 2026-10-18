import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The chat's result context follows the acting organisation WORKSPACE by id.
 * Full-spine production walk 2026-09-05: a freshly onboarded organisation
 * without a name (legal_name / display_name still null) got context
 * "personal" because the context was keyed on `activeOrgName`, so the
 * candidates result (contexts: ["organization"]) rendered the honest fallback
 * for exactly the organisations that most need it. Pins: the chat derives the
 * context from `activeOrganizationId` (name only as a secondary signal), and
 * the dashboard layout still hands both down.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("result context is keyed by organisation id, not by its display name", () => {
  it("the chat derives ResultContext from activeOrganizationId", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const m = chat.match(/const resultContext: ResultContext =[\s\S]{0,200}?;/);
    expect(m, "resultContext derivation present").toBeTruthy();
    expect(m![0]).toContain("auth0?.activeOrganizationId");
    expect(m![0]).toContain('"organization"');
    expect(m![0]).not.toMatch(/=\s*auth0\?\.activeOrgName\s*\?/);
  });
  it("the dashboard layout hands activeOrganizationId to the auth context", () => {
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/const activeOrganizationId: string \| null = activeWorkspace\?\.id \?\? null;/);
    expect(layout).toMatch(/activeOrganizationId,/);
    const ctx = read("lib/auth/context.tsx");
    expect(ctx).toMatch(/activeOrganizationId\?: string \| null;/);
  });
});
