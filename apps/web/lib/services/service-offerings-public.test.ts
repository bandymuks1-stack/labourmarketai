import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const { createClient, getUser, revalidatePath, emitServerFunnelEvent } = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), revalidatePath: vi.fn(), emitServerFunnelEvent: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent }));

import {
  applyServiceOfferingAction, createServiceOffering, listOwnServiceOfferings,
  readServiceOfferingOwnership, updateServiceOffering,
} from "./service-offerings";
import type { ServiceOfferingInput } from "./service-offerings-shared";

const ID = "11111111-1111-4111-8111-111111111111";
type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Query = {
  select: Mock<(columns: string) => Query>;
  eq: Mock<(column: string, value: unknown) => Query>;
  order: Mock<(column: string, options: unknown) => Query>;
  insert: Mock<(values: Record<string, unknown>) => Query>;
  update: Mock<(values: Record<string, unknown>) => Query>;
  single: Mock<() => Promise<Reply>>;
  maybeSingle: Mock<() => Promise<Reply>>;
  then: (resolve: (value: Reply) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
};
const replies: Reply[] = [];
const queries: Query[] = [];
function query(reply: Reply): Query {
  const q: Query = {
    select: vi.fn<(columns: string) => Query>((): Query => q),
    eq: vi.fn<(column: string, value: unknown) => Query>((): Query => q),
    order: vi.fn<(column: string, options: unknown) => Query>((): Query => q),
    insert: vi.fn<(values: Record<string, unknown>) => Query>((): Query => q),
    update: vi.fn<(values: Record<string, unknown>) => Query>((): Query => q),
    single: vi.fn(async () => reply), maybeSingle: vi.fn(async () => reply),
    then: (resolve: (v: Reply) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(reply).then(resolve, reject),
  };
  return q;
}
const from = vi.fn(() => {
  const reply = replies.shift();
  if (!reply) throw new Error("Unexpected extra database read");
  const q = query(reply);
  queries.push(q);
  return q;
});
beforeEach(() => {
  vi.clearAllMocks();
  replies.length = 0;
  queries.length = 0;
  createClient.mockResolvedValue({ auth: { getUser }, from });
  getUser.mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null });
});
const own = { id: ID, title: "Repairs", status: "active", public_search_enabled: true, closed_outcome: null };

