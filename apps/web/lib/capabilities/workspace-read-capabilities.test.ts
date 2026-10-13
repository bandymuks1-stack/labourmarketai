import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

const loadAgenda = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "summary", text: "Mon: Site A", conflictCount: 1, suggestions: [] }));
vi.mock("@/lib/conversation/agenda-summary", () => ({ loadContextBrief: (...a: unknown[]) => loadAgenda(...a) }));

const loadCapacity = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "no-company" }));
vi.mock("@/lib/conversation/capacity", () => ({ loadWhoIsAvailableForChat: (...a: unknown[]) => loadCapacity(...a) }));

const readConflicts = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ status: "unknown" }));
vi.mock("@/lib/planning/roster-conflicts", () => ({ readRosterConflicts: (...a: unknown[]) => readConflicts(...a) }));

import { runAsBearerCaller } from "@/lib/api/bearer-caller-scope";

import type { CapabilityCaller } from "./contract";
import { runCapability } from "./registry";
import { WORKSPACE_READ_CAPABILITIES } from "./workspace-read-capabilities";

const supabase = {} as CapabilityCaller["supabase"];
const bearer: CapabilityCaller = { userId: "u-1", transport: "bearer", supabase, locale: "lt", actorKind: "agent" };
const inScope = <T>(fn: () => Promise<T>) => runAsBearerCaller({ userId: "u-1", transport: "bearer", supabase }, fn);

beforeEach(() => {
  loadAgenda.mockClear();
  loadCapacity.mockClear();
  readConflicts.mockClear();
});

describe("workspace reads", () => {
  it("every one is an honest read: kind read, read-only, never destructive", () => {
    for (const c of WORKSPACE_READ_CAPABILITIES) {
      expect(c.kind, c.id).toBe("read");
      expect(c.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });

  it("the agenda is the web chat's own loader, in the caller's locale", async () => {
    const r = await inScope(() => runCapability("calendar.agenda.get", bearer, {}));
    expect(loadAgenda).toHaveBeenCalledWith("lt");
    expect(r).toMatchObject({ ok: true, data: { kind: "summary", conflictCount: 1 } });
  });

  it("a missing organization context is named, with what to do — never an empty answer", async () => {
    const r = await inScope(() => runCapability("capacity.available.get", bearer, { day: "2026-10-20" }));
    expect(loadCapacity).toHaveBeenCalledWith(undefined, "2026-10-20");
    expect(r).toMatchObject({ ok: false, code: "no_organization_context" });
    expect((r as { message: string }).message).toMatch(/context_switch/);
  });

  it("an unreadable conflict source is 'unavailable', never 'no conflicts' (SEP-7)", async () => {
    const r = await inScope(() => runCapability("calendar.conflicts.get", bearer, {}));
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("conflicts name the person and the colliding commitments", async () => {
    readConflicts.mockResolvedValueOnce({
      status: "ok",
      view: {
        status: "ok",
        withoutCommitment: 0,
        rows: [
          {
            workerId: "w-1",
            workerName: "Ona",
            overlaps: 1,
            undatedProjects: [],
            commitments: [
              { kind: "project", sourceId: "p1", label: "Site A", startDate: "2026-10-14", endDate: "2026-10-20", conflict: true },
              { kind: "booking", sourceId: "b1", label: "Site B", startDate: "2026-10-18", endDate: "2026-10-25", conflict: true },
              { kind: "project", sourceId: "p2", label: "Site C", startDate: "2026-11-01", endDate: null, conflict: false },
            ],
          },
          { workerId: "w-2", workerName: "Jonas", overlaps: 0, undatedProjects: [], commitments: [] },
        ],
      },
      timeline: { from: "2026-10-12", to: "2026-11-08", days: 28, ticks: [], todayPct: 0, people: [] },
    });
    const r = await inScope(() => runCapability("calendar.conflicts.get", bearer, { days: 28 }));
    expect(readConflicts).toHaveBeenCalledWith(28);
    expect(r).toMatchObject({
      ok: true,
      data: {
        peopleWithConflicts: 1,
        people: [{ workerId: "w-1", name: "Ona", collisions: [{ label: "Site A" }, { label: "Site B" }] }],
      },
    });
  });

  it("a bearer caller outside the scope is refused before any loader runs", async () => {
    const r = await runCapability("calendar.agenda.get", bearer, {});
    expect(r).toMatchObject({ ok: false, code: "not_supported" });
    expect(loadAgenda).not.toHaveBeenCalled();
  });

  it("input outside the schema never reaches a loader", async () => {
    const r = await inScope(() => runCapability("calendar.conflicts.get", bearer, { days: 9999 }));
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(readConflicts).not.toHaveBeenCalled();
  });
});
