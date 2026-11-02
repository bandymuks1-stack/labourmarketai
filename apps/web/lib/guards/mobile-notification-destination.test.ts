import { describe, expect, it } from "vitest";

import { notificationEventHref, notificationRenderedType } from "@/lib/notifications/events";

import { notificationDestination } from "../../../mobile/src/notification-destination";

/**
 * Where a notification opens on the phone (apps/mobile/src/notification-destination.ts),
 * fed by the SAME href the server attaches (`notificationEventHref`): a path
 * whose screen the app has opens it natively, every other path opens on the
 * website, and nothing is invented when the event carried no path.
 */
const ID = "3f2c1a4e-9b7d-4c21-8e0f-5a6b7c8d9e01";

describe("mobile notification destination", () => {
  it("a message notification opens THE thread in the app", () => {
    const href = notificationEventHref("conversation", { conversationId: ID });
    expect(notificationDestination(href)).toEqual({
      kind: "native",
      pathname: "/(shell)/conversation",
      params: { id: ID },
    });
  });

  it("a job alert opens the job in the app", () => {
    const href = notificationEventHref("public_vacancy", { vacancyId: ID });
    expect(notificationDestination(href)).toEqual({
      kind: "native",
      pathname: "/(shell)/jobs",
      params: { id: ID },
    });
  });

  it("the journal digest opens the journal in the app", () => {
    const meta = { focus: "journal" } as const;
    expect(
      notificationDestination(notificationEventHref("weekly_digest", meta), notificationRenderedType("weekly_digest", meta)),
    ).toEqual({ kind: "native", pathname: "/(shell)/journal" });
  });

  it("a review decision opens on the website, where the reviewer's note is shown", () => {
    // Same href as the digest; the phone's journal does not show the decision
    // or the note, so every decision goes to the web journal.
    for (const decision of ["approved", "changes_requested", "rejected"] as const) {
      const meta = { decision };
      expect(
        notificationDestination(notificationEventHref("journal_entry", meta), notificationRenderedType("journal_review_decided", meta)),
      ).toEqual({ kind: "web", path: "/dashboard/journal" });
    }
  });

  it("profile notifications stay on the website, where their decisions live", () => {
    // A roster-link offer (accept / refuse) and profile completion are
    // decided on the web profile; the phone's profile only reads.
    expect(notificationDestination(notificationEventHref("organization_person"))).toEqual({
      kind: "web",
      path: "/dashboard/profile",
    });
    expect(notificationDestination(notificationEventHref("weekly_digest", { focus: "profile_completion" }))).toEqual({
      kind: "web",
      path: "/dashboard/profile",
    });
  });

  it("a surface the app does not have opens on the website", () => {
    expect(notificationDestination(notificationEventHref("booking_request"))).toEqual({
      kind: "web",
      path: "/dashboard/bookings",
    });
  });

  it("no path, or a path that is not one, goes nowhere", () => {
    expect(notificationDestination(undefined)).toEqual({ kind: "none" });
    expect(notificationDestination("https://example.com/x")).toEqual({ kind: "none" });
  });
});
