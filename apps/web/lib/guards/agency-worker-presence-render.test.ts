import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Rendered-DOM proof: a linked agency worker is a PersonPresence — the
 * permitted display name first, the invitation e-mail beneath it; a worker
 * with no display name yet is still a presence, by e-mail, never "—" beside
 * an empty tile. The agency actions are mocked at the module boundary.
 */
vi.mock("@/lib/agency/actions", () => ({
  inviteAgencyWorkerAction: async () => ({}),
  assignAgencyWorkerRoleAction: async () => ({}),
  provisionAgencyWorkerEngagementContextAction: async () => ({}),
  setAgencyWorkerJournalReviewAction: async () => ({}),
}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: () => [{ status: "idle" }, () => {}, false] };
});

const { AgencyWorkersSection } = await import("@/components/app/agency-workers-section");

const labels = new Proxy({} as Record<string, never>, {
  get: (_t, k) =>
    k === "operations"
      ? { columnHeading: "Ops", notAssigned: "not assigned", reviewEnabled: "on", reviewNotEnabled: "off", roleLabels: {}, setupNote: "", nextActionLabels: {}, assign: {} }
      : String(k),
});

function render(workers: unknown[]) {
  return renderToStaticMarkup(
    createElement(AgencyWorkersSection, {
      workersResult: { kind: "ok", rows: workers as never },
      invitationsResult: { kind: "ok", rows: [] },
      labels: labels as never,
      roleCoordinationEnabled: false,
      canAssignRoles: false,
    }),
  );
}

const worker = (over: Record<string, unknown>) => ({
  workerId: "w1",
  profileId: "p1",
  status: "active",
  displayName: null,
  email: "jonas@example.test",
  createdAt: "2026-09-10T08:00:00Z",
  operationsRole: null,
  operationsTitle: null,
  journalReviewEnabled: false,
  engagementContextLinked: false,
  ...over,
});

describe("agency worker row — presence", () => {
  it("renders the permitted display name as the presence, e-mail beneath", () => {
    const html = render([worker({ displayName: "Jonas Jonaitis" })]);
    expect(html).toContain('data-testid="ww-person"');
    expect(html).toContain("Jonas Jonaitis");
    expect(html).toContain("jonas@example.test");
    expect(html).toMatch(/>J</); // the initial tile, never a fabricated face
    expect(html).not.toContain("<img");
    expect(html).toContain('data-testid="ww-place-time"');
    expect(html).toContain("2026-09-10");
  });

  it("a worker without a display name is still a presence, by e-mail", () => {
    const html = render([worker({})]);
    expect(html).toContain('data-testid="ww-person"');
    expect(html).toContain("jonas@example.test");
    expect(html).toMatch(/>J</);
  });

  it("zero workers renders the honest empty state, no presence", () => {
    const html = render([]);
    expect(html).toContain('data-testid="agency-workers-empty"');
    expect(html).not.toContain('data-testid="ww-person"');
  });
});
