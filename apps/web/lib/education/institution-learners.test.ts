import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { classifyLearnerInvitation, countByStatus } from "./institution-learners";

const now = new Date("2026-09-03T12:00:00Z");

describe("institution learners — participation classification (pure)", () => {
  it("accepted wins, then declined / revoked, then expiry by date, then pending", () => {
    expect(classifyLearnerInvitation({ status: "accepted", expiresAt: null, acceptedAt: null }, now)).toBe("accepted");
    expect(classifyLearnerInvitation({ status: "pending", expiresAt: null, acceptedAt: "2026-09-01T00:00:00Z" }, now)).toBe("accepted");
    expect(classifyLearnerInvitation({ status: "declined", expiresAt: null, acceptedAt: null }, now)).toBe("declined");
    expect(classifyLearnerInvitation({ status: "revoked", expiresAt: null, acceptedAt: null }, now)).toBe("revoked");
    expect(classifyLearnerInvitation({ status: "pending", expiresAt: "2026-09-02T00:00:00Z", acceptedAt: null }, now)).toBe("expired");
    expect(classifyLearnerInvitation({ status: "expired", expiresAt: null, acceptedAt: null }, now)).toBe("expired");
    expect(classifyLearnerInvitation({ status: "pending", expiresAt: "2026-09-10T00:00:00Z", acceptedAt: null }, now)).toBe("pending");
    expect(classifyLearnerInvitation({ status: "sent", expiresAt: null, acceptedAt: null }, now)).toBe("pending");
  });

  it("counts every state, including zeros", () => {
    const counts = countByStatus([
      { id: "a", invitedName: null, invitedEmail: "a@x", status: "accepted", createdAt: "", acceptedAt: null },
      { id: "b", invitedName: null, invitedEmail: "b@x", status: "pending", createdAt: "", acceptedAt: null },
      { id: "c", invitedName: null, invitedEmail: "c@x", status: "pending", createdAt: "", acceptedAt: null },
    ]);
    expect(counts).toEqual({ accepted: 1, pending: 2, declined: 0, expired: 0, revoked: 0 });
  });
});

describe("institution learners — privacy boundary (least-privilege ruling 2026-08-27)", () => {
  const src = readFileSync(resolve(__dirname, "institution-learners.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("reads only the institution's own student invitations and a COUNT of student contexts", () => {
    expect(code).toMatch(/\.from\("invitations"\)/);
    expect(code).toMatch(/\.eq\("relationship_slug", "student"\)/);
    expect(code).toMatch(/\.from\("engagement_contexts"\)[\s\S]*?\{ count: "exact", head: true \}/);
  });

  it("never touches learner-owned data", () => {
    for (const forbidden of ["workers", "journal_entries", "worker_skills", "profiles", "worker_education", "cv_"]) {
      expect(code, `must not read ${forbidden}`).not.toMatch(new RegExp(`from\\("${forbidden}`));
    }
    expect(code).not.toMatch(/service_role|SERVICE_ROLE/);
  });

  it("degrades honestly: any read error is `unavailable`, never an empty list", () => {
    expect(code).toMatch(/if \(inv\.error \|\| ctx\.error\) return \{ status: "unavailable" \}/);
  });
});
