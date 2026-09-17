import { describe, expect, it, vi } from "vitest";

import {
  classifyDoorResponse,
  dispatchQueuedHandoffs,
  HANDOFF_DISPATCH_LOG,
} from "./handoff-dispatch";

/**
 * DISPATCH SAFETY (connection 2026-09-17). The door's answers move state
 * exactly as the contract says, and nothing else does:
 *   201 / 200 → delivered · 409 → conflict, fail-closed · 401/403 → auth
 *   failure, sweep stops · 400/413/422 → rejected · 429/5xx/network → retry.
 * The bearer never reaches a log line; the payload never reaches a log line.
 */

const ENV = {
  NONSTOP_HANDOFF_ENDPOINT: "https://nonstopgroup.eu/api/partners/labourmarket/handoffs/v1",
  NONSTOP_HANDOFF_TOKEN: "t".repeat(48),
};

const row = (id: string) => ({
  handoff_id: id, created_at: "2026-09-17T12:00:00Z", outreach_state: "ineligible_too_new",
  employer_key: "arbetsformedlingen:org:1", proposition_consent: { given: false },
  interest_signal_id: "s-" + id, interest_at: null, interest_status: "interested", match_status: "weak",
  profile_id: "p", worker_id: "w", locale: "ru", profession_slug: "warehouse_worker",
  skill_slugs: ["warehouse-operations"], languages: [], availability_status: null, current_country: "LT", basis: "declared",
  vacancy_id: "v-" + id, provider_key: "arbetsformedlingen", external_id: "1", title: "T", country: "SE", city: null,
  published_at: "2026-09-17T00:00:00Z", expires_at: null, application_url: null, vacancy_profession: null,
  employer_name: "E", employer_org_id: "1", employer_homepage: null,
});

/** A fake admin: the reader returns `rows`; updates are recorded. */
function fakeAdmin(rows: ReturnType<typeof row>[]) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const admin = {
    rpc: async () => ({ data: rows, error: null }),
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_k: string, id: string) => ({
          eq: async () => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { admin, updates };
}

const doorAnswering = (statuses: number[]) => {
  let i = 0;
  const calls: { headers: Record<string, string>; body: string }[] = [];
  const fetchImpl = (async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ headers: init.headers, body: init.body });
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    if (status < 0) throw new Error("network");
    return { status } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe("classifyDoorResponse", () => {
  it("maps every status class to the contract's outcome", () => {
    expect(classifyDoorResponse(201)).toBe("delivered");
    expect(classifyDoorResponse(200)).toBe("duplicate");
    expect(classifyDoorResponse(409)).toBe("conflict");
    expect(classifyDoorResponse(401)).toBe("auth_failed");
    expect(classifyDoorResponse(403)).toBe("auth_failed");
    for (const s of [400, 413, 422]) expect(classifyDoorResponse(s)).toBe("rejected");
    for (const s of [429, 500, 502, 503, 504, 0]) expect(classifyDoorResponse(s)).toBe("retry");
  });
});

describe("dispatchQueuedHandoffs", () => {
  it("marks delivered only on 201/200; a 503 or a network error leaves the row queued (retryable)", async () => {
    const { admin, updates } = fakeAdmin([row("a"), row("b"), row("c"), row("d")]);
    const { fetchImpl, calls } = doorAnswering([201, 200, 503, -1]);
    const r = await dispatchQueuedHandoffs({ env: ENV, fetchImpl, adminFactory: () => admin });
    expect(r).toEqual({ kind: "ran", queued: 4, delivered: 1, duplicates: 1, rejected: 0, conflicts: 0, authFailed: 0, retryLater: 2 });
    expect(updates.map((u) => u.id)).toEqual(["a", "b"]);
    expect(updates[0].patch.status).toBe("delivered");
    expect(calls).toHaveLength(4);
    // The bearer travels in the header; the source header is set.
    expect(calls[0].headers.authorization).toBe(`Bearer ${ENV.NONSTOP_HANDOFF_TOKEN}`);
    expect(calls[0].headers["X-Handoff-Source"]).toBe("labourmarket.ai");
  });

  it("409 is a conflict: fail-closed, never marked delivered", async () => {
    const { admin, updates } = fakeAdmin([row("a")]);
    const { fetchImpl } = doorAnswering([409]);
    const r = await dispatchQueuedHandoffs({ env: ENV, fetchImpl, adminFactory: () => admin });
    expect(r).toMatchObject({ kind: "ran", conflicts: 1, delivered: 0, duplicates: 0 });
    expect(updates).toHaveLength(0);
  });

  it("401/403 stops the sweep: nothing more is sent, nothing is marked", async () => {
    const { admin, updates } = fakeAdmin([row("a"), row("b")]);
    const { fetchImpl, calls } = doorAnswering([401, 201]);
    const r = await dispatchQueuedHandoffs({ env: ENV, fetchImpl, adminFactory: () => admin });
    expect(r).toMatchObject({ kind: "ran", authFailed: 1, delivered: 0 });
    expect(calls).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it("logs a bounded line per attempt and a run summary — never the bearer, never the payload", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin } = fakeAdmin([row("abcdef12-0000")]);
    const { fetchImpl } = doorAnswering([201]);
    await dispatchQueuedHandoffs({ env: ENV, fetchImpl, adminFactory: () => admin });
    const lines = spy.mock.calls.map((c) => JSON.stringify(c));
    spy.mockRestore();
    expect(lines.some((l) => l.includes(HANDOFF_DISPATCH_LOG) && l.includes('"handoff":"abcdef12"') && l.includes('"outcome":"delivered"'))).toBe(true);
    for (const l of lines) {
      expect(l).not.toContain(ENV.NONSTOP_HANDOFF_TOKEN);
      expect(l).not.toContain("warehouse-operations");
      expect(l).not.toContain("profileRef");
    }
  });

  it("stays inert without the door settings", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await dispatchQueuedHandoffs({ env: {}, fetchImpl })).toEqual({ kind: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
