import { describe, expect, it } from "vitest";

import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { renderNotificationEmail } from "./notification-email";

/**
 * Notification email renderer — the load-bearing claims:
 *   1. the subject is the SAME localized copy the bell renders
 *      (auth.notifications.types.event_*), never a raw enum;
 *   2. the deep link is ABSOLUTE on the canonical origin and points at the
 *      entity's canonical surface (the bell's href map);
 *   3. unknown entity types fall back to the activity centre — a link to
 *      nowhere never ships;
 *   4. the body always carries the settings link (consent hygiene: every
 *      notification email says where to stop them).
 */

describe("renderNotificationEmail", () => {
  it("renders the bell's own copy with an absolute canonical deep link (en)", async () => {
    const rendered = await renderNotificationEmail({
      eventType: "absence_approved",
      entityType: "worker_absence",
      locale: "en",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("Your absence was approved");
    expect(rendered!.deepLink).toBe(
      `${CANONICAL_ORIGIN}/en/dashboard/absences`,
    );
    expect(rendered!.text).toContain(rendered!.deepLink);
    // Consent hygiene: the settings surface is always referenced.
    expect(rendered!.text).toContain(
      `${CANONICAL_ORIGIN}/en/dashboard/account`,
    );
  });

  it("defaults to the platform default locale when none (or an inactive one) is given", async () => {
    const rendered = await renderNotificationEmail({
      eventType: "booking_proposed",
      entityType: "booking_request",
    });
    expect(rendered).not.toBeNull();
    // defaultLocale is lt — the deep link carries it.
    expect(rendered!.deepLink).toBe(
      `${CANONICAL_ORIGIN}/lt/dashboard/bookings`,
    );
    const inactive = await renderNotificationEmail({
      eventType: "booking_proposed",
      entityType: "booking_request",
      locale: "xx",
    });
    expect(inactive!.deepLink).toBe(
      `${CANONICAL_ORIGIN}/lt/dashboard/bookings`,
    );
  });

  it("an unknown event type renders the neutral generic label, never the enum", async () => {
    const rendered = await renderNotificationEmail({
      eventType: "something_new_the_catalogue_does_not_know",
      entityType: "booking_request",
      locale: "en",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("Notification");
    expect(rendered!.subject).not.toContain("something_new");
  });

  it("an unknown entity type deep-links the activity centre (never a dead link)", async () => {
    const rendered = await renderNotificationEmail({
      eventType: "weekly_digest",
      entityType: "not_a_known_entity",
      locale: "en",
    });
    expect(rendered!.deepLink).toBe(
      `${CANONICAL_ORIGIN}/en/dashboard/activity`,
    );
  });
});
