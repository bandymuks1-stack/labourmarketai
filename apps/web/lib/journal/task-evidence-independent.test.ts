import { describe, expect, it } from "vitest";

import { independentOrganizationIdsByProject } from "@/lib/journal/project-attribution";
import { isLinkableForTask } from "@/lib/journal/task-evidence-model";

/**
 * The task-evidence picker for an INDEPENDENT provider: an entry journaled from
 * the provider's OWN workspace on a client's project is accepted by the database
 * (independent_journal_context_v1 + link_journal_entry_to_task_v1), so the
 * picker offers it - but only on a project the viewer is actively assigned to.
 */
const CLIENT = "client-org";
const WS = "own-workspace";
const PROJECT = "p-client";
const task = { projectId: PROJECT, organizationId: CLIENT };

describe("isLinkableForTask - independent provider", () => {
  const entry = { projectId: PROJECT, organizationId: WS };
  it("an own-workspace entry on an assigned client project is linkable", () => {
    expect(isLinkableForTask(entry, { ...task, independentOrganizationIds: [WS] })).toBe(true);
    expect(isLinkableForTask({ projectId: null, organizationId: WS }, { ...task, independentOrganizationIds: [WS] })).toBe(true);
  });
  it("the same entry on a project the viewer is NOT assigned to is not linkable", () => {
    expect(isLinkableForTask(entry, { ...task, independentOrganizationIds: [] })).toBe(false);
    expect(isLinkableForTask({ projectId: null, organizationId: WS }, task)).toBe(false);
  });
  it("another workspace (not the viewer's) stays hidden", () => {
    expect(isLinkableForTask({ projectId: null, organizationId: "someone-else" }, { ...task, independentOrganizationIds: [WS] })).toBe(false);
  });
  it("an employer-organisation mismatch is still hidden", () => {
    expect(isLinkableForTask({ projectId: null, organizationId: "employer-org" }, { ...task, independentOrganizationIds: [WS] })).toBe(false);
  });
  it("an entry of another project is still hidden whatever the context", () => {
    expect(isLinkableForTask({ projectId: "other", organizationId: WS }, { ...task, independentOrganizationIds: [WS] })).toBe(false);
  });
  it("team case unchanged", () => {
    expect(isLinkableForTask({ projectId: null, organizationId: "team-org" }, { ...task, teamOrganizationIds: ["team-org"] })).toBe(true);
    expect(isLinkableForTask({ projectId: null, organizationId: "team-org" }, task)).toBe(false);
  });
  it("personal (NULL organisation) and same-organisation cases unchanged", () => {
    expect(isLinkableForTask({ projectId: null, organizationId: null }, task)).toBe(true);
    expect(isLinkableForTask({ projectId: null, organizationId: CLIENT }, task)).toBe(true);
  });
});

describe("independentOrganizationIdsByProject", () => {
  const rows = [
    { project_id: "p1", projects: { id: "p1", title: "Client hall", organization_id: CLIENT } },
    { project_id: "p2", projects: { id: "p2", title: "Employer job", organization_id: "employer-org" } },
    { project_id: "p3", projects: { id: "p3", title: "Own", organization_id: WS } },
  ];
  it("lists the owned workspaces for a client project only", () => {
    const m = independentOrganizationIdsByProject(rows, new Set(["employer-org", WS]), [WS]);
    expect(m.get("p1")).toEqual([WS]);
    expect(m.has("p2")).toBe(false); // member of the project's organisation: employer path
    expect(m.has("p3")).toBe(false); // the workspace is the project's own organisation
  });
  it("no owned workspace, no entry", () => {
    expect(independentOrganizationIdsByProject(rows, new Set(), []).size).toBe(0);
  });
});
