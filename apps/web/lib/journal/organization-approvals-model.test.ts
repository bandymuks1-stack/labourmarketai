import { describe, expect, it } from "vitest";

import { organizationApprovalsView } from "./organization-approvals-model";

const employees = { total: 2, reviewOff: 0 };

describe("organizationApprovalsView", () => {
  it("a failed queue read is never an empty queue", () => {
    expect(organizationApprovalsView({ pending: null, employees, ownUnconfirmed: 0 }).state).toBe("unreadable");
  });

  it("waiting and empty follow the count", () => {
    expect(organizationApprovalsView({ pending: 3, employees, ownUnconfirmed: 0 }).state).toBe("waiting");
    expect(organizationApprovalsView({ pending: 0, employees, ownUnconfirmed: 0 }).state).toBe("empty");
  });

  it("names the employees whose hours cannot reach the queue, even while others wait", () => {
    const off = { total: 3, reviewOff: 1 };
    expect(organizationApprovalsView({ pending: 2, employees: off, ownUnconfirmed: 0 }).reviewOff).toEqual(off);
    expect(organizationApprovalsView({ pending: 0, employees, ownUnconfirmed: 0 }).reviewOff).toBeNull();
  });

  it("says nobody works here only when the read answered", () => {
    expect(organizationApprovalsView({ pending: 0, employees: { total: 0, reviewOff: 0 }, ownUnconfirmed: 0 }).noEmployees).toBe(true);
    const failed = organizationApprovalsView({ pending: 0, employees: null, ownUnconfirmed: null });
    expect(failed.noEmployees).toBe(false);
    expect(failed.reviewOff).toBeNull();
    expect(failed.ownUnconfirmed).toBe(0);
  });

  it("keeps the reader's own entries apart from the queue", () => {
    const view = organizationApprovalsView({ pending: 0, employees, ownUnconfirmed: 1 });
    expect(view.state).toBe("empty");
    expect(view.ownUnconfirmed).toBe(1);
  });
});
