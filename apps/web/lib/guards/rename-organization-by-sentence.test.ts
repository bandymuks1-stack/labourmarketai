import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";
import { INTENT_HINTS } from "@/lib/conversation/intent-catalogue";
import { getConversationAction } from "@/lib/conversation/action-registry";
import { getCompanyForm } from "@/lib/conversation/company-forms";
import { COMPANY_ACTION_SCHEMAS } from "@/lib/conversation/company-schemas";

/**
 * RENAME AN ORGANIZATION BY SENTENCE — ONE capability, reachable, honest
 * (owner program 2026-09-23, CASE 3/4).
 *
 * "Pervadink šią agentūrą į Nonstop Group UAB." had nowhere to go: no router
 * rule, no proposer hint, no action, no executor. This pins the whole seam —
 * sentence → intent → server check → the ONE confirm form → the dispatcher →
 * the domain core over the canonical writer — and the rules that make it safe:
 * the organization is never client input, a refusal is said before any form,
 * a token is bound to the workspace it was confirmed for.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const codeOf = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const CORE = read("lib/company/organization-rename.ts");
const CHAT_READ = read("lib/conversation/organization-rename-chat.ts");
const DISPATCH = read("lib/conversation/dispatch.ts");
const EXECUTORS = read("lib/conversation/company-executors.ts");

function handler(): string {
  const code = codeOf(CHAT);
  const start = code.indexOf("const startRenameOrganization = useCallback");
  const end = code.indexOf("const handleReference = useCallback", start);
  return start >= 0 && end > start ? code.slice(start, end) : "";
}

/** The `no-company-profile` branch says the fact and its reason — and nothing else. */
function noCompanyProfileViolations(h: string): string[] {
  const start = h.indexOf('case "no-company-profile":');
  const end = h.indexOf('case "not-authorized":', start);
  const branch = start >= 0 && end > start ? h.slice(start, end) : "";
  if (!branch) return ["no no-company-profile branch"];
  const out: string[] = [];
  if (!branch.includes('t("renameNoCompanyProfile")')) out.push("the refusal is not said");
  // No chip at all: `assistant(line)` with a second argument is a door.
  if (!/assistant\(t\("renameNoCompanyProfile"\)\);/.test(branch)) out.push("a door is attached to the refusal");
  if (branch.includes("?new=1")) out.push("offers to create a separate organization");
  if (branch.includes("create-organization")) out.push("offers to create a separate organization");
  if (branch.includes("openForm(")) out.push("opens a form for an organization it cannot rename");
  return out;
}

describe("the sentence reaches ONE capability", () => {
  it("both routers can reach it — a registry row (write) and a proposer hint", () => {
    expect(INTENT_REGISTRY["rename-organization"]).toEqual({
      domain: "company",
      access: "write",
      handler: "renameOrganization",
      ownTyping: true,
    });
    expect(INTENT_HINTS["rename-organization"]).toMatch(/rename the organization/);
  });

  it("the handler is wired, and the confirm form + action + schema are the same id", () => {
    expect(codeOf(CHAT)).toContain("renameOrganization: () => startRenameOrganization(text)");
    const form = getCompanyForm("company.rename-organization");
    expect(form?.requiresConfirmation).toBe(true);
    expect(form?.fields.map((f) => f.name)).toEqual(["name"]);
    expect(getConversationAction("company.rename-organization")?.confirmation).toBe("important_write");
    expect(COMPANY_ACTION_SCHEMAS["company.rename-organization"]).toBeDefined();
  });
});

