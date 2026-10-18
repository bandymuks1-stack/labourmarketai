import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A consent history that could not be read is NOT an empty history.
 *
 * THE DEFECT (swallowed-read-error class). `getMyConsentHistory` returned `[]`
 * on any error — no reader, RPC absent, RPC failed, malformed payload — and
 * the privacy screen rendered that `[]` as "no consent events yet" and "no
 * transfers yet": a statement about the person's own legal record made from a
 * failed query. A person who HAD granted discoverability, or had a disclosure
 * on file, was told they had none.
 *
 * `failed` and `not-authed` now travel as their own kinds; `ok` carries the
 * rows. Both directions are pinned: a genuine empty ledger is still
 * `{ kind: "ok", rows: [] }` — a fix that marked everything unknown would be
 * just as dishonest.
 */

const h = {
  user: { id: "u1" } as { id: string } | null,
  rpc: { data: null as unknown, error: null as unknown },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async () => h.rpc,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getMyConsentHistory } = await import("@/lib/privacy/discoverability-actions");

beforeEach(() => {
  h.user = { id: "u1" };
  h.rpc = { data: null, error: null };
});

describe("getMyConsentHistory — failed is never an empty list", () => {
  it("a read the server refused is `failed`, not `[]`", async () => {
    h.rpc = { data: null, error: { code: "57014", message: "timeout" } };
    expect(await getMyConsentHistory()).toEqual({ kind: "failed" });
  });

  it("an RPC that is not applied yet is `failed` too — the screen must not claim an empty ledger", async () => {
    h.rpc = { data: null, error: { code: "42883", message: "function does not exist" } };
    expect(await getMyConsentHistory()).toEqual({ kind: "failed" });
  });

  it("a payload that is not a list is `failed` (malformed is not empty)", async () => {
    h.rpc = { data: { rows: [] }, error: null };
    expect(await getMyConsentHistory()).toEqual({ kind: "failed" });
  });

  it("no signed-in reader is `not-authed` — never the empty history of nobody", async () => {
    h.user = null;
    expect(await getMyConsentHistory()).toEqual({ kind: "not-authed" });
  });

  it("a genuinely empty ledger is still ok + [] (the distinction only means something if empty stays reachable)", async () => {
    h.rpc = { data: [], error: null };
    expect(await getMyConsentHistory()).toEqual({ kind: "ok", rows: [] });
  });

  it("rows come back mapped, under `ok`", async () => {
    h.rpc = {
      data: [
        {
          id: 7,
          purpose: "profile_discoverability",
          action: "granted",
          consent_text_version: 1,
          locale: "lt",
          source: "conversation",
          created_at: "2026-09-23T10:00:00Z",
          recipient_organization_id: null,
          context_type: null,
          selected_fields: null,
        },
      ],
      error: null,
    };
    const res = await getMyConsentHistory();
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      id: "7",
      purpose: "profile_discoverability",
      action: "granted",
      version: "1",
      source: "conversation",
      recipientOrganizationId: null,
      selectedFields: null,
    });
  });
});
