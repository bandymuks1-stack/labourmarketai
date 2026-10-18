import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The partner door, end to end at the HTTP layer with the receiver mocked:
 * auth ordering, body limits, schema refusal, and the three stored outcomes
 * (created / duplicate / not_enabled). What the receiver itself does against
 * the database is pinned by the SQL guard (invitation-referral-network.test.ts)
 * and, once the owner applies the migration, by a production walk.
 */
const receive = vi.fn();
vi.mock("@/lib/invitations/external-referral-receive", () => ({
  receiveExternalReferral: (...args: unknown[]) => receive(...args),
}));
const funnel = vi.fn();
vi.mock("@/lib/telemetry/server-funnel", () => ({
  emitServerFunnelEvent: (...args: unknown[]) => funnel(...args),
}));

import { POST } from "@/app/api/referrals/external/v1/route";

const SECRET = "s".repeat(40);

function envelope(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    kind: "NONSTOP_WORKER_REFERRAL",
    leadId: "lead_1",
    locale: "ru",
    worker: {
      subjectType: "INDIVIDUAL_WORKER",
      professions: [{ raw: "сварщик" }],
      sectors: [],
      skills: [],
      languages: ["ru"],
      availability: "AVAILABLE_NOW",
      destinations: [],
      contact: { email: "w@example.com" },
    },
    consent: { given: true, text: "Согласен", version: "worker-broader-search-v1" },
    requests: [],
    ...over,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://labourmarket.ai/api/referrals/external/v1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-referral-source": "nonstop",
      authorization: `Bearer ${SECRET}`,
      "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/referrals/external/v1", () => {
  beforeEach(() => {
    receive.mockReset();
    funnel.mockReset();
    process.env.EXTERNAL_REFERRAL_TOKEN_NONSTOP = SECRET;
  });

  it("refuses an unauthenticated caller before reading the body, and tells it nothing about the schema", async () => {
    const res = await POST(post({ garbage: true }, { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "unauthorized" });
    expect(receive).not.toHaveBeenCalled();
  });

  it("refuses while the source secret is not configured — the door never opens on an empty comparison", async () => {
    delete process.env.EXTERNAL_REFERRAL_TOKEN_NONSTOP;
    const res = await POST(post(envelope()));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("not_configured");
    expect(receive).not.toHaveBeenCalled();
  });

  it("refuses invalid JSON and an envelope that fails the strict schema — nothing reaches the receiver", async () => {
    expect((await POST(post("{not json"))).status).toBe(400);
    const res = await POST(post(envelope({ consent: { given: false, text: "x", version: "worker-broader-search-v1" } })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.reason).toBe("invalid_envelope");
    expect(JSON.stringify(json)).not.toContain("сварщик");
    expect(receive).not.toHaveBeenCalled();
  });

  it("stores exactly once: created → 201 with the one-time link; the receiver gets the registry's consent version", async () => {
    receive.mockResolvedValue({
      outcome: "created",
      invitationId: "11111111-1111-4111-8111-111111111111",
      inviteUrl: "https://labourmarket.ai/ru/invite/tok",
      delivery: "not_sent",
    });
    const res = await POST(post(envelope()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, outcome: "created", leadId: "lead_1", delivery: "not_sent" });
    expect(json.inviteUrl).toBe("https://labourmarket.ai/ru/invite/tok");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(receive).toHaveBeenCalledTimes(1);
    const arg = receive.mock.calls[0]![0] as { source: { slug: string; consentVersion: string }; origin: string };
    expect(arg.source.slug).toBe("nonstop");
    expect(arg.source.consentVersion).toBe("worker-broader-search-v1");
    expect(arg.origin).toBe("https://labourmarket.ai");
    expect(funnel).toHaveBeenCalledTimes(1);
  });

  it("a replay is a 200 duplicate with the existing id and NO link", async () => {
    receive.mockResolvedValue({ outcome: "duplicate", invitationId: "11111111-1111-4111-8111-111111111111", status: "pending" });
    const res = await POST(post(envelope()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      outcome: "duplicate",
      invitationId: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      leadId: "lead_1",
    });
    expect(json).not.toHaveProperty("inviteUrl");
    expect(funnel).not.toHaveBeenCalled();
  });

  it("the database's own consent refusal is a 422, and an unapplied migration is a 503 not_enabled — never a stored claim", async () => {
    receive.mockResolvedValue({ outcome: "consent_required" });
    expect((await POST(post(envelope()))).status).toBe(422);
    receive.mockResolvedValue({ outcome: "needs_migration" });
    const res = await POST(post(envelope()));
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("not_enabled");
  });

  it("rejects an oversized body", async () => {
    const big = envelope({ worker: { ...envelope().worker, freeText: "x".repeat(70_000) } });
    const res = await POST(post(big));
    expect(res.status).toBe(413);
    expect(receive).not.toHaveBeenCalled();
  });
});
