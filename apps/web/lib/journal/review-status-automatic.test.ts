import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveReviewTimeline, rowIsAutomatic } from "./review-status";

/**
 * W6 slice 1 — an automatic confirmation is never visually identical to a
 * hand confirmation. The policy RPC writes action:'auto_confirm' +
 * decision:'approved'; the timeline must carry the marker through, and the
 * render surfaces must consume it.
 */

const manual = {
  confirmer_role: "manager",
  created_at: "2026-08-01T10:00:00Z",
  confirmation_scope: { action: "confirm", decision: "approved" },
};
const automatic = {
  confirmer_role: "manager",
  created_at: "2026-08-02T10:00:00Z",
  confirmation_scope: {
    action: "auto_confirm",
    decision: "approved",
    policy_id: "p1",
  },
};

describe("auto-confirm marker", () => {
  it("rowIsAutomatic reads ONLY the exact marker — anything else is manual", () => {
    expect(rowIsAutomatic(manual as never)).toBe(false);
    expect(rowIsAutomatic(automatic as never)).toBe(true);
    expect(rowIsAutomatic({ confirmation_scope: null } as never)).toBe(false);
    expect(
      rowIsAutomatic({ confirmation_scope: { action: "AUTO_CONFIRM" } } as never),
    ).toBe(false);
  });

  it("the timeline distinguishes a manual and an automatic approval", () => {
    const events = deriveReviewTimeline([manual, automatic] as never);
    expect(events).toHaveLength(2);
    expect(events[0].automatic).toBe(false);
    expect(events[1].automatic).toBe(true);
    // Both are the same DECISION — automatic is a qualifier, never a tier.
    expect(events[0].result).toBe(events[1].result);
  });

  it("all three render surfaces consume the marker", () => {
    const WEB = join(__dirname, "..", "..");
    const read = (p: string) => readFileSync(join(WEB, p), "utf8");
    expect(read("components/app/evidence-decision-timeline.tsx")).toMatch(
      /timeline-auto-confirm-qualifier/,
    );
    expect(read("app/[locale]/cv/page.tsx")).toMatch(/cv-proof-auto-confirm-qualifier/);
    expect(read("app/[locale]/dashboard/inbox/page.tsx")).toMatch(/inbox-auto-confirm-note/);
    // The qualifier text comes from the ONE canonical namespace.
    for (const p of [
      "components/app/evidence-decision-timeline.tsx",
      "app/[locale]/cv/page.tsx",
      "app/[locale]/dashboard/inbox/page.tsx",
    ]) {
      expect(read(p), p).toMatch(/autoConfirmQualifier/);
    }
  });
});
