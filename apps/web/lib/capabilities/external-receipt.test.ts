import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { confirmationRef, recordExternalReceipt } from "./external-receipt";
import type { CapabilityCaller } from "./contract";

const TOKEN = "a-real-one-time-confirmation-token-value";
const PROJECT = "11111111-1111-4111-8111-111111111111";

const ORG = "22222222-2222-4222-8222-222222222222";

function caller(answer: { data: unknown; error: { code?: string } | null }, activeOrg: string | null = ORG) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    from() {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: { active_organization_id: activeOrg }, error: null });
      return chain;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return answer;
    },
  } as unknown as CapabilityCaller["supabase"];
  return { c: { userId: "u", transport: "bearer", supabase, locale: "lt" } as CapabilityCaller, calls };
}

describe("the audit receipt for an assistant's write", () => {
  it("reads leave no receipt", async () => {
    const { c, calls } = caller({ data: "r1", error: null });
    const r = await recordExternalReceipt(c, { id: "projects.list", kind: "read" }, {}, { ok: true, data: {} });
    expect(r).toEqual({ state: "not_applicable" });
    expect(calls).toEqual([]);
  });

  it("a confirm records capability, object, outcome and a token REFERENCE — never the token", async () => {
    const { c, calls } = caller({ data: "rcpt-1", error: null });
    const r = await recordExternalReceipt(
      c,
      { id: "project.create_confirm", kind: "confirm" },
      { title: "Site", confirmationToken: TOKEN },
      { ok: true, data: { projectId: PROJECT, readBack: { id: PROJECT } } },
    );
    expect(r).toEqual({ state: "recorded", id: "rcpt-1" });
    expect(calls[0].fn).toBe("record_external_action_receipt_v1");
    expect(calls[0].args).toMatchObject({
      p_capability: "project.create_confirm",
      p_organization_id: ORG,
      p_entity_id: PROJECT,
      p_outcome: "ok",
      p_confirmation_ref: confirmationRef(TOKEN),
      p_readback_ok: true,
    });
    expect(JSON.stringify(calls[0].args)).not.toContain(TOKEN);
  });

  it("a refused confirm is receipted with its code", async () => {
    const { c, calls } = caller({ data: "rcpt-2", error: null });
    await recordExternalReceipt(
      c,
      { id: "assignment.create_confirm", kind: "confirm" },
      { projectId: PROJECT, confirmationToken: TOKEN },
      { ok: false, code: "not_authorized", message: "no" },
    );
    expect(calls[0].args).toMatchObject({ p_outcome: "not_authorized", p_entity_id: PROJECT });
  });

  it("an unapplied RPC is not_enabled; any other failure is failed — never a thrown write", async () => {
    const a = caller({ data: null, error: { code: "42883" } });
    expect(await recordExternalReceipt(a.c, { id: "x.y_confirm", kind: "confirm" }, {}, { ok: true, data: {} })).toEqual({
      state: "not_enabled",
    });
    const b = caller({ data: null, error: { code: "XX000" } });
    expect(await recordExternalReceipt(b.c, { id: "x.y_confirm", kind: "confirm" }, {}, { ok: true, data: {} })).toEqual({
      state: "failed",
    });
  });

  it("the personal space records no organization; a refusal carries no read-back claim", async () => {
    const { c, calls } = caller({ data: "rcpt-3", error: null }, null);
    await recordExternalReceipt(
      c,
      { id: "work_card.save_confirm", kind: "confirm" },
      { confirmationToken: TOKEN },
      { ok: false, code: "confirmation_rejected", message: "x" },
    );
    expect(calls[0].args).toMatchObject({ p_organization_id: null, p_readback_ok: null });
  });
});
