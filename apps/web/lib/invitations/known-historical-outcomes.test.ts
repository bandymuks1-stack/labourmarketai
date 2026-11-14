import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { deliveryAlerts, type DeliveryHealth } from "@/lib/invitations/delivery-retry";
import { readInvitationDeliveryHealth } from "@/lib/invitations/delivery-retry-run";
import {
  countKnownHistorical,
  KNOWN_HISTORICAL_OUTCOMES,
  KNOWN_HISTORICAL_UNKNOWN_OUTCOME,
  withKnownHistorical,
  type KnownHistoricalOutcome,
} from "@/lib/invitations/known-historical-outcomes";

const ID = "862a91f4-a58f-4359-81a8-a22d11218445";
const OTHER = "00000000-0000-4000-8000-000000000001";

const health = (over: Partial<DeliveryHealth> = {}): DeliveryHealth => ({
  attempts: 1,
  sent: 1,
  failed_temporary: 0,
  failed_permanent: 0,
  failed_configuration: 0,
  failed_unknown_outcome: 0,
  failed_last_hour: 0,
  retry_due: 0,
  retry_scheduled: 0,
  dead_letter: 0,
  unknown_outcome_open: 1,
  bounced: 0,
  stuck_reservations: 0,
  reasons: {},
  ...over,
});

describe("owner register (decision 2026-11-14)", () => {
  it("holds invitation 862a91f4 as KNOWN_HISTORICAL_UNKNOWN_OUTCOME with NO_RESEND — never a delivered state", () => {
    expect(KNOWN_HISTORICAL_OUTCOMES).toHaveLength(1);
    const [r] = KNOWN_HISTORICAL_OUTCOMES;
    expect(r.invitationId).toBe(ID);
    expect(r.classification).toBe(KNOWN_HISTORICAL_UNKNOWN_OUTCOME);
    expect(r.decision).toBe("NO_RESEND");
    expect(JSON.stringify(KNOWN_HISTORICAL_OUTCOMES)).not.toMatch(/DELIVERED/);
  });
});

describe("countKnownHistorical — only while the row is exactly as reviewed", () => {
  const reg: KnownHistoricalOutcome[] = [...KNOWN_HISTORICAL_OUTCOMES];
  it("counts the registered unclassified pre-ledger failure", () => {
    expect(countKnownHistorical([{ id: ID, delivery_failure_class: null, ledgered_attempts: 0 }], reg)).toBe(1);
  });
  it("a NEW unknown outcome (not in the register) is never known-historical", () => {
    expect(countKnownHistorical([{ id: OTHER, delivery_failure_class: null, ledgered_attempts: 0 }], reg)).toBe(0);
  });
  it("a registered row that got a ledgered attempt or a failure class is an ordinary row again", () => {
    expect(countKnownHistorical([{ id: ID, delivery_failure_class: null, ledgered_attempts: 1 }], reg)).toBe(0);
    expect(countKnownHistorical([{ id: ID, delivery_failure_class: "UNKNOWN_OUTCOME", ledgered_attempts: 0 }], reg)).toBe(0);
  });
  it("a duplicated row is counted once", () => {
    const r = { id: ID, delivery_failure_class: null, ledgered_attempts: 0 };
    expect(countKnownHistorical([r, r], reg)).toBe(1);
  });
});

describe("withKnownHistorical + deliveryAlerts", () => {
  it("the historical case stays visible in diagnostics and raises no alert", () => {
    const h = withKnownHistorical(health(), 1);
    expect(h.unknown_outcome_open).toBe(0);
    expect(h.known_historical_unknown_outcome).toBe(1);
    expect(deliveryAlerts(h)).toEqual([]);
  });
  it("a NEW unknown outcome next to the historical one still alerts at once", () => {
    const h = withKnownHistorical(health({ unknown_outcome_open: 2 }), 1);
    expect(h.unknown_outcome_open).toBe(1);
    expect(deliveryAlerts(h)).toEqual(["unknown_outcome_open"]);
  });
  it("BOUNCED and DEAD_LETTER alerts are untouched", () => {
    const h = withKnownHistorical(health({ bounced: 1, dead_letter: 1 }), 1);
    expect(deliveryAlerts(h)).toEqual(["dead_letter_present", "bounced"]);
  });
  it("an unreadable lookup (null) keeps the alert — it never hides a real unknown outcome", () => {
    const h = withKnownHistorical(health(), null);
    expect(h.unknown_outcome_open).toBe(1);
    expect(h.known_historical_unknown_outcome).toBeUndefined();
    expect(deliveryAlerts(h)).toEqual(["unknown_outcome_open"]);
  });
  it("never moves more than the open count", () => {
    const h = withKnownHistorical(health({ unknown_outcome_open: 0 }), 1);
    expect(h.unknown_outcome_open).toBe(0);
    expect(h.known_historical_unknown_outcome).toBe(0);
  });
});

