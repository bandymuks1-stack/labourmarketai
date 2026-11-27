import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeWorkspaceId: "org-b",
  schedulesAvailable: true,
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

vi.mock("@/lib/timesheets/timesheet-schedule-actions", () => ({ saveTimesheetScheduleAction: vi.fn() }));
vi.mock("@/lib/timesheets/timesheet-schedules", () => ({
  getTimesheetSchedules: async () => ({ available: state.schedulesAvailable,
    schedules: [{ id:'schedule-b',organization_id:'org-b',definition_id:'template-b',frequency:'weekly',local_time:'09:15:00',time_zone:'Europe/Vilnius',weekday:2,enabled:true,next_run_at:'2026-12-01T07:15:00Z',last_outcome:null,last_run_at:null }],
    templates: [{ id:'template-a',organization_id:'org-a',name:'Approvers A' },{ id:'template-b',organization_id:'org-b',name:'Approvers B' }],
  }),
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

beforeEach(() => { state.activeWorkspaceId = "org-b"; state.schedulesAvailable = true; });

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

describe("timesheet schedule settings",()=>{
  it("keeps opt-in and recipients separate for each organization",async()=>{
    const html=renderToStaticMarkup(await TimesheetsSection({locale:"en",notice:null}));
    const forms=html.match(/<form[\s\S]*?<\/form>/g)??[];
    const a=forms.find(f=>f.includes('value="org-a"')&&f.includes('name="frequency"'))??'';
    const b=forms.find(f=>f.includes('value="org-b"')&&f.includes('name="frequency"'))??'';
    expect(a).toContain('value="template-a"');expect(a).not.toContain('value="template-b"');
    expect(a.match(/<input[^>]*name="enabled"[^>]*>/)?.[0]).not.toContain('checked');
    expect(b).toContain('value="template-b"');expect(b).not.toContain('value="template-a"');
    expect(b.match(/<input[^>]*name="enabled"[^>]*>/)?.[0]).toContain('checked');
    expect(b).toContain('value="09:15"');expect(b).toContain('value="Europe/Vilnius"');
    expect(b).toContain('<option value="weekly" selected="">');
    expect(html).toContain('/dashboard/network#approvals');
  });
  it("does not show a writable scheduling form when settings cannot be read",async()=>{
    state.schedulesAvailable=false;
    const html=renderToStaticMarkup(await TimesheetsSection({locale:"en",notice:null}));
    expect(html).not.toContain('name="frequency"');expect(html).toContain('readError');
    expect(html).toContain('data-testid="timesheet-create-form"');
  });
});
