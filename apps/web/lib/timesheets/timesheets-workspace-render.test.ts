import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeWorkspaceId: "org-b",
  options: [
    { organizationId: "org-a", name: "Organization A", canGovern: false },
    { organizationId: "org-b", name: "Organization B", canGovern: false },
  ],
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/i18n/navigation", () => ({ Link: "a" }));
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: async () => ({ activeWorkspaceId: state.activeWorkspaceId }),
}));
vi.mock("@/lib/time/viewer-day", () => ({
  viewerWorkToday: async () => ({ todayIso: "2026-11-27" }),
}));
vi.mock("@/lib/timesheets/timesheets", () => ({
  getTimesheetsOverview: async () => ({
    status: "ok", mine: [], org: [], workerNames: new Map(), workflows: new Map(),
    templates: new Map(state.options.map(o => [o.organizationId, { published: true }])),
    orgOptions: state.options, error: null,
  }),
}));
vi.mock("@/lib/timesheets/timesheets-actions", () => ({
  createTimesheetAction: vi.fn(), installTimesheetApprovalPackAction: vi.fn(),
  refreshTimesheetAction: vi.fn(), reopenTimesheetAction: vi.fn(),
  submitTimesheetAction: vi.fn(), syncTimesheetDecisionAction: vi.fn(),
}));

import { TimesheetsSection } from "@/app/[locale]/dashboard/planning/timesheets-section";

async function organizationOptions() {
  const html = renderToStaticMarkup(await TimesheetsSection({ locale: "en", notice: null }));
  const select = html.match(/<select[^>]*id="timesheet-org"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
  const options = select.match(/<option[^>]*>/g) ?? [];
  return {
    values: options.map(tag => tag.match(/value="([^"]*)"/)?.[1]),
    selected: options.find(tag => tag.includes('selected=""'))?.match(/value="([^"]*)"/)?.[1],
  };
}

beforeEach(() => { state.activeWorkspaceId = "org-b"; });

describe("the timesheet form's organization", () => {
  it("starts in the displayed organization even when it is not first, preserving both choices", async () => {
    expect(await organizationOptions()).toEqual({ values: ["org-a", "org-b"], selected: "org-b" });
  });

  it("follows a subsequent workspace render", async () => {
    expect((await organizationOptions()).selected).toBe("org-b");
    state.activeWorkspaceId = "org-a";
    expect((await organizationOptions()).selected).toBe("org-a");
  });

  it.each(["personal", "org-not-eligible"])("keeps the existing eligible fallback for %s without adding an organization", async (workspaceId) => {
    state.activeWorkspaceId = workspaceId;
    expect(await organizationOptions()).toEqual({ values: ["org-a", "org-b"], selected: "org-a" });
  });
});
