import { describe, expect, it } from "vitest";
import {
  billingStatePurchasable,
  gateWorkerProfileView,
  personPageViewGate,
} from "./profile-view-gate";

const ORG = "11111111-1111-4111-8111-111111111111";
const WORKER = "33333333-3333-4333-8333-333333333333";

function rpcClient(answer: {
  data?: unknown;
  error?: { code?: string } | null;
}) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  };
  return { client: client as never, calls };
}

describe("gateWorkerProfileView — the database decides, the page reads its answer", () => {
  it("passes only the organization and the worker, never a limit", async () => {
    const { client, calls } = rpcClient({
      data: { allowed: true, counted: true, reason: "new_view" },
    });
    await gateWorkerProfileView(client, ORG, WORKER);
    expect(calls).toEqual([
      {
        fn: "record_worker_profile_view_v1",
        args: { p_organization_id: ORG, p_worker_id: WORKER },
      },
    ]);
  });

  it("a first open is counted (the page then re-reads the detail tier); a re-open is not", async () => {
    expect(
      await gateWorkerProfileView(
        rpcClient({ data: { allowed: true, counted: true } }).client,
        ORG,
        WORKER,
      ),
    ).toEqual({
      kind: "open",
      counted: true,
    });
    expect(
      await gateWorkerProfileView(
        rpcClient({
          data: { allowed: true, counted: false, reason: "already_viewed" },
        }).client,
        ORG,
        WORKER,
      ),
    ).toEqual({ kind: "open", counted: false });
  });

  it("an explicit limit answer becomes the limit state", async () => {
    const { client } = rpcClient({
      data: {
        allowed: false,
        counted: false,
        reason: "limit_reached",
        plan: "free",
        used: 3,
        limit: 3,
      },
    });
    expect(await gateWorkerProfileView(client, ORG, WORKER)).toEqual({
      kind: "limit",
      used: 3,
      limit: 3,
      plan: "free",
    });
  });

  it("fails closed: no organization / not a manager → needs-organization; other errors → unavailable", async () => {
    expect(
      (
        await gateWorkerProfileView(
          rpcClient({ error: { code: "22023" } }).client,
          null,
          WORKER,
        )
      ).kind,
    ).toBe("needs-organization");
    expect(
      (
        await gateWorkerProfileView(
          rpcClient({ error: { code: "42501" } }).client,
          ORG,
          WORKER,
        )
      ).kind,
    ).toBe("needs-organization");
    expect(
      (
        await gateWorkerProfileView(
          rpcClient({ error: { code: "P0002" } }).client,
          ORG,
          WORKER,
        )
      ).kind,
    ).toBe("unavailable");
    expect(
      (
        await gateWorkerProfileView(
          rpcClient({ data: "nonsense" }).client,
          ORG,
          WORKER,
        )
      ).kind,
    ).toBe("unavailable");
  });

  it("only a missing function (migration not applied) keeps today's open page", async () => {
    for (const code of ["42883", "PGRST202"]) {
      expect(
        (
          await gateWorkerProfileView(
            rpcClient({ error: { code } }).client,
            ORG,
            WORKER,
          )
        ).kind,
      ).toBe("open");
    }
  });
});

describe("personPageViewGate — never blocked without a way to pay (owner deferral 2026-10-19)", () => {
  const limit = { kind: "limit", used: 3, limit: 3, plan: "free" } as const;

  it("the limit closes the page where the organization can buy the plan", () => {
    expect(personPageViewGate(limit, true)).toEqual(limit);
  });

  it("without a purchase path the page stays open (uncounted, card tier)", () => {
    expect(personPageViewGate(limit, false)).toEqual({
      kind: "open",
      counted: false,
    });
  });

  it("every other answer passes through unchanged", () => {
    for (const g of [
      { kind: "open", counted: true } as const,
      { kind: "needs-organization" } as const,
      { kind: "unavailable" } as const,
    ]) {
      expect(personPageViewGate(g, false)).toEqual(g);
      expect(personPageViewGate(g, true)).toEqual(g);
    }
  });

  it("purchasable = an active Stripe state for that organization", () => {
    expect(billingStatePurchasable("stripe_live")).toBe(true);
    expect(billingStatePurchasable("stripe_test")).toBe(true);
    for (const s of ["disabled", "live_blocked", "", null, undefined])
      expect(billingStatePurchasable(s)).toBe(false);
  });
});
