import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCT_SURFACES } from "@/lib/product-gate/surface-registry";

/**
 * THE AI DOOR OF PROJECT INVOICING, PINNED (PR #2203, owner decision: build the real door, no waiver).
 *
 * The assistant/MCP capabilities in lib/capabilities/project-invoice-capabilities.ts may PREPARE and CREATE
 * DRAFTS and help fill them in; they may never ISSUE, confirm tax, create a credit note, discard, or
 * configure numbering. Those stay explicit actions of the authorized owner/admin in the app. And they run
 * as the caller: no service role, no cookie client, no new SECURITY DEFINER path.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const DOOR = read("lib/capabilities/project-invoice-capabilities.ts");
// strip comments: the header documents what the module must NOT call
const code = DOOR.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("the chat/MCP door cannot reach issue, tax confirmation or the correction RPC", () => {
  it("names none of the final-act RPCs or the tax confirmation flag", () => {
    for (const forbidden of [
      "issue_invoice_v1",
      "correct_invoice_v1",
      "discard_invoice_draft_v1",
      "configure_invoice_series_v1",
      "archive_invoice_recipient_v1",
      "end_project_rate_term_v1",
      "mark_billing_period_ready_v1",
      "p_tax_confirmed",
      "tax_confirmed",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("every RPC it calls is on the reviewed allowlist (the same ones the web actions call)", () => {
    const called = [...code.matchAll(/(?:callRpc\(\s*caller,\s*|\.rpc\(\s*)"([a-z_0-9]+)"/g)].map((m) => m[1]);
    expect([...new Set(called)].sort()).toEqual(
      [
        "add_invoice_basis_line_v1",
        "add_project_rate_term_v1",
        "create_billing_period_v1",
        "create_invoice_draft_from_period_v1",
        "save_invoice_recipient_v1",
        "set_invoice_line_tax_v1",
        "set_invoice_recipient_v1",
        "set_invoice_tax_v1",
      ].sort(),
    );
    const actions = read("lib/finance/project-invoice-actions.ts");
    for (const rpc of new Set(called)) expect(actions, `${rpc} is not a web-action RPC`).toContain(`"${rpc}"`);
  });

  it("runs as the caller: no service role, no admin client, no cookie client", () => {
    expect(code).not.toMatch(/service[_-]?role|createAdminClient|supabase\/admin|createServiceClient/i);
    expect(code).not.toMatch(/from "@\/lib\/supabase\/server"/);
    expect(code).not.toMatch(/createClient\(/);
    // reads hand the caller's own client to the shared readers
    expect(code).toMatch(/caller\.supabase\)/);
  });

  it("the door can never issue by itself: no execute-kind capability, every write is a draft->confirm pair", () => {
    expect(code).not.toMatch(/kind:\s*"execute"/);
    expect(code).toMatch(/kind: "confirm"/);
    expect(code).toMatch(/mintCapabilityConfirmation/);
    expect(code).toMatch(/verifyCapabilityConfirmation/);
  });

  it("the shared readers accept the caller's client (additive parameter)", () => {
    const src = read("lib/finance/project-invoice.ts");
    expect(src.match(/client\?: SupabaseClient/g)?.length).toBeGreaterThanOrEqual(5);
  });
});

describe("the surface declarations are truthful about the AI door", () => {
  const routes = ["/dashboard/projects/[id]/invoicing", "/dashboard/projects/[id]/invoicing/[invoiceId]"];
  const registry = read("lib/capabilities/registry.ts");

  it("the door is registered in the one capability registry the MCP adapter lists", () => {
    expect(registry).toContain("PROJECT_INVOICE_CAPABILITIES");
  });

  for (const id of routes) {
    it(`${id} claims AI operability only because the door exists`, () => {
      const s = PRODUCT_SURFACES.find((d) => d.id === id);
      expect(s, id).toBeDefined();
      expect(s!.aiControlled).toBe(true);
      expect(s!.aiCanWorkWithIt).toBe(true);
      expect(s!.chatIntegration).toMatch(/project_invoice\./);
      expect(s!.chatIntegration).toMatch(/never issues/i);
    });
  }
});
