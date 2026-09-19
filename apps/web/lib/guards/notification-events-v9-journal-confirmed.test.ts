import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NOTIFICATION_EVENT_TYPES, notificationEventHref } from "@/lib/notifications/events";
import { activeLocales } from "@/lib/i18n/config";

/**
 * R-6 v9 (2026-09-19) — the worker is told their journal entry was confirmed.
 *
 * Pinned: the migration widens exactly one event type and one entity type
 * (nothing else rides along), the rollback restores v8 verbatim, the emitter
 * targets the WORKER only and is wired into the ONE approval action, the
 * href lands on the journal, and every active locale has the bell label.
 * The migration is RED (owner-gated) — the app is inert until it is applied.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = "20260919200000_notification_events_v9_journal_confirmed";
const read = (...p: string[]) => readFileSync(join(...p), "utf8");

describe("the migration widens exactly one type and one entity", () => {
  const up = read(REPO, "supabase", "migrations", `${MIG}.sql`);
  it("adds journal_entry_confirmed + journal_entry, keeps every v8 value, and is RED-annotated", () => {
    expect(up.startsWith("-- @human-gate-approved")).toBe(true);
    expect(up).toContain("'journal_entry_confirmed'");
    expect(up).toContain("'journal_entry'\n");
    for (const t of NOTIFICATION_EVENT_TYPES) expect(up, t).toContain(`'${t}'`);
    // Two constraint swaps, nothing else.
    expect((up.match(/drop constraint notification_events_(entity_)?type_check;/g) ?? []).length).toBe(2);
    expect((up.match(/add constraint notification_events_(entity_)?type_check check/g) ?? []).length).toBe(2);
    expect(up).not.toMatch(/create (or replace )?function|create policy|insert into|update public\./i);
  });
  it("the rollback restores v8 without the v9 values", () => {
    const downPath = join(REPO, "supabase", "rollbacks", `${MIG}.down.sql`);
    expect(existsSync(downPath)).toBe(true);
    const down = read(downPath);
    // SQL values only — the DOWN header names the v9 slug in prose.
    expect(down).not.toContain("'journal_entry_confirmed'");
    expect(down).not.toMatch(/'journal_entry'/);
    expect(down).toContain("'invitation_accepted'");
    expect(down).toContain("'invitation'");
  });
});

describe("the emitter: worker-only, pointer-only, wired into the approval", () => {
  const emitters = read(WEB, "lib", "notifications", "event-emitters.ts");
  it("reads the entry's worker with the admin client, skips the actor, writes one pointer row", () => {
    const fn = emitters.slice(emitters.indexOf("export async function emitJournalEntryConfirmedNotification"));
    const body = fn.slice(0, fn.indexOf("export async function emitAbsenceNotification"));
    expect(body).toContain('.from("journal_entries")');
    expect(body).toContain('.select("worker_id")');
    expect(body).toContain("if (!recipient || recipient === input.actorProfileId) return;");
    expect(body).toContain('eventType: "journal_entry_confirmed"');
    expect(body).toContain('entityType: "journal_entry"');
    expect(body).toContain("entityId: input.entryId");
    expect(body).toContain("metadata: {}");
    // Never a second copy of the confirmation, never content.
    expect(body).not.toMatch(/note|description|title|hours/);
  });
  it("the ONE approval action emits after a successful approval — and only for approvals", () => {
    const review = read(WEB, "lib", "journal", "review-actions.ts");
    const approved = review.slice(review.indexOf('if (decision === "approved") {'), review.indexOf("revalidatePath(`/${locale}/dashboard/inbox`);\n  revalidatePath(`/${locale}/dashboard/journal`);"));
    expect(approved).toContain("await emitJournalEntryConfirmedNotification({ entryId, actorProfileId: user.id });");
    // The emit sits INSIDE the approved branch (index of the call > branch start).
    expect(approved.indexOf("emitJournalEntryConfirmedNotification")).toBeGreaterThan(0);
  });
  it("lands on the journal, where the confirmed badge already renders", () => {
    expect(notificationEventHref("journal_entry")).toBe("/dashboard/journal");
  });
});

describe("labels", () => {
  for (const loc of activeLocales) {
    it(`${loc}: auth.notifications.types.event_journal_entry_confirmed is a non-empty string`, () => {
      const m = JSON.parse(read(WEB, "messages", `${loc}.json`)) as {
        auth: { notifications: { types: Record<string, unknown> } };
      };
      const v = m.auth.notifications.types.event_journal_entry_confirmed;
      expect(typeof v === "string" && v.trim().length > 0).toBe(true);
    });
  }
});
