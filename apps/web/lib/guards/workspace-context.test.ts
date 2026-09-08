import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Workspace-context wiring guards (real-user workflow rebuild W1).
 *
 * Pins the load-bearing decisions of the workspace slice so a future patch
 * cannot silently regress them:
 *
 *  1. The workspace resolver EXTENDS the canonical membership model — it
 *     reads `engagement_contexts` (doctrine §5.5) and the EXISTING
 *     active-organization pointer; it never creates a parallel membership
 *     truth or a client-side org store.
 *  2. The dashboard layout resolves the workspace context for EVERY
 *     identity (not only company) and feeds it to the auth provider.
 *  3. The workspace chip is mounted BESIDE the conversation window (the
 *     simple-shell header) — the active work context is always visible.
 *  4. The chip's accent hues map onto the EXISTING brand tokens — no new
 *     palette, no raw hex (owner directive: accent indicators only, never a
 *     full theme swap).
 *  5. The three chip labels exist in every locale file (i18n parity).
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const LOCALES = [
  "lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv",
] as const;

describe("workspace context — canonical extension, not a parallel structure", () => {
  it("the resolver reads the canonical engagement_contexts spine", () => {
    const src = read("lib/company/active-organization.ts");
    expect(src).toMatch(/getWorkspaceContext/);
    expect(src).toMatch(/engagement_contexts/);
    expect(src).toMatch(/active_organization_id/); // SAME pointer, no new one
    expect(src).toMatch(/resolveActiveWorkspaceId/); // pure, membership-validated
  });

  it("switching persists via the EXISTING server-side pointer actions only", () => {
    const src = read("lib/auth/context.tsx");
    expect(src).toMatch(/switchWorkspace/);
    expect(src).toMatch(/clearActiveOrganization/);
    expect(src).toMatch(/PERSONAL_WORKSPACE_ID/);
    // Never a client-side org store: the switch goes through server actions.
    expect(src).not.toMatch(/localStorage/);
  });

  it("the dashboard layout resolves the workspace for EVERY identity", () => {
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/getWorkspaceContext\(identity\)/);
    expect(layout).toMatch(/workspaces:/);
    expect(layout).toMatch(/activeWorkspaceId:/);
    expect(layout).toMatch(/workspacePointerAvailable:/);
  });
});

describe("workspace chip — always-visible context beside the conversation", () => {
  const chip = read("components/app/conversation/chat/workspace-chip.tsx");

  it("is mounted in the simple-shell conversation header", () => {
    const header = read(
      "components/app/conversation/chat/conversation-header.tsx",
    );
    expect(header).toMatch(/WorkspaceChip/);
  });

  it("uses ONLY existing brand/trust tokens for accents — no raw colors", () => {
    expect(chip).toMatch(/bg-brand-blue/);
    expect(chip).toMatch(/bg-trust-accent/);
    expect(chip).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // no raw hex
    expect(chip).not.toMatch(/rgb\(\s*\d/); // no raw rgb literals
  });

  it("switching is REAL for every session — no disabled-switch production text (owner audit P0.1)", () => {
    // The pick always dispatches through the server action…
    expect(chip).toMatch(/switchWorkspace\(id\)/);
    // …and no "not enabled yet" copy can render anywhere.
    expect(chip).not.toMatch(/workspaceSwitchSoon/);
    // Unnamed organizations get a localized fallback, never a dash row.
    expect(chip).toMatch(/workspaceUnnamed/);
  });

  it("the switch actions write the server-side session pointer (httpOnly cookie), never localStorage", () => {
    const actions = read("lib/company/organization-actions.ts");
    expect(actions).toMatch(/ACTIVE_WORKSPACE_COOKIE/);
    expect(actions).toMatch(/httpOnly: true/);
    expect(actions).not.toMatch(/localStorage\.(get|set|remove)Item|window\.localStorage/);
    // Membership is validated BEFORE the cookie is written: the org-switch
    // arm runs the shared core (G4) first and only then sets the pointer.
    const switchArm = actions.slice(
      actions.indexOf("export async function switchActiveOrganization"),
      actions.indexOf("export async function clearActiveOrganization"),
    );
    expect(switchArm.indexOf("switchActiveWorkspaceCore")).toBeGreaterThan(-1);
    expect(switchArm.indexOf("switchActiveWorkspaceCore")).toBeLessThan(
      switchArm.indexOf("jar.set(ACTIVE_WORKSPACE_COOKIE"),
    );
    const core = read("lib/company/workspace-switch-core.ts");
    expect(core).toMatch(/isMember/);
    const resolver = read("lib/company/active-organization.ts");
    expect(resolver).toMatch(/readSessionWorkspacePointer/);
  });

  it("never fabricates a workspace — renders nothing without server data", () => {
    expect(chip).toMatch(/workspaces\.length === 0\) return null/);
  });
});

describe("mixed-context surfaces label rows with the workspace context", () => {
  it("the journal stream renders a per-entry engagement chip with the SAME accent hue", () => {
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(/journal-entry-context-/);
    expect(page).toMatch(/workspaceAccentIndex/); // same hue as the workspace chip
    expect(page).toMatch(/engagements\.length > 1/); // no chip when unambiguous
  });
});

describe("workspace chip — i18n parity across every locale", () => {
  for (const locale of LOCALES) {
    it(`${locale}.json carries the three chip labels`, () => {
      const messages = read(`messages/${locale}.json`);
      expect(messages).toMatch(/"workspaceLabel"/);
      expect(messages).toMatch(/"workspacePersonal"/);
      expect(messages).toMatch(/"workspaceUnnamed"/);
      // The disabled-switch production text is gone for good (P0.1).
      expect(messages).not.toMatch(/"workspaceSwitchSoon"/);
    });
  }
});
