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

/** A read-only fake of the service-role client: rpc + from(...).select().in().eq().is(). */
function fakeAdmin(opts: {
  health: DeliveryHealth;
  invitations?: Array<{ id: string; delivery_failure_class: string | null }>;
  attempts?: Array<{ invitation_id: string }>;
  invitationsError?: boolean;
}) {
  const writes: string[] = [];
  const query = (table: string) => {
    const result =
      table === "invitations"
        ? opts.invitationsError
          ? { data: null, error: { message: "boom" } }
          : { data: opts.invitations ?? [], error: null }
        : { data: opts.attempts ?? [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "in", "eq", "is"]) chain[m] = () => chain;
    for (const m of ["update", "insert", "upsert", "delete"]) chain[m] = () => (writes.push(`${m}:${table}`), chain);
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return chain;
  };
  const client = {
    rpc: async () => ({ data: opts.health, error: null }),
    from: query,
  } as unknown as SupabaseClient;
  return { client, writes };
}

describe("readInvitationDeliveryHealth (server wiring, read only)", () => {
  it("moves the reviewed 862a91f4 row to diagnostics and writes nothing", async () => {
    const { client, writes } = fakeAdmin({
      health: health(),
      invitations: [{ id: ID, delivery_failure_class: null }],
      attempts: [],
    });
    const h = await readInvitationDeliveryHealth(client);
    expect(h?.unknown_outcome_open).toBe(0);
    expect(h?.known_historical_unknown_outcome).toBe(1);
    expect(deliveryAlerts(h!)).toEqual([]);
    expect(writes).toEqual([]);
  });
  it("once the row has a ledgered attempt, it alerts again", async () => {
    const { client } = fakeAdmin({
      health: health(),
      invitations: [{ id: ID, delivery_failure_class: null }],
      attempts: [{ invitation_id: ID }],
    });
    const h = await readInvitationDeliveryHealth(client);
    expect(deliveryAlerts(h!)).toEqual(["unknown_outcome_open"]);
  });
  it("a lookup error keeps the alert", async () => {
    const { client } = fakeAdmin({ health: health(), invitationsError: true });
    const h = await readInvitationDeliveryHealth(client);
    expect(h?.unknown_outcome_open).toBe(1);
    expect(deliveryAlerts(h!)).toEqual(["unknown_outcome_open"]);
  });
});
