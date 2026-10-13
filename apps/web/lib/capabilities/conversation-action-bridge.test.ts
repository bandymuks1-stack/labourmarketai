import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

// THE ONE DISPATCHER the web chat uses. The bridge must call exactly these.
const prepare = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, token: "tok-0123456789", stateFingerprint: "fp" }));
const dispatch = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, data: { id: "row-1" } }));
vi.mock("@/lib/conversation/dispatch", () => ({
  prepareConfirmationAction: (...a: unknown[]) => prepare(...a),
  dispatchWorkerAction: (...a: unknown[]) => dispatch(...a),
}));
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: async () => ({
    workspaces: [{ id: "org-1", kind: "organization", name: "Org One" }],
    activeWorkspaceId: "org-1",
    pointerAvailable: true,
  }),
}));

import { runAsBearerCaller } from "@/lib/api/bearer-caller-scope";
import { CONVERSATION_ACTIONS } from "@/lib/conversation/action-registry";
import { WORKER_ACTION_SCHEMAS } from "@/lib/conversation/worker-schemas";
import { COMPANY_ACTION_SCHEMAS } from "@/lib/conversation/company-schemas";
import { ENGAGEMENT_ACTION_SCHEMAS } from "@/lib/engagements/engagement-schemas";
import { toolDefsOf } from "@/lib/mcp/toolset";

import type { CapabilityCaller } from "./contract";
import {
  ALREADY_CAPABILITIES,
  CONVERSATION_ACTION_BRIDGE_CAPABILITIES,
  OVERWRITES,
  SENDS_EMAIL,
} from "./conversation-action-bridge";
import { exposedCapabilities, listCapabilities, runCapability } from "./registry";
import { RECEIPT_CAPABILITY_RX, receiptCapabilityId } from "./external-receipt";
import { SINGLE_USE_FINGERPRINTED } from "./conversation-action-bridge";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const supabase = {} as CapabilityCaller["supabase"];
const bearer: CapabilityCaller = { userId: "user-1", transport: "bearer", supabase, locale: "en", actorKind: "agent" };
const inScope = <T>(fn: () => Promise<T>) =>
  runAsBearerCaller({ userId: "user-1", transport: "bearer", supabase }, fn);

const EXECUTABLE = new Set([
  ...Object.keys(WORKER_ACTION_SCHEMAS),
  ...Object.keys(COMPANY_ACTION_SCHEMAS),
  ...Object.keys(ENGAGEMENT_ACTION_SCHEMAS),
]);

beforeEach(() => {
  prepare.mockClear();
  dispatch.mockClear();
});

describe("conversation-action bridge — coverage", () => {
  it("every executable web chat action is reachable: bridged, or owned by a named capability", () => {
    const bridged = new Set(CONVERSATION_ACTION_BRIDGE_CAPABILITIES.map((c) => c.conversationActionId));
    for (const id of EXECUTABLE) {
      expect(bridged.has(id) || id in ALREADY_CAPABILITIES, id).toBe(true);
    }
  });

  it("an action owned by a capability is NOT bridged again, and its owner really exists and is exposed", () => {
    const exposed = new Set(exposedCapabilities().map((c) => c.id));
    for (const [actionId, owners] of Object.entries(ALREADY_CAPABILITIES)) {
      expect(EXECUTABLE.has(actionId), `${actionId} is not an executable chat action`).toBe(true);
      expect(CONVERSATION_ACTION_BRIDGE_CAPABILITIES.some((c) => c.conversationActionId === actionId), actionId).toBe(false);
      for (const owner of owners) expect(exposed.has(owner), `${actionId} -> ${owner}`).toBe(true);
    }
  });

  it("the reviewed behaviour lists name only bridged actions", () => {
    const bridged = new Set(CONVERSATION_ACTION_BRIDGE_CAPABILITIES.map((c) => c.conversationActionId));
    for (const id of [...OVERWRITES, ...SENDS_EMAIL]) expect(bridged.has(id), id).toBe(true);
  });

  it("no capability id collides with another, and every tool schema converts to JSON Schema", () => {
    const ids = listCapabilities().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const defs = toolDefsOf(CONVERSATION_ACTION_BRIDGE_CAPABILITIES);
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(d.inputSchema.type, `${d.name} ${JSON.stringify(d.inputSchema).slice(0, 300)}`).toBe("object");
      expect(d.description.length).toBeGreaterThan(40);
    }
  });

  it("the tier decides the shape: reversible = one tool, important/strong = prepare + confirm", () => {
    for (const a of CONVERSATION_ACTIONS) {
      const tools = CONVERSATION_ACTION_BRIDGE_CAPABILITIES.filter((c) => c.conversationActionId === a.id);
      if (tools.length === 0) continue;
      if (a.confirmation === "reversible_write") {
        expect(tools.map((t) => [t.id, t.kind])).toEqual([[a.id, "execute"]]);
      } else {
        expect(tools.map((t) => [t.id, t.kind])).toEqual([
          [`${a.id}.prepare`, "draft"],
          [`${a.id}.confirm`, "confirm"],
        ]);
        expect(tools[0].annotations.readOnlyHint).toBe(true);
      }
    }
  });
});

