import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ACTIVE CONTEXT INTEGRITY — the switch is visible without a reload
 * (owner program 2026-09-23, P0 case 1).
 *
 * THE DEFECT. A workspace switch changed only server state and re-rendered the
 * page, but React KEEPS a client component's state across `router.refresh`:
 * the ONE `<ConversationChat>` on /dashboard had no key, so its thread (the
 * greeting, the starters, the "on whose behalf" line), the opening brief, the
 * pins, the goal state and the result panel's loaders all stayed those of the
 * PREVIOUS workspace. Only the small chip label changed. A browser reload
 * remounted everything, so "after refresh, different organization data
 * appears". Every e2e asserted only the chip text, which is why it shipped.
 *
 * THE CONTRACT pinned here:
 *   1. the one conversation is KEYED on the active workspace and the acting
 *      identity, computed on the server from the SAME resolution the chip
 *      renders — so a switch mounts a fresh conversation for the new context;
 *   2. the chat's identity is the server-resolved acting identity (it follows
 *      the workspace), never `baseIdentityForRole(auth.activeRole)`;
 *   3. the switch is ONE server call inside a transition, and the chip shows
 *      it pending and names a refusal instead of discarding it;
 *   4. every chip the chat offers to switch context carries the chip's own
 *      label (an unnamed organization never renders as an empty chip).
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const PAGE = code(read("app/[locale]/dashboard/page.tsx"));
const CHAT = code(read("components/app/conversation/chat/conversation-chat.tsx"));
const CHIP = code(read("components/app/conversation/chat/workspace-chip.tsx"));
const CTX = code(read("lib/auth/context.tsx"));
const AI_CTX = code(read("lib/ai-workspace/ai-context.ts"));

/** The opening tag of the ONE `<ConversationChat …>` element. */
function conversationElement(src: string): string {
  const at = src.indexOf("<ConversationChat");
  return at === -1 ? "" : src.slice(at, src.indexOf(">", src.indexOf("pins=", at)) + 1);
}

/** Is the element keyed on a value that names the active workspace? */
function keyedOnActiveWorkspace(src: string): boolean {
  const el = conversationElement(src);
  const key = /key=\{(\w+)\}/.exec(el)?.[1];
  if (!key) return false;
  const def = new RegExp(`const ${key} = \`\\$\\{rootWorkspace\\.activeWorkspaceId\\}:\\$\\{identity\\}\``);
  return def.test(src);
}

describe("the ONE conversation is keyed on the active workspace", () => {
  it("there is exactly one <ConversationChat> on /dashboard", () => {
    expect(PAGE.match(/<ConversationChat\b/g)?.length).toBe(1);
  });

  it("it carries a key built from the chip's own resolution and the acting identity", () => {
    expect(keyedOnActiveWorkspace(PAGE)).toBe(true);
    // The workspace in the key is the ONE session resolution (no argument).
    expect(PAGE).toMatch(/getWorkspaceContext\(\)/);
    expect(PAGE).not.toMatch(/getWorkspaceContext\((identity|null|"person"|"company")\)/);
  });

  it("NEGATIVE CONTROL: the pre-fix element (no key) fails the predicate", () => {
    const before = PAGE.replace(/\n\s*key=\{conversationKey\}/, "");
    expect(before).not.toBe(PAGE);
    expect(keyedOnActiveWorkspace(before)).toBe(false);
  });

  it("the acting identity reaches the chat as a server-resolved prop", () => {
    expect(conversationElement(PAGE)).toMatch(/actingIdentity=\{identity\}/);
    // Resolved from the workspace + the relationship + the HELD roles (d3).
    expect(PAGE).toMatch(/actingRoleForWorkspace\(activeOrgWorkspace, \[\.\.\.held\.roles\]\)/);
  });

  it("the AI context derives the SAME acting identity as the chat (no divergence)", () => {
    // Review P2 (#1849): the chat followed the workspace while the AI context
    // still read `active_role` alone — an employee of another company's
    // workspace was a person on screen and that company to the model.
    expect(AI_CTX).toMatch(/actingRoleForWorkspace\(activeOrgWorkspace, \[\.\.\.roles\.roles\]\)/);
    // The same fallback the page uses when no held role fits.
    expect(AI_CTX).toMatch(/decideDashboardRole\(/);
    expect(PAGE).toMatch(/decideDashboardRole\(/);
    // Never the stored role alone.
    expect(AI_CTX).not.toMatch(/const identity = activeRole \?/);
  });
});

describe("the chat's identity follows the workspace, not profiles.active_role", () => {
  it("identity is the actingIdentity prop", () => {
    expect(CHAT).toMatch(/const identity: BaseIdentity = actingIdentity;/);
    expect(CHAT).not.toMatch(/baseIdentityForRole\(auth0\.activeRole\)/);
  });

  it("the 'on whose behalf' line is shown for every organization workspace", () => {
    expect(CHAT).toMatch(/if \(workspaceContextLine\) \{/);
    expect(CHAT).not.toMatch(/workspaceContextLine && identity === "company"/);
    // The page composes it from the chip's own labels + the relationship.
    expect(PAGE).toMatch(/workspaceDisplayLabels\(rootWorkspace\.workspaces/);
    expect(PAGE).toMatch(/tChat\("workspaceActingAs"/);
  });
});

describe("ONE observable switch", () => {
  it("the client runs ONE server call inside a transition — no second role action", () => {
    expect(CTX).toMatch(/startSwitch\(async \(\) => \{[\s\S]{0,200}switchWorkspaceAction\(workspaceId\)/);
    expect(CTX).not.toMatch(/switchActiveRoleAction\(wanted\)/);
    expect(CTX).toMatch(/pendingWorkspaceId: isSwitching \? requestedWorkspaceId : null/);
  });

  it("a throw resolves false — never an unhandled rejection", () => {
    const fn = CTX.slice(CTX.indexOf("const switchWorkspace = useCallback"), CTX.indexOf("const switchOrganization"));
    expect(fn).toMatch(/catch \{\s*accepted = false;/);
  });

  it("the chip shows the pending switch and names a refusal", () => {
    expect(CHIP).toMatch(/switchWorkspace\(id\)/);
    expect(CHIP).toMatch(/tSwitcher\("switching"\)/);
    expect(CHIP).toMatch(/setFailedId\(id\)/);
    expect(CHIP).toMatch(/t\("switchContextFailed"\)/);
    // The menu no longer closes before the answer is known.
    const pick = CHIP.slice(CHIP.indexOf("const onPick"), CHIP.indexOf("if (!auth || workspaces.length === 0)"));
    expect(pick.indexOf("setOpen(false)")).toBeGreaterThan(pick.indexOf("await switchWorkspace(id)"));
  });

  it("the chip states the relationship for rows the person does not own", () => {
    expect(CHIP).toMatch(/workspaceRelationshipLabel\(w, \{/);
    expect(CHIP).toMatch(/w\.relationship !== "owner"/);
  });
});

describe("every context-switch chip carries the chip's own label", () => {
  it("no ws: chip is labelled with a bare organization name", () => {
    const chips = CHAT.match(/\{ id: `ws:\$\{\w+\.id\}`, label: [^}]+\}/g) ?? [];
    expect(chips.length).toBeGreaterThanOrEqual(4);
    for (const c of chips) {
      expect(c, c).not.toMatch(/label: \w+\.name\b/);
    }
    expect(CHAT).toMatch(/workspaceDisplayLabels\(auth0\?\.workspaces \?\? \[\]/);
  });
});