/**
 * A read-only fake of the service-role client: rpc ONLY. `invitation_known_historical_unknown_v1`
 * is simulated with the same conditions the SQL applies (in p_ids, class null, no ledgered attempt);
 * any `.from(` call is recorded — the module must never make one (service_role has no table grant).
 */
function fakeAdmin(opts: {
  health: DeliveryHealth;
  invitations?: Array<{ id: string; delivery_failure_class: string | null }>;
  attempts?: Array<{ invitation_id: string }>;
  invitationsError?: boolean;
  knownData?: unknown;
}) {
  const writes: string[] = [];
  const fromCalls: string[] = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      if (fn === "invitation_delivery_health_v1") return { data: opts.health, error: null };
      if (fn === "invitation_known_historical_unknown_v1") {
        if (opts.invitationsError) return { data: null, error: { message: "boom" } };
        if ("knownData" in opts) return { data: opts.knownData, error: null };
        const ids = new Set((args as { p_ids: string[] }).p_ids);
        const attempted = new Set((opts.attempts ?? []).map((a) => a.invitation_id));
        const n = (opts.invitations ?? []).filter(
          (r) => ids.has(r.id) && r.delivery_failure_class === null && !attempted.has(r.id),
        ).length;
        return { data: n, error: null };
      }
      writes.push(`rpc:${fn}`);
      return { data: null, error: { message: "unexpected rpc" } };
    },
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error(`.from(${table}) must not be called`);
    },
  } as unknown as SupabaseClient;
  return { client, writes, fromCalls, rpcCalls };
}

describe("readInvitationDeliveryHealth (server wiring, read only)", () => {
  it("moves the reviewed 862a91f4 row to diagnostics and writes nothing", async () => {
    const { client, writes, fromCalls, rpcCalls } = fakeAdmin({
      health: health(),
      invitations: [{ id: ID, delivery_failure_class: null }],
      attempts: [],
    });
    const h = await readInvitationDeliveryHealth(client);
    expect(h?.unknown_outcome_open).toBe(0);
    expect(h?.known_historical_unknown_outcome).toBe(1);
    expect(deliveryAlerts(h!)).toEqual([]);
    expect(writes).toEqual([]);
    expect(fromCalls).toEqual([]);
    expect(rpcCalls).toEqual([
      { fn: "invitation_delivery_health_v1", args: { p_hours: 24 } },
      { fn: "invitation_known_historical_unknown_v1", args: { p_ids: [ID] } },
    ]);
  });
  it("once the row has a ledgered attempt, it alerts again", async () => {
    const { client, fromCalls } = fakeAdmin({
      health: health(),
      invitations: [{ id: ID, delivery_failure_class: null }],
      attempts: [{ invitation_id: ID }],
    });
    const h = await readInvitationDeliveryHealth(client);
    expect(deliveryAlerts(h!)).toEqual(["unknown_outcome_open"]);
    expect(fromCalls).toEqual([]);
  });
  it("once the row has a failure class, it alerts again", async () => {
    const { client } = fakeAdmin({ health: health(), invitations: [{ id: ID, delivery_failure_class: "UNKNOWN_OUTCOME" }] });
    const h = await readInvitationDeliveryHealth(client);
    expect(deliveryAlerts(h!)).toEqual(["unknown_outcome_open"]);
  });
  it("a lookup error (e.g. the RPC is not applied yet) keeps the alert", async () => {
    const { client, fromCalls } = fakeAdmin({ health: health(), invitationsError: true });
    const h = await readInvitationDeliveryHealth(client);
    expect(h?.unknown_outcome_open).toBe(1);
    expect(deliveryAlerts(h!)).toEqual(["unknown_outcome_open"]);
    expect(fromCalls).toEqual([]);
  });
  it.each([["a string", "1"], ["a negative", -1], ["a fraction", 0.5], ["null", null], ["an object", { n: 1 }]])(
    "a non-integer RPC answer (%s) keeps the alert",
    async (_why, knownData) => {
      const { client } = fakeAdmin({ health: health(), knownData });
      const h = await readInvitationDeliveryHealth(client);
      expect(h?.unknown_outcome_open).toBe(1);
      expect(deliveryAlerts(h!)).toEqual(["unknown_outcome_open"]);
    },
  );
  it("the module source makes no `.from(` call", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "delivery-retry-run.ts"), "utf8");
    expect(src).not.toMatch(/\.from\(/);
    expect(src).toMatch(/\.rpc\("invitation_known_historical_unknown_v1", \{ p_ids \}\)/);
  });
});