describe("conversation-action bridge — audit and confirmation honesty", () => {
  it("every exposed write gets an audit receipt the RPC accepts (hyphens folded), and no two collide", () => {
    const writes = exposedCapabilities().filter((c) => c.kind === "confirm" || c.kind === "execute");
    const seen = new Map<string, string>();
    for (const c of writes) {
      const id = receiptCapabilityId(c.id);
      expect(id, c.id).toMatch(RECEIPT_CAPABILITY_RX);
      expect(id.length, c.id).toBeLessThanOrEqual(80);
      expect(seen.get(id), `${c.id} collides with ${seen.get(id)}`).toBeUndefined();
      seen.set(id, c.id);
    }
  });

  it("only actions the dispatcher really fingerprints claim a single-use confirm", () => {
    const dispatch = readFileSync(join(__dirname, "..", "conversation", "dispatch.ts"), "utf8");
    for (const id of SINGLE_USE_FINGERPRINTED) {
      expect(dispatch, id).toContain(`actionId === "${id}"`);
    }
    for (const c of CONVERSATION_ACTION_BRIDGE_CAPABILITIES.filter((x) => x.kind === "confirm")) {
      expect(c.annotations.idempotentHint, c.id).toBe(SINGLE_USE_FINGERPRINTED.has(c.conversationActionId!));
    }
  });
});

describe("conversation-action bridge — execution goes through the ONE dispatcher", () => {
  it("a reversible action dispatches once, as the web chat does, with no token", async () => {
    const r = await inScope(() =>
      runCapability("company.create-task", bearer, { projectId: "11111111-1111-4111-8111-111111111111", title: "Pour slab" }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBe("company.create-task");
    expect(dispatch.mock.calls[0][2]).toEqual({ locale: "en" });
    expect(prepare).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, data: { action: "company.create-task", id: "row-1" } });
  });

  it("prepare writes nothing: it asks the dispatcher for a token and echoes the input to confirm", async () => {
    const input = { engagementId: "22222222-2222-4222-8222-222222222222" };
    const r = await inScope(() => runCapability("engagement.end.prepare", bearer, input));
    expect(prepare).toHaveBeenCalledWith("engagement.end", input);
    expect(dispatch).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      ok: true,
      data: {
        action: "engagement.end",
        tier: "strong_irreversible",
        input,
        confirmationToken: "tok-0123456789",
        confirmWith: "engagement_end_confirm",
        actingIn: { id: "org-1", name: "Org One" },
      },
    });
  });

  it("confirm hands the token to the dispatcher, which verifies it", async () => {
    const input = { engagementId: "22222222-2222-4222-8222-222222222222" };
    await inScope(() => runCapability("engagement.end.confirm", bearer, { input, confirmationToken: "tok-0123456789" }));
    expect(dispatch).toHaveBeenCalledWith("engagement.end", input, { locale: "en", confirmationToken: "tok-0123456789" });
  });

  it("a dispatcher refusal is passed through with a plain message, never turned into success", async () => {
    dispatch.mockResolvedValueOnce({ ok: false, code: "stale_confirmation" } as never);
    const r = await inScope(() =>
      runCapability("engagement.end.confirm", bearer, {
        input: { engagementId: "22222222-2222-4222-8222-222222222222" },
        confirmationToken: "tok-0123456789",
      }),
    );
    expect(r).toMatchObject({ ok: false, code: "stale_confirmation" });
    expect((r as { message?: string }).message).toMatch(/Prepare again/);
  });

  it("a bearer caller outside the scope is refused before anything runs", async () => {
    const r = await runCapability("company.create-task", bearer, {
      projectId: "11111111-1111-4111-8111-111111111111",
      title: "Pour slab",
    });
    expect(r).toMatchObject({ ok: false, code: "not_supported" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("a scope for ANOTHER user is refused (the scope must be this caller)", async () => {
    const r = await runAsBearerCaller({ userId: "someone-else", transport: "bearer", supabase }, () =>
      runCapability("engagement.end.prepare", bearer, { engagementId: "22222222-2222-4222-8222-222222222222" }),
    );
    expect(r).toMatchObject({ ok: false, code: "not_supported" });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("input outside the web action's own schema never reaches the dispatcher", async () => {
    const r = await inScope(() => runCapability("engagement.end.prepare", bearer, { engagementId: "x", side: "company" }));
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(prepare).not.toHaveBeenCalled();
  });
});