describe("the chat asks the server first, then offers the ONE form", () => {
  it("the server check runs BEFORE any form opens", () => {
    const h = handler();
    expect(h.length).toBeGreaterThan(200);
    const check = h.indexOf("readRenameTargetForChat()");
    const form = h.search(/openForm\(\s*"company\.rename-organization"/);
    expect(check).toBeGreaterThan(-1);
    expect(form, "the form opens only in the `ready` branch, after the check").toBeGreaterThan(check);
  });

  it("the form is PREFILLED with the name the sentence carried — never submitted for them", () => {
    const h = handler();
    expect(h).toContain("readRenameTarget(text)");
    expect(h).toMatch(/\.\.\.\(proposed \? \{ name: proposed \} : \{\}\)/);
    // The organization the form is opened FOR travels back only as a
    // consistency check (it can refuse, never target — see the core).
    expect(h).toContain("expectedOrganizationId: target.organizationId");
    for (const forbidden of ["dispatchWorkerAction", "prepareConfirmationAction", ".insert(", ".update(", ".rpc("]) {
      expect(h, `${forbidden} in the rename handler`).not.toContain(forbidden);
    }
  });

  it("the personal workspace ASKS which organization — labelled by real type, switched only by the person", () => {
    const h = handler();
    expect(h).toContain("workspaceDisplayLabels(");
    expect(h).toMatch(/id: `ws:\$\{w\.id\}`/);
    expect(h, "a rename sentence must not switch context by itself").not.toContain("performContextSwitch");
  });

  it("an organization with no company profile is refused as that — no door, never retargeted", () => {
    expect(noCompanyProfileViolations(handler())).toEqual([]);
  });

  it("NEGATIVE CONTROL — the 'create a company profile' door is caught if it returns (adversarial review, #1848)", () => {
    // "Create a company profile" makes a SEPARATE organization — a duplicate
    // of the one the person meant to rename, while the owner decision for such
    // organizations (a RED rename RPC, or archive/merge into the canonical
    // one) is open. The shape #1848 first shipped offered exactly that door.
    const h = handler();
    const anchor = 'assistant(t("renameNoCompanyProfile"));';
    expect(h).toContain(anchor);
    for (const door of [
      'assistant(t("renameNoCompanyProfile"), [{ id: "link:/dashboard/start/company?new=1", label: t("x") }]);',
      'assistant(t("renameNoCompanyProfile"), [{ id: "create-organization", label: t("x") }]);',
      'openForm("company.rename-organization"); assistant(t("renameNoCompanyProfile"));',
    ]) {
      expect(noCompanyProfileViolations(h.replace(anchor, door)).length, `undetected: ${door}`).toBeGreaterThan(0);
    }
  });

  it("the receipt names old → new from the server's readback", () => {
    const h = handler();
    expect(h).toMatch(/res\.data\?\.previousName/);
    expect(h).toContain('t("renameDone", { previous, name })');
  });
});

describe("the write is the canonical one, for the organization the SERVER resolves", () => {
  it("the domain core composes the existing chain — no direct table write, no second writer", () => {
    const core = codeOf(CORE);
    expect(core).toContain("resolveEmployerCompanyContext()");
    expect(core).toContain('hasOrganizationCapability(ctx.role, "manage-company-profile")');
    expect(core).toContain("saveCompanySetup(");
    expect(core).toMatch(/submit: row\.verificationStatus === "pending_verification"/);
    expect(core).toMatch(/verificationStatus === "verified"/);
    expect(core).toContain('revalidatePath("/", "layout")');
    for (const forbidden of [".from(", ".rpc(", ".update(", ".insert("]) {
      expect(core, `${forbidden} in the rename core`).not.toContain(forbidden);
    }
    // The core takes a NAME; the only other input is the expected
    // organization, which can refuse and never targets. The target is the
    // server-resolved one (`target.row.id` / `row.id`), never an argument.
    expect(core).toMatch(
      /export async function renameActiveOrganization\(\s*rawName: string,\s*opts: \{ readonly expectedOrganizationId\?: string \| null \} = \{\},?\s*\)/,
    );
    expect(core).toMatch(/companyId: row\.id,/);
  });

  it("the chat read is read-only", () => {
    const code = codeOf(CHAT_READ);
    for (const forbidden of ["renameActiveOrganization", "saveCompanySetup", ".from(", ".rpc(", ".update("]) {
      expect(code, `${forbidden} in the chat read`).not.toContain(forbidden);
    }
  });

  it("the executor forwards the NAME, and the expected organization only as a refusal check", () => {
    const code = codeOf(EXECUTORS);
    expect(code).toMatch(
      /renameActiveOrganization\(input\.name, \{\s*expectedOrganizationId: input\.expectedOrganizationId \?\? null,?\s*\}\)/,
    );
    // The core resolves the target itself and only COMPARES the expected id.
    const core = codeOf(CORE);
    expect(core).toMatch(
      /opts\.expectedOrganizationId !== target\.organizationId\)\s*\{\s*return \{ ok: false, code: "workspace_changed" \}/,
    );
    expect(core, "the expected id must never reach the writer").not.toMatch(
      /companyId: opts\.expectedOrganizationId|saveCompanySetup\(\{[^}]*expectedOrganizationId/,
    );
  });

  it("the confirmation token is bound to the TARGET the write resolves, and is single-use", () => {
    expect(renameFingerprintViolations(DISPATCH)).toEqual([]);
  });

  it("NEGATIVE CONTROL — the workspace-only fingerprint (fresh, not single-use) is caught", () => {
    // The shape #1848 first shipped: a second workspace read that can resolve
    // differently from the writer's, and a value a successful rename does not
    // change — so the same token could be spent again within the TTL.
    const anchor = "const target = await resolveRenameTarget();";
    expect(DISPATCH).toContain(anchor);
    const reverted = DISPATCH.replace(
      /const target = await resolveRenameTarget\(\);[\s\S]*?return `rename:\$\{target\.organizationId\}:\$\{nameDigest\}`;/,
      'const ws = await getWorkspaceContext("company");\n    return `workspace:${ws.activeWorkspaceId}`;',
    );
    expect(reverted).not.toBe(DISPATCH);
    expect(renameFingerprintViolations(reverted).length).toBeGreaterThan(0);
    // …and a fingerprint that drops the current name (fresh but replayable).
    const nameless = DISPATCH.replace(
      "return `rename:${target.organizationId}:${nameDigest}`;",
      "return `rename:${target.organizationId}`;",
    );
    expect(nameless).not.toBe(DISPATCH);
    expect(renameFingerprintViolations(nameless).length).toBeGreaterThan(0);
  });
});

/** The rename's branch of `stateFingerprint` in dispatch.ts, code only. */
function renameFingerprintViolations(dispatchSrc: string): string[] {
  const code = codeOf(dispatchSrc);
  const start = code.indexOf('if (actionId === "company.rename-organization")');
  const end = code.indexOf('return "n/a";', start);
  const branch = start >= 0 && end > start ? code.slice(start, end) : "";
  if (!branch) return ["no rename branch in stateFingerprint"];
  const out: string[] = [];
  // THE SAME resolver the write uses — never a second workspace read.
  if (!branch.includes("await resolveRenameTarget()")) out.push("not taken from resolveRenameTarget()");
  if (branch.includes("getWorkspaceContext(")) out.push("a second workspace read decides the fingerprint");
  // The organization AND its current name: a success changes the name, so
  // the token cannot be spent twice.
  if (!branch.includes("target.organizationId")) out.push("the organization is not in the fingerprint");
  if (!branch.includes("target.currentName")) out.push("the current name is not in the fingerprint (not single-use)");
  if (!/return `rename:\$\{target\.organizationId\}:\$\{nameDigest\}`/.test(branch)) {
    out.push("the fingerprint does not carry organization + name digest");
  }
  return out;
}

/**
 * THE ACTING IDENTITY DECIDES WHOSE PROFILE (owner program 2026-09-23). A
 * company or agency context asking for `profile` gets the COMPANY's next step,
 * never the person's ladder of worker chips.
 */
const PROFILE_GATE =
  /profileSummary: \(\) =>\s*identity === "company" \? startCompanyNextStep\(\) : startProfileSummary\("profile"\)/;

describe("`profile` is gated on the acting identity", () => {
  it("a company context gets the company's next step, a person their own ladder", () => {
    expect(CHAT).toMatch(PROFILE_GATE);
  });

  it("NEGATIVE CONTROL — the ungated handler is caught", () => {
    const ungated = CHAT.replace(PROFILE_GATE, 'profileSummary: () => startProfileSummary("profile")');
    expect(ungated).not.toBe(CHAT);
    expect(ungated).not.toMatch(PROFILE_GATE);
  });
});
