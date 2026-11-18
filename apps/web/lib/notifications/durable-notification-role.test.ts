import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENT_TYPES, notificationRenderedType } from "./events";
import { durableNotificationRole } from "./spine-signals";

/**
 * The bell's cross-role CTA ("Switch to X to view") renders when a row's role
 * differs from the active role. A stored event has no role column, so the
 * role comes from `durableNotificationRole`. The defect this pins: an employer
 * working as the company was told to switch to WORKER on "a worker raised a
 * hand on your need".
 */
describe("durableNotificationRole", () => {
  it("an organization-side event never asks an organization role to switch", () => {
    for (const role of ["company", "agency", "customer"] as const) {
      expect(durableNotificationRole("event_demand_interest_expressed", role)).toBe(role);
      expect(durableNotificationRole("event_booking_accepted", role)).toBe(role);
      expect(durableNotificationRole("event_document_ack_completed", role)).toBe(role);
    }
  });

  it("an organization-side event read as a worker points at the company side", () => {
    expect(durableNotificationRole("event_demand_interest_expressed", "worker")).toBe("company");
    expect(durableNotificationRole("event_booking_declined", "worker")).toBe("company");
  });

  it("a worker-side event belongs to the worker role from any role", () => {
    for (const type of [
      "event_job_alert",
      "event_saved_search_match",
      "event_demand_interest_reviewed",
      "event_booking_proposed",
      "event_history_link_offered",
      "event_weekly_digest_journal",
      "event_journal_review_decided_approved",
    ]) {
      expect(durableNotificationRole(type, "company")).toBe("worker");
      expect(durableNotificationRole(type, "worker")).toBe("worker");
    }
  });

  it("an event that can reach either side follows the active role (no CTA)", () => {
    for (const type of ["event_message_received", "event_invitation_accepted", "event_workflow_step_pending"]) {
      expect(durableNotificationRole(type, "company")).toBe("company");
      expect(durableNotificationRole(type, "agency")).toBe("agency");
      expect(durableNotificationRole(type, "worker")).toBe("worker");
    }
    expect(durableNotificationRole("event_unknown_future_type", null)).toBe("worker");
  });

  it("every rendered event type resolves to a live role", () => {
    for (const t of NOTIFICATION_EVENT_TYPES) {
      const rendered = notificationRenderedType(t);
      expect(["worker", "company", "agency", "customer"]).toContain(
        durableNotificationRole(rendered, "company"),
      );
    }
  });
});
