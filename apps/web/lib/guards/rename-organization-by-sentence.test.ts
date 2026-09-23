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

  it("an organization with no company profile is refused with the one canonical door — never retargeted", () => {
    const h = handler();
    const branch = h.slice(h.indexOf('case "no-company-profile":'), h.indexOf('case "not-authorized":'));
    expect(branch).toContain('t("renameNoCompanyProfile")');
    expect(branch).toContain("link:/dashboard/start/company?new=1");
    expect(branch).not.toContain("openForm(");
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

  it("the confirmation token is bound to the ACTIVE WORKSPACE — a card for A can never rename B", () => {
    const code = codeOf(DISPATCH);
    const branch = code.slice(code.indexOf('if (actionId === "company.rename-organization")'));
    expect(branch.slice(0, 400)).toMatch(/getWorkspaceContext\("company"\)/);
    expect(branch.slice(0, 400)).toContain("`workspace:${ws.activeWorkspaceId}`");
  });
});

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
