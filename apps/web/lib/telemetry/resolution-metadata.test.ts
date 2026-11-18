import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHAT RESOLUTION TELEMETRY SURVIVES THE ALLOWLIST (owner program 2026-09-23).
 *
 * The chat has sent `metadata.resolution` (deterministic | goal | llm) on every
 * `chat_intent_*` event since 2026-09-05, and the server allowlist stripped it
 * — production rows carried no resolution at all, so the owner could not see
 * how much the goal layer or the model actually carries. The key is now
 * allowlisted AND bounded: only the three members of the closed set survive.
 */

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: (name: string) => (name === "host" ? "labourmarket.ai" : null) })),
}));
const insertMock = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => ({ insert: insertMock }),
  })),
}));

import { recordTelemetryEvent } from "@/lib/telemetry/actions";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

const base = {
  sessionId: "s_resolution",
  route: "/lt/dashboard",
  locale: "lt",
  eventName: FUNNEL_EVENTS.chatIntentRecognized,
};

const inserted = () =>
  insertMock.mock.calls.at(-1)?.[0] as { metadata: Record<string, unknown> } | undefined;

beforeEach(() => {
  insertMock.mockClear();
});

describe("metadata.resolution", () => {
  it("each member of the closed set is kept", async () => {
    for (const resolution of ["deterministic", "goal", "llm"]) {
      const r = await recordTelemetryEvent({
        ...base,
        metadata: { surface: "chat", step: "rename-organization", role_context: "agency", resolution },
      });
      expect(r).toEqual({ ok: true });
      expect(inserted()?.metadata.resolution, resolution).toBe(resolution);
      // The neighbouring dims still travel.
      expect(inserted()?.metadata.step).toBe("rename-organization");
    }
  });

  it("NEGATIVE CONTROL — anything outside the set is dropped, never truncated into the row", async () => {
    for (const resolution of ["model", "LLM", "deterministic ", "pervadink agentūrą", 3, true]) {
      await recordTelemetryEvent({ ...base, metadata: { surface: "chat", resolution } });
      expect(inserted()?.metadata, String(resolution)).not.toHaveProperty("resolution");
      // The event itself still lands — a bad value is dropped, not fatal.
      expect(inserted()?.metadata.surface).toBe("chat");
    }
  });
});
