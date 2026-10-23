import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/api/supply-feed-auth", () => ({ authorizeSupplyFeedRequest: () => auth() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { COMMERCIAL_METRIC_KEYS } from "@/lib/api/agentai-ops-evidence";

import { POST } from "@/app/api/internal/agentai-ops-evidence/v1/route";

const period = Object.fromEntries(COMMERCIAL_METRIC_KEYS.map((k) => [k, 1]));
const body = {
  schema: "agentai-ops-evidence/v1",
  builtAtIso: "2026-10-23T18:00:00.000Z",
  deployedSha: "84db8d8a9ebba3f650e5ec3c2e84b83798196de9",
  jobs: { "standing-send-drain": ["OK", "2026-10-23T17:59Z", 0] },
  commercial: { today: period, week: period, total: period },
  listener: { imapLastSeenIso: null },
};
const post = (text: string) => POST(new Request("http://x/api/internal/agentai-ops-evidence/v1", { method: "POST", body: text }));

describe("POST /api/internal/agentai-ops-evidence/v1", () => {
  beforeEach(() => {
    auth.mockReset().mockReturnValue("ok");
    rpc.mockReset().mockResolvedValue({ data: 7, error: null });
  });

  it("refuses 503 while the secret is unset and 401 on a wrong token, before touching the store", async () => {
    auth.mockReturnValue("not_configured");
    expect((await post(JSON.stringify(body))).status).toBe(503);
    auth.mockReturnValue("unauthorized");
    expect((await post(JSON.stringify(body))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an oversize body 413 and a contract break 400", async () => {
    expect((await post("x".repeat(3801))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...body, note: "a@b.c" }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores the validated snapshot through the service-role-only writer and returns its id", async () => {
    const res = await post(JSON.stringify(body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: 7 });
    expect(rpc).toHaveBeenCalledWith("agentai_ops_evidence_insert_v1", { p_snapshot: body });
  });

  it("maps the snapshot size CHECK to 413 and any other store error to 503", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514" } });
    expect((await post(JSON.stringify(body))).status).toBe(413);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect((await post(JSON.stringify(body))).status).toBe(503);
  });
});
