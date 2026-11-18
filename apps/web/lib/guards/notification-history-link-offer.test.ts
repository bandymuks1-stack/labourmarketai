import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
const adminCalled = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    adminCalled();
    throw new Error("admin client must not be reached for a self-offer");
  },
}));

import { NOTIFICATION_ENTITY_HREF, NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/events";
import { emitHistoryLinkOfferedNotification } from "@/lib/notifications/event-emitters";

/**
 * v11 (history_link_offered): an organization's offer to connect its recorded
 * work history to a person's account reaches that person. Production
 * 2026-10-13: the one open offer (2,736 h of the person's documented work)
 * had waited 22 days, because the only place it existed was their profile.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");
const FILE = "20261013200000_roster_link_offered_notification_type_v1";
const ALL_LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];

describe("rides the existing notification store", () => {
  it("one more event type and entity type, a strict CHECK superset with a refusing rollback", () => {
    expect(NOTIFICATION_EVENT_TYPES).toContain("history_link_offered");
    expect(NOTIFICATION_ENTITY_HREF.organization_person).toBe("/dashboard/profile");
    const mig = readFileSync(join(REPO, "supabase", "migrations", `${FILE}.sql`), "utf8");
    for (const v of ["history_link_offered", "organization_person", "journal_review_decided", "journal_entry"]) {
      expect(mig).toContain(`'${v}'`);
    }
    expect(mig).not.toMatch(/create table|grant |revoke |policy/i);
    const down = readFileSync(join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`), "utf8");
    expect(down).toMatch(/rollback refused/);
    expect(existsSync(join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`))).toBe(true);
  });

  it("every locale names the event", () => {
    for (const l of ALL_LOCALES) {
      const m = JSON.parse(read("messages", `${l}.json`));
      expect(m.auth.notifications.types.event_history_link_offered, l).toBeTruthy();
    }
  });
});

describe("wired into the offer, after the write", () => {
  it("offerRosterLinkAction notifies only after the offer succeeded", () => {
    const src = read("lib", "organization-evidence", "roster-link-actions.ts");
    const offerAt = src.indexOf("const res = await offerRosterLink(");
    const refusedAt = src.indexOf('if (res.kind !== "ok")', offerAt);
    const notifyAt = src.indexOf("await emitHistoryLinkOfferedNotification(");
    expect(offerAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(refusedAt);
  });

  it("an offer to the manager's own account tells nobody", async () => {
    const r = await emitHistoryLinkOfferedNotification({ personId: "p", profileId: "u1", actorProfileId: "u1" });
    expect(r).toEqual({ delivered: false, reason: "self_action" });
    expect(adminCalled).not.toHaveBeenCalled();
  });
});
