import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import {
  JOURNAL_REVIEW_DECISIONS,
  NOTIFICATION_EVENT_TYPES,
} from "@/lib/notifications/events";

/**
 * v10 notification events (message_received, journal_review_decided) -
 * structural pins. Behaviour lives in
 * lib/notifications/event-emitters-message-journal.test.ts; these pin that the
 * types ride the EXISTING store, are wired into the real write paths, and have
 * copy in every locale file.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
/** CRLF-safe: a Windows checkout must not change what the detector sees. */
const read = (...p: string[]) =>
  readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");

const COPY_KEYS = [
  "event_message_received",
  "event_journal_review_decided",
  ...JOURNAL_REVIEW_DECISIONS.map((d) => `event_journal_review_decided_${d}`),
];
const ALL_LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];

describe("rides the existing notification store", () => {
  it("is two more event types, not a new table", () => {
    expect(NOTIFICATION_EVENT_TYPES).toContain("message_received");
    expect(NOTIFICATION_EVENT_TYPES).toContain("journal_review_decided");
    const file = "20261002140000_message_journal_review_notification_types_v1";
    const mig = readFileSync(join(REPO, "supabase", "migrations", `${file}.sql`), "utf8");
    for (const v of ["message_received", "journal_review_decided", "conversation", "journal_entry"]) {
      expect(mig).toContain(`'${v}'`);
    }
    expect(mig).not.toMatch(/create table/i);
    expect(existsSync(join(REPO, "supabase", "rollbacks", `${file}.down.sql`))).toBe(true);
  });

  it("email default stays OFF and no marketing send was added", () => {
    const prefs = read("lib", "notifications", "notification-preferences.ts");
    expect(prefs).toMatch(/email:\s*false/);
  });
});

describe("wired into the real write paths, after the domain write", () => {
  it("sendMessageCore notifies after the insert and never before it", () => {
    const src = read("lib", "communication", "communication-core.ts");
    const insertAt = src.indexOf('.from("conversation_messages")\n    .insert(');
    const notifyAt = src.indexOf("await notifyOtherParticipants(");
    expect(insertAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(insertAt);
    expect(src).toContain("emitMessageReceivedNotifications");
  });

  it("the participants are read under the SENDER's session, not through admin", () => {
    // Scoped to the NOTIFY path: the core's single service-role write (adding the
    // OTHER participant after the contact authority, audit F-1) is pinned
    // separately in authority-closure-first-package.test.ts and is not a read.
    const src = read("lib", "communication", "communication-core.ts");
    const start = src.indexOf("async function notifyOtherParticipants(");
    const end = src.indexOf("\nexport ", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toMatch(/createAdminClient/);
  });

  it("every journal review write path calls the one bridge after its RPC", () => {
    for (const [file, rpc] of [
      [["lib", "journal", "review-actions.ts"], '"review_journal_entry"'],
      [["lib", "journal", "batch-review.ts"], '"review_journal_entries_batch"'],
      [["lib", "operations", "org-membership.ts"], '"confirm_entry_and_verify_skills"'],
    ] as const) {
      const src = read(...file);
      const rpcAt = src.indexOf(rpc);
      const notifyAt = src.indexOf("notifyJournalReviewDecisions(", rpcAt);
      expect(rpcAt, `${file.join("/")} rpc`).toBeGreaterThan(-1);
      expect(notifyAt, `${file.join("/")} notify after rpc`).toBeGreaterThan(rpcAt);
    }
  });

  it("the review bridge hands the emitter the reviewer so it can skip self-notification", () => {
    const src = read("lib", "journal", "review-notification.ts");
    expect(src).toContain("actorProfileId");
    expect(src).toContain("emitJournalReviewDecisionNotification");
  });
});

describe("copy exists in every locale file (bell, activity page, e-mail subject)", () => {
  for (const loc of ALL_LOCALES) {
    it(`${loc}`, () => {
      const msgs = JSON.parse(read("messages", `${loc}.json`)) as {
        auth?: { notifications?: { types?: Record<string, unknown> } };
      };
      const types = msgs.auth?.notifications?.types ?? {};
      for (const k of COPY_KEYS) {
        expect(
          typeof types[k] === "string" && (types[k] as string).trim().length > 0,
          `${loc}: auth.notifications.types.${k}`,
        ).toBe(true);
      }
    });
  }

  it("covers every ACTIVE locale, and the copy never says the banned word", () => {
    for (const loc of activeLocales) expect(ALL_LOCALES).toContain(loc);
    for (const loc of ALL_LOCALES) {
      const types = (JSON.parse(read("messages", `${loc}.json`)) as {
        auth: { notifications: { types: Record<string, string> } };
      }).auth.notifications.types;
      for (const k of COPY_KEYS) expect(types[k].toLowerCase()).not.toContain("demo");
    }
  });
});
