import { describe, expect, it } from "vitest";

import {
  TODAY_STATIONS,
  conversationOpeningContext,
  isWorkerPersonalSpace,
} from "./today-route";

/**
 * The ONE decision the root page makes: WHICH opening context the ONE
 * conversation composes for this person. Pinned so the legacy composition —
 * a separate ŠIANDIEN page beside the chat, and the chat as a `?ask=1` tab —
 * is provably retired (owner decision 0017, 2026-09-22).
 */

describe("who opens the conversation with ŠIANDIEN as its opening context", () => {
  it("a worker in the personal space", () => {
    expect(
      conversationOpeningContext({ activeRole: "worker", activeWorkspaceId: "personal" }),
    ).toBe("today");
    // The layout may hand the client `null` for the personal space.
    expect(conversationOpeningContext({ activeRole: "worker", activeWorkspaceId: null })).toBe(
      "today",
    );
  });

  it("a worker acting inside an organization opens the workspace composition", () => {
    expect(
      conversationOpeningContext({
        activeRole: "worker",
        activeWorkspaceId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("workspace");
  });

  it("every other identity opens the workspace composition", () => {
    for (const role of ["company", "agency", "customer", null, undefined]) {
      expect(conversationOpeningContext({ activeRole: role, activeWorkspaceId: "personal" })).toBe(
        "workspace",
      );
    }
  });

  it("isWorkerPersonalSpace is the same predicate", () => {
    expect(isWorkerPersonalSpace({ activeRole: "worker", activeWorkspaceId: "personal" })).toBe(true);
    expect(isWorkerPersonalSpace({ activeRole: "company", activeWorkspaceId: "personal" })).toBe(false);
  });
});

describe("NEGATIVE CONTROL — the retired root split is gone", () => {
  it("there is no `today` surface, no worker tab set and no ask parameter to export", async () => {
    const mod = (await import("./today-route")) as Record<string, unknown>;
    for (const gone of [
      "dashboardRootSurface",
      "WORKER_TABS",
      "activeWorkerTab",
      "ASK_PARAM",
      "CONVERSATION_PARAMS",
      "hasConversationParams",
    ]) {
      expect(mod[gone], gone).toBeUndefined();
    }
  });
});

describe("the stations are the contextual workspaces, existing routes only", () => {
  it("opportunities (the former PASAULIS tab) comes first, as a station", () => {
    expect(TODAY_STATIONS[0]).toEqual({ id: "world", href: "/dashboard/opportunities" });
    expect(TODAY_STATIONS.map((s) => s.href)).toEqual([
      "/dashboard/opportunities",
      "/dashboard/journal",
      "/dashboard/work-in-numbers",
      "/dashboard/profile",
      "/cv",
      "/dashboard/gallery",
    ]);
  });
});
