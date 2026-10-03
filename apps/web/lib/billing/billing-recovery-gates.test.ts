/**
 * GATE PROOF for scheduled billing recovery (#2126). No live Stripe, no DB.
 *
 * WHICH LAYER IS THE SCHEDULE SWITCH?  The GitHub Actions workflow
 * (`BILLING_RECOVERY_SCHEDULE_ENABLED` repo variable + `CRON_SECRET` secret) is
 * the ONLY schedule switch: with the variable absent/false the workflow never
 * issues the request. The ROUTE is not a schedule switch - with a valid secret
 * it runs whenever it is called; its own gates are CRON_SECRET (fail closed) and
 * billing state (inactive -> 503). Both layers are pinned below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = vi.hoisted(() => ({ state: "stripe_test" as string, testMode: true }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
vi.mock("@/lib/billing/subscription-store", () => ({
  readRecoveryCandidates: vi.fn(),
  readSubscriptionState: vi.fn(),
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
}));

import { getBillingProvider } from "@/lib/billing/provider";
import {
  markWebhookFailed,
  markWebhookProcessed,
  readRecoveryCandidates,
  readSubscriptionState,
  recordWebhookEvent,
  upsertSubscription,
} from "@/lib/billing/subscription-store";
import { runBillingRecovery, RECOVERY_BATCH, RUN_BUDGET_MS } from "@/lib/billing/billing-recovery";
import { GET } from "@/app/api/cron/billing-recovery/route";

const REPO = join(__dirname, "..", "..", "..", "..");
const read = vi.mocked(readRecoveryCandidates);
const retrieveRaw = vi.fn();
const upsert = vi.mocked(upsertSubscription);

const OBJ = (id: string, livemode = false) => ({
  id,
  customer: "cus_1",
  status: "active",
  livemode,
  cancel_at_period_end: false,
  metadata: { plan_key: "company_pilot", client_reference_id: "owner_1", organization_id: "org_1" },
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => `sub_${i}`);
const cands = (over: Record<string, unknown> = {}) => ({
  ok: true as const,
  ids: [] as string[],
  recentlyReconciled: [] as string[],
  unprocessedEvents: { total: 0, withSubscriptionRef: 0 },
  ...over,
});

function provider(active = true) {
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_test",
    active,
    retrieveSubscriptionRaw: retrieveRaw,
    listCustomerSubscriptions: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const prevSecret = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  cfg.state = "stripe_test";
  cfg.testMode = true;
  process.env.CRON_SECRET = "a-long-enough-test-secret-value";
  provider();
  read.mockResolvedValue(cands({ ids: ids(2) }));
  retrieveRaw.mockImplementation(async (id: string) => ({ ok: true, object: OBJ(id), livemode: false }));
  vi.mocked(recordWebhookEvent).mockResolvedValue("ok");
  vi.mocked(readSubscriptionState).mockResolvedValue({ status: "found", row: { status: "incomplete", ownerId: "o", planKey: "p" } });
  upsert.mockResolvedValue("ok");
  vi.mocked(markWebhookProcessed).mockResolvedValue();
  vi.mocked(markWebhookFailed).mockResolvedValue();
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
});

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/cron/billing-recovery", { headers: auth ? { authorization: auth } : {} }));

function nothingTouched() {
  expect(getBillingProvider).not.toHaveBeenCalled();
  expect(retrieveRaw).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
  expect(recordWebhookEvent).not.toHaveBeenCalled();
}

describe("GATE 1 - schedule switch (workflow layer, static)", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/billing-recovery-cadence.yml"), "utf8");

  it("the gate step reads the repo variable and the secret and refuses unless BOTH are set", () => {
    expect(wf).toMatch(/ENABLED: \$\{\{ vars\.BILLING_RECOVERY_SCHEDULE_ENABLED \}\}/);
    expect(wf).toMatch(/HAS_SECRET: \$\{\{ secrets\.CRON_SECRET != '' \}\}/);
    expect(wf).toMatch(/if \[ "\$ENABLED" != "true" \] \|\| \[ "\$HAS_SECRET" != "true" \]; then[\s\S]*?gated=true/);
  });

  it("the ONLY step that can call the endpoint is conditional on the gate; the variable is not defaulted on", () => {
    expect(wf).toMatch(/- name: Run the recovery sweep\s+if: steps\.gate\.outputs\.gated == 'false'/);
    expect(wf.match(/curl /g)?.length).toBe(1);
    expect(wf.indexOf("curl ")).toBeGreaterThan(wf.indexOf("if: steps.gate.outputs.gated == 'false'"));
    expect(wf).not.toMatch(/BILLING_RECOVERY_SCHEDULE_ENABLED:\s*["']?true/);
    expect(wf).toMatch(/workflow_dispatch/); // manual run still passes the same gate step
  });

  it("no other scheduler is wired: not in vercel.json crons, not in any other workflow", () => {
    const vercel = readFileSync(join(REPO, "apps/web/vercel.json"), "utf8");
    expect(vercel).not.toMatch(/billing-recovery/);
  });
});

describe("GATE 2 - the ROUTE is not the schedule switch; CRON_SECRET + billing state are its gates", () => {
  it("with a valid secret it runs regardless of the workflow variable (unset here)", async () => {
    delete process.env.BILLING_RECOVERY_SCHEDULE_ENABLED;
    const res = await call("Bearer a-long-enough-test-secret-value");
    expect(res.status).toBe(200);
    expect(retrieveRaw).toHaveBeenCalled();
  });

  it.each([
    ["CRON_SECRET unset", undefined, "Bearer anything", "not_configured"],
    ["CRON_SECRET blank", "   ", "Bearer    ", "not_configured"],
    ["wrong secret", "a-long-enough-test-secret-value", "Bearer wrong", "unauthorized"],
    ["truncated (short) presented secret", "a-long-enough-test-secret-value", "Bearer a-long", "unauthorized"],
    ["no Authorization header", "a-long-enough-test-secret-value", undefined, "unauthorized"],
    ["bare secret without Bearer", "a-long-enough-test-secret-value", "a-long-enough-test-secret-value", "unauthorized"],
  ])("%s -> 401 fail closed, no DB / provider / Stripe access", async (_n, secret, header, reason) => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    const res = await call(header);
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe(reason);
    nothingTouched();
  });

  it("billing inactive -> 503 billing_inactive, Stripe and DB untouched", async () => {
    cfg.state = "disabled";
    const res = await call("Bearer a-long-enough-test-secret-value");
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("billing_inactive");
    expect(retrieveRaw).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("NOTE: a configured-but-short CRON_SECRET is accepted by the shared authorizeCronRequest (no minimum length); that policy is shared by every cron route and is out of scope here", async () => {
    process.env.CRON_SECRET = "x";
    expect((await call("Bearer x")).status).toBe(200);
  });
});

describe("GATE 3 - bounded execution", () => {
  it(`never processes more than ${RECOVERY_BATCH} per run even when 100 are waiting`, async () => {
    read.mockResolvedValue(cands({ ids: ids(100) }));
    const r = await runBillingRecovery();
    expect(r).toMatchObject({ kind: "ok", processed: RECOVERY_BATCH });
    expect(retrieveRaw).toHaveBeenCalledTimes(RECOVERY_BATCH);
  });

  it("the wall-clock budget stops the loop and reports what it skipped", async () => {
    read.mockResolvedValue(cands({ ids: ids(5) }));
    let t = 1_800_000_000_000;
    retrieveRaw.mockImplementation(async (id: string) => {
      t += RUN_BUDGET_MS + 1;
      return { ok: true, object: OBJ(id), livemode: false };
    });
    const r = await runBillingRecovery({ now: () => t });
    expect(r).toMatchObject({ kind: "ok", processed: 1, skippedBudget: 4 });
    expect(retrieveRaw).toHaveBeenCalledTimes(1);
  });

  it("per-subscription isolation: one provider call throws, the others still apply, the batch result stays consistent", async () => {
    read.mockResolvedValue(cands({ ids: ["sub_a", "sub_b", "sub_c"] }));
    retrieveRaw.mockImplementation(async (id: string) => {
      if (id === "sub_b") throw new Error("socket hang up");
      return { ok: true, object: OBJ(id), livemode: false };
    });
    const r = await runBillingRecovery();
    expect(r).toMatchObject({ kind: "ok", selected: 3, processed: 3, counts: { applied: 2, store_error: 1 } });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls.map((c) => c[0].providerSubscriptionId).sort()).toEqual(["sub_a", "sub_c"]);
  });

  it("the 30-minute cooldown is honoured: recently reconciled subscriptions are not re-read from Stripe", async () => {
    read.mockResolvedValue(cands({ ids: ["sub_a", "sub_b", "sub_c"], recentlyReconciled: ["sub_a", "sub_c"] }));
    await runBillingRecovery();
    expect(retrieveRaw.mock.calls.map((c) => c[0])).toEqual(["sub_b"]);
  });
});

describe("GATE 4 - mode separation", () => {
  it("LIVE Stripe object under a TEST config -> conflict, no write", async () => {
    read.mockResolvedValue(cands({ ids: ["sub_live"] }));
    retrieveRaw.mockResolvedValue({ ok: true, object: OBJ("sub_live", true), livemode: true });
    const r = await runBillingRecovery();
    expect(r).toMatchObject({ kind: "ok", counts: { conflict: 1 } });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("TEST Stripe object under a LIVE config -> conflict, no write", async () => {
    cfg.state = "stripe_live";
    cfg.testMode = false;
    read.mockResolvedValue(cands({ ids: ["sub_test"] }));
    retrieveRaw.mockResolvedValue({ ok: true, object: OBJ("sub_test", false), livemode: false });
    const r = await runBillingRecovery();
    expect(r).toMatchObject({ kind: "ok", counts: { conflict: 1 } });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("candidate selection is asked for the adapter's mode only (live row never swept under test config and vice versa)", async () => {
    await runBillingRecovery();
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ testMode: true }));
    cfg.state = "stripe_live";
    cfg.testMode = false;
    await runBillingRecovery();
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ testMode: false }));
  });

  it("manual_* pilot rows never reach Stripe (excluded in the query AND by the sub_ id shape)", async () => {
    const src = readFileSync(join(__dirname, "subscription-store.ts"), "utf8");
    expect(src).toMatch(/"like", "manual%"/);
    read.mockResolvedValue(cands({ ids: ["manual_abc"] }));
    const r = await runBillingRecovery();
    expect(r).toMatchObject({ kind: "ok", counts: { noop: 1 } });
    expect(retrieveRaw).not.toHaveBeenCalled();
  });

  it("noop provider -> every subscription is 'inactive', Stripe never read", async () => {
    provider(false);
    const r = await runBillingRecovery();
    expect(r).toMatchObject({ kind: "ok", counts: { inactive: 2 } });
    expect(retrieveRaw).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("GATE 5 - drift classification in the sweep result", () => {
  it("exposes RECOVERABLE and UNMAPPABLE separately; unmappable is counted, never repaired", async () => {
    read.mockResolvedValue(cands({ ids: ids(2), unprocessedEvents: { total: 7, withSubscriptionRef: 3 } }));
    const r = await runBillingRecovery();
    expect(r).toMatchObject({
      kind: "ok",
      recoverableSubscriptionStateDrift: 2,
      unmappableUnprocessedWebhookEvents: 4,
      unmappableRepaired: 0,
    });
    expect(retrieveRaw).toHaveBeenCalledTimes(2); // only the recoverable rows were read from Stripe
  });
});
