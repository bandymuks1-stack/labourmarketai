import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Chat audit 2026-11-11, defect 1: a message sent through an assistant door
 * (MCP / ChatGPT) was stamped with the REQUEST's UI locale — `lt` by default —
 * so a Swedish text was stored as Lithuanian: the LT reader got no
 * translation offer and everyone else a wrong "translated from" label.
 * Now the assistant door passes the language the person declares, or the
 * message is stored as language unknown (NULL). The web composer, which
 * shows its author the language it will stamp, keeps the UI-locale rule.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/event-emitters", () => ({ emitMessageReceivedNotifications: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

import { sendMessageCore } from "./communication-core";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const CONV = "44444444-4444-4444-8444-444444444444";
let inserted: Record<string, unknown> | null = null;

function client() {
  return {
    from(table: string) {
      if (table === "conversation_participants") {
        const c = { select: () => c, eq: () => c, is: () => c, maybeSingle: async () => ({ data: null, error: null }), then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) };
        return c;
      }
      return {
        select: () => ({ eq: () => ({ gte: async () => ({ count: 0, error: null }) }) }),
        insert: (row: Record<string, unknown>) => {
          inserted = row;
          return { select: () => ({ single: async () => ({ data: { id: "m1" }, error: null }) }) };
        },
      };
    },
  };
}

const send = (extra: Record<string, unknown>) =>
  sendMessageCore({ supabase: client() as never, userId: AUTHOR }, { conversationId: CONV, body: "Hej", locale: "lt", ...extra });

beforeEach(() => {
  inserted = null;
});

describe("the language a message is stored with", () => {
  it("an assistant door with no declared language stores NULL, never the request locale", async () => {
    await send({ languageFallback: "unknown" });
    expect(inserted?.original_language).toBeNull();
  });

  it("a declared language wins on every door", async () => {
    await send({ originalLanguage: "sv", languageFallback: "unknown" });
    expect(inserted?.original_language).toBe("sv");
    await send({ originalLanguage: "SV" });
    expect(inserted?.original_language).toBe("sv");
  });

  it("an unsupported declared code is not stored; the door's fallback applies", async () => {
    await send({ originalLanguage: "xx", languageFallback: "unknown" });
    expect(inserted?.original_language).toBeNull();
  });

  it("the web composer keeps its UI-locale rule (it shows the author what it stamps)", async () => {
    await send({});
    expect(inserted?.original_language).toBe("lt");
  });

  it("message.send_confirm passes the declared language and the unknown fallback", () => {
    const src = readFileSync(join(__dirname, "..", "capabilities", "messaging-capabilities.ts"), "utf8");
    const call = src.slice(src.indexOf("await sendMessageCore(commCaller"), src.indexOf("if (!sent.ok)"));
    expect(call).toContain("originalLanguage: parsed.language ?? null");
    expect(call).toContain('languageFallback: "unknown"');
    // The language is part of what the person confirmed.
    expect(src).toMatch(/language: i\.language \?\? null/);
  });
});
