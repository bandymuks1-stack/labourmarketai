import { beforeEach, describe, expect, it, vi } from "vitest";

const append = vi.fn();
vi.mock("@/lib/assistant/transcript", () => ({ appendAssistantTurn: (...a: unknown[]) => append(...a) }));

import { POST } from "@/app/api/assistant/transcript/route";

const URL_ = "https://labourmarket.ai/api/assistant/transcript";
function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://labourmarket.ai", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  append.mockReset();
  append.mockResolvedValue({ available: true, conversationId: "c-1", seq: 7 });
});

describe("/api/assistant/transcript", () => {
  it("writes one turn through the one writer and reports the thread", async () => {
    const res = await POST(req({ role: "user", text: "kiek žmonių dirba šiandien?", language: "lt", conversationId: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true, conversationId: "c-1", seq: 7 });
    expect(append).toHaveBeenCalledWith({ conversationId: null, role: "user", text: "kiek žmonių dirba šiandien?", language: "lt" });
  });

  it("refuses a cross-site write (another origin, or a cross-site fetch)", async () => {
    expect((await POST(req({ role: "user", text: "x" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(req({ role: "user", text: "x" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(append).not.toHaveBeenCalled();
  });

  it("refuses non-JSON, junk, an unknown role and empty text — nothing written", async () => {
    expect((await POST(req({ role: "user", text: "x" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(req("{not json"))).status).toBe(400);
    expect((await POST(req({ role: "system", text: "x" }))).status).toBe(400);
    expect((await POST(req({ role: "user", text: "   " }))).status).toBe(400);
    expect(append).not.toHaveBeenCalled();
  });

  it("an unavailable store answers saved:false — never a claimed success", async () => {
    append.mockResolvedValue({ available: false });
    const res = await POST(req({ role: "assistant", text: "answer" }));
    expect(await res.json()).toEqual({ saved: false });
  });
});
