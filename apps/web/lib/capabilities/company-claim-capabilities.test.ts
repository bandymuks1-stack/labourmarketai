import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/confirmation-spend", () => ({
  spendConfirmation: async () => "spent",
  spendConfirmationForRequest: async () => "spent",
}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/email/send-ledger-store", () => ({ guardedSendTransactionalEmail: vi.fn() }));

import { COMPANY_CLAIM_CAPABILITIES } from "./company-claim-capabilities";

/**
 * The operator tools add no authority of their own: every call asks the database for the
 * `marketplace_company_ingest` capability first, and every write goes through the migration's
 * functions (20261110190000), which enforce the two-operator rule again.
 */
type Rpc = { fn: string; args: unknown };

function caller(capability: boolean, rpcResult: Record<string, unknown> = {}) {
  const rpcs: Rpc[] = [];
  const table = {
    select: () => table,
    eq: () => table,
    in: () => table,
    order: () => table,
    limit: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () =>
      Promise.resolve({
        data: { id: ORG, display_name: "QA-SYNTHETIC Alpha UAB", country: "LT", claim_state: "discovered", owner_profile_id: null },
        error: null,
      }),
  };
  const supabase = {
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      if (fn === "has_platform_capability") return Promise.resolve({ data: capability, error: null });
      return Promise.resolve({ data: rpcResult[fn] ?? null, error: null });
    },
    from: () => table,
  };
  return { rpcs, c: { userId: OPA, supabase, locale: "lt" } as never };
}

const ORG = "20000000-0000-4000-8000-000000000001";
const OPA = "a0000000-0000-4000-8000-00000000000a";
const byId = Object.fromEntries(COMPANY_CLAIM_CAPABILITIES.map((c) => [c.id, c]));

describe("company claim operator tools", () => {
  it("every tool refuses a caller without the operator capability, before any other call", async () => {
    for (const cap of COMPANY_CLAIM_CAPABILITIES) {
      const { rpcs, c } = caller(false);
      const input =
        cap.id === "company.claims.list"
          ? {}
          : cap.id.startsWith("company.claim.invite")
            ? { organizationId: ORG, email: "rep@company.example", ...(cap.kind === "confirm" ? { confirmationToken: "x".repeat(12) } : {}) }
            : { claimId: ORG, decision: "reject", ...(cap.kind === "confirm" ? { confirmationToken: "x".repeat(12) } : {}) };
      const r = await cap.run(c, input);
      expect(r.ok, cap.id).toBe(false);
      expect(rpcs.map((x) => x.fn), cap.id).toEqual(["has_platform_capability"]);
    }
  });

  it("the invite preview writes nothing and returns a confirmation token", async () => {
    const { rpcs, c } = caller(true);
    const r = await byId["company.claim.invite.preview"].run(c, { organizationId: ORG, email: "Rep@Company.example" });
    expect(r.ok).toBe(true);
    expect(rpcs.map((x) => x.fn)).toEqual(["has_platform_capability"]);
  });

  it("verify needs the evidence the operator checked", async () => {
    const { c } = caller(true);
    const r = await byId["company.claim.decide.preview"].run(c, { claimId: ORG, decision: "verify" });
    expect(r).toMatchObject({ ok: false, code: "evidence_required" });
  });

  it("writes only through the migration's functions", () => {
    const src = readFileSync(join(__dirname, "company-claim-capabilities.ts"), "utf8");
    expect(src).toMatch(/rpc\("create_claim_invitation_v1"/);
    expect(src).toMatch(/rpc\("decide_organization_claim_v2"/);
    expect(src).not.toMatch(/\.from\([^)]*\)[\s\S]{0,120}?\.(update|insert|upsert|delete)\(/);
  });

  it("the invite page panel never prints the invited address", () => {
    const panel = readFileSync(join(__dirname, "..", "..", "components", "app", "claim-invitation-panel.tsx"), "utf8");
    expect(panel).not.toMatch(/invited_email|invitedEmail/);
  });
});
