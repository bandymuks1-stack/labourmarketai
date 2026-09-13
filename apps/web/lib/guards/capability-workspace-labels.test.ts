import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

const registry = read("lib/capabilities/registry.ts");
const labeller = read("lib/capabilities/workspace-labels.ts");

/**
 * WHAT THIS PROTECTS — one workspace label, one membership list.
 *
 * `workspaceDisplayLabels` (lib/company/organization-switch) is the canonical
 * builder: the chat workspace chip and /dashboard/network render from it, and
 * its rules were settled by an owner walk on production — an organization with
 * no stored name gets a phrase that SAYS the name is missing, chosen by its
 * real type, and two unnamed organizations of the SAME type are told apart by
 * a fragment of the organization id. Never a counter: "Įmonės erdvė 1 / 2" sat
 * in a list beside a real registered company and read as two more real
 * companies.
 *
 * The capability layer had a SECOND labeller written inline in
 * `context.switch` — one shared "not set" string for every unnamed
 * organization, and a relationship appended on collision. So an MCP or mobile
 * caller was shown different names than a web user for the same workspaces,
 * and two unnamed organizations of the same type in the same relationship
 * collapsed to identical text with nothing to tell them apart. Exactly the
 * defect the canonical builder exists to end, still live one layer over.
 *
 * That is why this guard pins the SHAPE, not the strings: the capability layer
 * may not grow label-building logic of its own again.
 */
describe("capability workspace labels — one builder, one membership list", () => {
  /**
   * Scoped to the two CONTEXT capabilities on purpose. The registry carries
   * one other inline labeller, for ENGAGEMENT CONTEXTS — a different domain
   * object, mirroring its own canonical source
   * (lib/conversation/worklog-engagements.ts). Pinning the whole file would
   * fail on that and teach the next reader to widen the guard rather than
   * look at what it found.
   */
  const contextCapabilityBlocks = (): string => {
    const from = registry.indexOf('id: "context.list"');
    const to = registry.indexOf("// ── work_card.save", from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return registry.slice(from, to);
  };

  it("the context capabilities build no workspace labels of their own", () => {
    const block = contextCapabilityBlocks();
    // The collision rule is a property of the WHOLE list. Any of these means
    // someone started re-deriving it one row at a time.
    expect(block).not.toMatch(/baseCounts|const baseOf\b/);
    // The canonical builder is reached through the one helper, never inlined.
    expect(block).not.toContain("workspaceDisplayLabels(");
    expect(block).toContain("workspaceLabeller(");
  });

  it("the helper delegates to the canonical builder and invents no phrase", () => {
    expect(labeller).toContain("workspaceDisplayLabels(");
    // Every unnamed-organization phrase is a message key, never a literal.
    for (const key of [
      "workspacePersonal",
      "workspaceUnnamedCompany",
      "workspaceUnnamedAgency",
      "workspaceUnnamedTeam",
      "workspaceUnnamed",
    ]) {
      expect(labeller).toContain(`t("${key}")`);
    }
    // Read from where they already live — a second copy across eleven
    // catalogues is what drifts.
    expect(labeller).toContain('namespace: "conversation.chat"');
  });

  it("those phrases exist in every UI-active locale", () => {
    for (const locale of ["en", "lt", "ru", "nl", "de"] as const) {
      const chat = JSON.parse(read(`messages/${locale}.json`)).conversation?.chat;
      for (const key of [
        "workspacePersonal",
        "workspaceUnnamedCompany",
        "workspaceUnnamedAgency",
        "workspaceUnnamedTeam",
        "workspaceUnnamed",
      ]) {
        expect(typeof chat?.[key], `${locale}.conversation.chat.${key}`).toBe("string");
      }
    }
  });

  it("context.list is a READ and resolves the pointer through the shared core", () => {
    const start = registry.indexOf('id: "context.list"');
    expect(start).toBeGreaterThan(-1);
    const block = registry.slice(start, registry.indexOf('id: "context.switch"'));
    expect(block).toContain('kind: "read"');
    expect(block).toMatch(/readOnlyHint:\s*true/);
    // THE transport-neutral core, so "acting for organization X" means one
    // thing for the web session, this layer and mobile. No second read, no
    // second resolution rule.
    expect(block).toContain("resolveActiveWorkspaceForCaller(");
    expect(block).not.toContain('.from("profiles")');
    // pointerAvailable must reach the client: without it a caller cannot tell
    // a recorded choice from the resolver's default.
    expect(block).toContain("pointerAvailable");
  });

  it("context.switch stays the only write, and context.list never switches", () => {
    const listStart = registry.indexOf('id: "context.list"');
    const block = registry.slice(listStart, registry.indexOf('id: "context.switch"'));
    expect(block).not.toContain("switchActiveWorkspaceCore");
  });
});
