import { describe, expect, it } from "vitest";

import {
  ASK_PARAM,
  CONVERSATION_PARAMS,
  TODAY_STATIONS,
  WORKER_TABS,
  activeWorkerTab,
  dashboardRootSurface,
  hasConversationParams,
  isWorkerPersonalSpace,
} from "./today-route";

/**
 * The ONE decision the page and the chrome share: what `/dashboard` is for
 * this person, at this URL. Pinned so the server render and the client shell
 * can never disagree — and so the legacy composition (the chat as every
 * worker's root) is provably retired for the worker in their personal space.
 */

describe("who opens ŠIANDIEN", () => {
  it("a worker in the personal space, with no conversation parameter", () => {
    expect(
      dashboardRootSurface({ activeRole: "worker", activeWorkspaceId: "personal", query: {} }),
    ).toBe("today");
    // The layout may hand the client `null` for the personal space.
    expect(
      dashboardRootSurface({ activeRole: "worker", activeWorkspaceId: null, query: new URLSearchParams() }),
    ).toBe("today");
  });

  it("NEGATIVE CONTROL — the legacy expectation (chat is every worker's root) fails now", () => {
    // Before this slice `/dashboard` rendered the conversation for a worker
    // unconditionally. The retired expectation would have been:
    //   dashboardRootSurface(worker, personal, {}) === "conversation"
    expect(
      dashboardRootSurface({ activeRole: "worker", activeWorkspaceId: "personal", query: {} }),
    ).not.toBe("conversation");
  });

  it("company / agency / customer / admin keep the conversation composition", () => {
    for (const role of ["company", "agency", "customer", "admin", null, undefined]) {
      expect(
        dashboardRootSurface({ activeRole: role, activeWorkspaceId: "personal", query: {} }),
        String(role),
      ).toBe("conversation");
    }
  });

  it("a worker acting INSIDE an organization is not in their personal 'now'", () => {
    expect(isWorkerPersonalSpace({ activeRole: "worker", activeWorkspaceId: "org-1" })).toBe(false);
    expect(
      dashboardRootSurface({ activeRole: "worker", activeWorkspaceId: "org-1", query: {} }),
    ).toBe("conversation");
  });
});

describe("the conversation stays on demand — every existing deep link still opens it", () => {
  it("?ask=1 (the PAKLAUSK tab) opens the conversation", () => {
    expect(
      dashboardRootSurface({
        activeRole: "worker",
        activeWorkspaceId: "personal",
        query: new URLSearchParams(`${ASK_PARAM}=1`),
      }),
    ).toBe("conversation");
  });

  it.each(CONVERSATION_PARAMS)("?%s= is a conversation parameter (server record form)", (name) => {
    expect(hasConversationParams({ [name]: "x" })).toBe(true);
    expect(
      dashboardRootSurface({ activeRole: "worker", activeWorkspaceId: "personal", query: { [name]: "x" } }),
    ).toBe("conversation");
  });

  it("the chat's own deep links are all listed (wagon4 pins ?result=player-card)", () => {
    for (const name of ["result", "say", "intent", "geo", "interaction", "project", "demand"]) {
      expect(CONVERSATION_PARAMS).toContain(name);
    }
  });

  it("an unrelated parameter does not send a worker to the conversation", () => {
    expect(hasConversationParams({ utm_source: "x" })).toBe(false);
    expect(hasConversationParams(new URLSearchParams("utm_source=x"))).toBe(false);
    expect(hasConversationParams(null)).toBe(false);
  });
});

describe("the three worker tabs and the stations", () => {
  it("ŠIANDIEN · PASAULIS · PAKLAUSK, on existing routes", () => {
    expect(WORKER_TABS.map((t) => t.id)).toEqual(["today", "world", "ask"]);
    expect(WORKER_TABS.map((t) => t.href)).toEqual([
      "/dashboard",
      "/dashboard/opportunities",
      `/dashboard?${ASK_PARAM}=1`,
    ]);
  });

  it("the active tab is told apart by the conversation parameters on the shared pathname", () => {
    expect(activeWorkerTab("/dashboard", new URLSearchParams())).toBe("today");
    expect(activeWorkerTab("/dashboard", new URLSearchParams("ask=1"))).toBe("ask");
    expect(activeWorkerTab("/dashboard", new URLSearchParams("result=player-card"))).toBe("ask");
    expect(activeWorkerTab("/dashboard/opportunities", null)).toBe("world");
    expect(activeWorkerTab("/dashboard/opportunities/abc", null)).toBe("world");
    expect(activeWorkerTab("/dashboard/journal", null)).toBeNull();
  });

  it("every station is one of the IA's named destinations", () => {
    expect(TODAY_STATIONS.map((s) => [s.id, s.href])).toEqual([
      ["journal", "/dashboard/journal"],
      ["numbers", "/dashboard/journal/numbers"],
      ["profile", "/dashboard/profile"],
      ["cv", "/cv"],
      ["gallery", "/dashboard/gallery"],
    ]);
  });
});
