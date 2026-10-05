import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./unread", () => ({ getUnreadConversationIds: vi.fn(), getUnreadConversationIdsResult: vi.fn() }));

import { conversationBelongsToOrganization } from "./organization-scope";

const people = new Set(["worker-1", "manager-2"]);
const demands = new Set(["demand-1"]);
const base = { viewerId: "me", participantProfileIds: ["me", "x"], sourceType: null, sourceId: null };

describe("a conversation's organization scope is derived, never stored", () => {
  it("another participant on the organization's team scopes it", () => {
    expect(conversationBelongsToOrganization({ ...base, participantProfileIds: ["me", "worker-1"] }, people, demands)).toBe(true);
  });

  it("the viewer being on the team does not scope a private thread", () => {
    expect(conversationBelongsToOrganization({ ...base, participantProfileIds: ["me", "stranger"] }, new Set(["me"]), demands)).toBe(false);
  });

  it("a thread about the organization's demand is scoped through its source", () => {
    expect(conversationBelongsToOrganization({ ...base, sourceType: "scouting", sourceId: "demand-1" }, people, demands)).toBe(true);
    expect(conversationBelongsToOrganization({ ...base, sourceType: "demand_interest", sourceId: "demand-1" }, people, demands)).toBe(true);
  });

  it("another organization's demand, or a non-demand source, does not scope it", () => {
    expect(conversationBelongsToOrganization({ ...base, sourceType: "scouting", sourceId: "demand-9" }, people, demands)).toBe(false);
    expect(conversationBelongsToOrganization({ ...base, sourceType: "accepted_booking", sourceId: "demand-1" }, people, demands)).toBe(false);
  });

  it("an unscoped thread is not counted (default-closed)", () => {
    expect(conversationBelongsToOrganization(base, people, demands)).toBe(false);
  });
});
