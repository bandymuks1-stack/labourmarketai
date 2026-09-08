import { describe, expect, it } from "vitest";

import {
  emitNotificationEvent,
  markAllNotificationEventsRead,
  markNotificationEventRead,
  notificationDedupeKey,
  NOTIFICATION_EVENT_TYPES,
  readMyNotificationEvents,
} from "./events";

/**
 * Durable notification events — adapter behaviour.
 *
 * The load-bearing claims:
 *   1. an ABSENT store (owner-gated migration unapplied) is the honest
 *      `feature_unavailable`, never an error and never a fake success;
 *   2. a retried emit is a `duplicate`, not a second row (the unique
 *      constraint carries idempotency; the adapter classifies it);
 *   3. metadata is allowlisted — free-form keys never reach the row;
 *   4. mark-all-read reports `persisted` only when the store answered.
 */

interface Recorded {
  table: string;
  kind: "insert" | "update" | "select" | "eq" | "limit";
  payload?: unknown;
}

function fakeDb(options: {
  errorCode?: string | null;
  rows?: Record<string, unknown>[];
} = {}) {
  const ops: Recorded[] = [];
  const result =
    options.errorCode != null
      ? { data: null, error: { code: options.errorCode } }
      : { data: options.rows ?? [], error: null };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = (...args: unknown[]) => {
    ops.push({ table: "notification_events", kind: "select", payload: args[0] });
    return chain;
  };
  chain.order = self;
  chain.limit = (value: unknown) => {
    ops.push({ table: "notification_events", kind: "limit", payload: value });
    return chain;
  };
  chain.is = self;
  chain.eq = (...args: unknown[]) => {
    ops.push({ table: "notification_events", kind: "eq", payload: args });
    return chain;
  };
  chain.insert = (payload: unknown) => {
    ops.push({ table: "notification_events", kind: "insert", payload });
    return Promise.resolve(
      options.errorCode != null
        ? { error: { code: options.errorCode } }
        : { error: null },
    );
  };
  chain.update = (payload: unknown) => {
    ops.push({ table: "notification_events", kind: "update", payload });
    return chain;
  };
  chain.then = (
    ok: (v: unknown) => unknown,
    err?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(ok, err);
  return { client: { from: () => chain } as never, ops };
}

const INPUT = {
  recipientProfileId: "11111111-1111-4111-8111-111111111111",
  eventType: "booking_proposed" as const,
  entityType: "booking_request" as const,
  entityId: "22222222-2222-4222-8222-222222222222",
};

describe("emitNotificationEvent", () => {
  it("writes the row with the deterministic dedupe key", async () => {
    const { client, ops } = fakeDb();
    const outcome = await emitNotificationEvent(client, INPUT);
    expect(outcome).toEqual({ kind: "written" });
    const insert = ops.find((o) => o.kind === "insert")!.payload as Record<
      string,
      unknown
    >;
    expect(insert.dedupe_key).toBe(
      notificationDedupeKey("booking_proposed", INPUT.entityId),
    );
    expect(insert.recipient_profile_id).toBe(INPUT.recipientProfileId);
  });

  it("a unique violation is a DUPLICATE — the retried action re-emitted harmlessly", async () => {
    const { client } = fakeDb({ errorCode: "23505" });
    expect(await emitNotificationEvent(client, INPUT)).toEqual({
      kind: "duplicate",
    });
  });

  it("an absent table is feature_unavailable, not an error", async () => {
    const { client } = fakeDb({ errorCode: "42P01" });
    expect(await emitNotificationEvent(client, INPUT)).toEqual({
      kind: "feature_unavailable",
    });
  });

  it("metadata is ALLOWLISTED — free-form keys never reach the row", async () => {
    const { client, ops } = fakeDb();
    await emitNotificationEvent(client, {
      ...INPUT,
      metadata: {
        country: "SE",
        note: "personal free text that must not be stored",
        recipientEmail: "x@y.z",
      } as never,
    });
    const insert = ops.find((o) => o.kind === "insert")!.payload as Record<
      string,
      unknown
    >;
    expect(insert.metadata).toEqual({ country: "SE" });
  });

  it("never throws — a thrown client is an unexpected_error outcome", async () => {
    const client = {
      from: () => {
        throw new Error("boom");
      },
    } as never;
    expect(await emitNotificationEvent(client, INPUT)).toEqual({
      kind: "unexpected_error",
      code: "thrown",
    });
  });
});

describe("readMyNotificationEvents", () => {
  it("maps rows and counts the real unread set", async () => {
    const { client } = fakeDb({
      rows: [
        {
          id: "a",
          event_type: "absence_approved",
          entity_type: "worker_absence",
          entity_id: "e1",
          created_at: "2026-08-10T07:00:00Z",
          read_at: null,
          metadata: {},
        },
        {
          id: "b",
          event_type: "booking_proposed",
          entity_type: "booking_request",
          entity_id: "e2",
          created_at: "2026-08-09T07:00:00Z",
          read_at: "2026-08-09T08:00:00Z",
          metadata: { country: "SE" },
        },
      ],
    });
    const feed = await readMyNotificationEvents(client);
    if (feed.kind !== "ready") throw new Error("expected ready");
    expect(feed.events).toHaveLength(2);
    expect(feed.unreadCount).toBe(1);
    expect(feed.events[1].metadata).toEqual({ country: "SE" });
  });

  it("an absent store is feature_unavailable — the bell renders exactly the pre-migration product", async () => {
    const { client } = fakeDb({ errorCode: "PGRST205" });
    expect(await readMyNotificationEvents(client)).toEqual({
      kind: "feature_unavailable",
    });
  });
});

describe("markAllNotificationEventsRead", () => {
  it("persists — and only claims persisted when the store answered", async () => {
    const { client, ops } = fakeDb();
    const outcome = await markAllNotificationEventsRead(
      client,
      "2026-08-10T07:00:00Z",
    );
    expect(outcome).toEqual({ kind: "persisted" });
    const update = ops.find((o) => o.kind === "update")!.payload as Record<
      string,
      unknown
    >;
    expect(update.read_at).toBe("2026-08-10T07:00:00Z");
  });

  it("an absent store degrades honestly — the button behaves exactly as before the migration", async () => {
    const { client } = fakeDb({ errorCode: "42P01" });
    expect(
      await markAllNotificationEventsRead(client, "2026-08-10T07:00:00Z"),
    ).toEqual({ kind: "feature_unavailable" });
  });
});

describe("markNotificationEventRead (per-row, completion v1)", () => {
  it("stamps read_at on exactly the named row (id filter present)", async () => {
    const { client, ops } = fakeDb();
    const outcome = await markNotificationEventRead(
      client,
      "33333333-3333-4333-8333-333333333333",
      "2026-08-31T07:00:00Z",
    );
    expect(outcome).toEqual({ kind: "persisted" });
    const update = ops.find((o) => o.kind === "update")!.payload as Record<
      string,
      unknown
    >;
    expect(update.read_at).toBe("2026-08-31T07:00:00Z");
    const eq = ops.find((o) => o.kind === "eq")!.payload as unknown[];
    expect(eq).toEqual(["id", "33333333-3333-4333-8333-333333333333"]);
  });

  it("an absent store degrades honestly", async () => {
    const { client } = fakeDb({ errorCode: "PGRST205" });
    expect(
      await markNotificationEventRead(client, "x", "2026-08-31T07:00:00Z"),
    ).toEqual({ kind: "feature_unavailable" });
  });
});

describe("feed limit (completion v1)", () => {
  it("defaults to the bell's 20", async () => {
    const { client, ops } = fakeDb({ rows: [] });
    await readMyNotificationEvents(client);
    expect(ops.find((o) => o.kind === "limit")!.payload).toBe(20);
  });

  it("a caller-supplied limit is used, clamped to the 200 ceiling", async () => {
    const first = fakeDb({ rows: [] });
    await readMyNotificationEvents(first.client, 100);
    expect(first.ops.find((o) => o.kind === "limit")!.payload).toBe(100);

    const second = fakeDb({ rows: [] });
    await readMyNotificationEvents(second.client, 100000);
    expect(second.ops.find((o) => o.kind === "limit")!.payload).toBe(200);
  });
});

describe("NOTIFICATION_EVENT_TYPES (runtime list)", () => {
  it("carries every code-side type exactly once (settings-surface source)", () => {
    expect(new Set(NOTIFICATION_EVENT_TYPES).size).toBe(
      NOTIFICATION_EVENT_TYPES.length,
    );
    // Spot-pin the families; exhaustiveness is compile-time-checked in the
    // module itself (EventTypesNotListed).
    expect(NOTIFICATION_EVENT_TYPES).toContain("booking_proposed");
    expect(NOTIFICATION_EVENT_TYPES).toContain("weekly_digest");
    expect(NOTIFICATION_EVENT_TYPES).toContain("demand_interest_reviewed");
    expect(NOTIFICATION_EVENT_TYPES.length).toBe(20);
  });
});