describe("owner-selected public audience", () => {
  it("keeps creation a draft even when the owner explicitly selects public search", async () => {
    replies.push({ data: { id: ID }, error: null });
    expect(await createServiceOffering({ title: "Repairs", publicSearchEnabled: true })).toEqual({ kind: "ok", id: ID });
    expect(queries[0].insert).toHaveBeenCalledWith(expect.objectContaining({
      provider_id: "owner-id", status: "draft", public_search_enabled: true,
    }));
  });

  it("lets the database default remain off for existing create callers", async () => {
    replies.push({ data: { id: ID }, error: null });
    await createServiceOffering({ title: "Repairs" });
    expect(queries[0].insert.mock.calls[0][0]).not.toHaveProperty("public_search_enabled");
  });

  it.each([true, false])("saves explicit public choice %s without changing lifecycle or ownership", async (enabled) => {
    replies.push({ data: [{ id: ID }], error: null });
    expect(await updateServiceOffering(ID, { title: "Repairs", publicSearchEnabled: enabled })).toEqual({ kind: "ok", id: ID });
    expect(queries[0].update.mock.calls[0][0]).toMatchObject({ public_search_enabled: enabled });
    expect(queries[0].update.mock.calls[0][0]).not.toHaveProperty("status");
    expect(queries[0].eq.mock.calls).toEqual([["id", ID], ["provider_id", "owner-id"]]);
  });

  it("preserves a stored public choice when an older caller edits other fields", async () => {
    replies.push({ data: [{ id: ID }], error: null });
    await updateServiceOffering(ID, { title: "Changed title" });
    expect(queries[0].update.mock.calls[0][0]).not.toHaveProperty("public_search_enabled");
  });

  it("rejects malformed opt-in instead of treating a truthy value as consent", async () => {
    const input = { title: "Repairs", publicSearchEnabled: "true" } as unknown as ServiceOfferingInput;
    expect(await updateServiceOffering(ID, input)).toEqual({ kind: "invalid", field: "publicSearchEnabled" });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not silently discard a choice when the migration is absent", async () => {
    replies.push({ data: null, error: { code: "42703", message: "public_search_enabled missing" } });
    expect(await updateServiceOffering(ID, { title: "Repairs", publicSearchEnabled: true }))
      .toEqual({ kind: "needs-migration" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a concurrent deletion or non-owner update cannot report a saved opt-in", async () => {
    replies.push({ data: [], error: null });
    expect(await updateServiceOffering(ID, { title: "Repairs", publicSearchEnabled: true }))
      .toEqual({ kind: "not-found" });
  });

  it("publishing never implicitly changes the separately stored public choice", async () => {
    replies.push({ data: { status: "draft", closed_outcome: null }, error: null }, { data: [{ id: ID }], error: null });
    expect(await applyServiceOfferingAction(ID, "publish")).toEqual({ kind: "ok", id: ID });
    expect(queries[1].update.mock.calls[0][0]).toMatchObject({ status: "active" });
    expect(queries[1].update.mock.calls[0][0]).not.toHaveProperty("public_search_enabled");
  });
});

describe("independent schema rollout", () => {
  it("returns the exact owner choice when both optional columns exist", async () => {
    replies.push({ data: [own], error: null });
    expect(await listOwnServiceOfferings()).toMatchObject({
      kind: "ok", publicSearchSupported: true, closedSupported: true,
      rows: [{ id: ID, publicSearchEnabled: true }],
    });
    expect(queries[0].eq).toHaveBeenCalledWith("provider_id", "owner-id");
  });

  it("keeps existing lifecycle actions when only public search is unapplied", async () => {
    replies.push(
      { data: null, error: { code: "42703", message: "column service_offerings.public_search_enabled does not exist" } },
      { data: [{ ...own, public_search_enabled: undefined }], error: null },
    );
    expect(await listOwnServiceOfferings()).toMatchObject({
      kind: "ok", publicSearchSupported: false, closedSupported: true, rows: [{ publicSearchEnabled: false }],
    });
    expect(queries).toHaveLength(2);
    expect(queries[1].select).toHaveBeenCalledWith(expect.stringContaining("closed_outcome"));
    expect(queries[1].select.mock.calls[0][0]).not.toContain("public_search_enabled");
  });

  it("keeps public choice readable when only lifecycle is unapplied", async () => {
    replies.push(
      { data: null, error: { code: "PGRST204", message: "Could not find closed_outcome" } },
      { data: [own], error: null },
    );
    expect(await listOwnServiceOfferings()).toMatchObject({
      kind: "ok", publicSearchSupported: true, closedSupported: false, rows: [{ publicSearchEnabled: true }],
    });
  });

  it("degrades both missing optional columns within three reads", async () => {
    replies.push(
      { data: null, error: { code: "42703", message: "closed_outcome missing" } },
      { data: null, error: { code: "PGRST204", message: "public_search_enabled missing" } },
      { data: [{ ...own, public_search_enabled: undefined }], error: null },
    );
    expect(await listOwnServiceOfferings()).toMatchObject({
      kind: "ok", publicSearchSupported: false, closedSupported: false, rows: [{ publicSearchEnabled: false }],
    });
    expect(queries).toHaveLength(3);
  });

  it("does not turn a database outage into empty offerings or unsupported publication", async () => {
    replies.push({ data: null, error: { code: "57014", message: "timeout" } });
    expect(await listOwnServiceOfferings()).toEqual({ kind: "unavailable" });
    expect(queries).toHaveLength(1);
  });
});

describe("bounded contact ownership check", () => {
  it.each([[{ id: ID }, "own"], [null, "not-own"]] as const)(
    "resolves an exact authenticated row without exposing provider identity (%s)", async (data, result) => {
      replies.push({ data, error: null });
      expect(await readServiceOfferingOwnership(ID)).toBe(result);
      expect(queries).toHaveLength(1);
      expect(queries[0].select).toHaveBeenCalledWith("id");
      expect(queries[0].eq.mock.calls).toEqual([["id", ID], ["provider_id", "owner-id"]]);
      expect(queries[0].maybeSingle).toHaveBeenCalledOnce();
    },
  );

  it("does not read owner rows for a signed-out visitor", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await readServiceOfferingOwnership(ID)).toBe("not-authed");
    expect(from).not.toHaveBeenCalled();
  });

  it("fails closed on auth, row and malformed-response failures", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "offline" } });
    expect(await readServiceOfferingOwnership(ID)).toBe("unavailable");
    expect(from).not.toHaveBeenCalled();
    replies.push({ data: null, error: { code: "57014" } }, { data: { id: "wrong" }, error: null });
    expect(await readServiceOfferingOwnership(ID)).toBe("unavailable");
    expect(await readServiceOfferingOwnership(ID)).toBe("unavailable");
    expect(await readServiceOfferingOwnership("invalid")).toBe("unavailable");
    expect(queries).toHaveLength(2);
  });
});
