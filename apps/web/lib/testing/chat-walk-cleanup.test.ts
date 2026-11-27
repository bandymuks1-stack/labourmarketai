import { describe, expect, it } from "vitest";

import { chatWalkCleanup } from "./chat-walk-cleanup";

const T = "c0000000-0000-4000-8000-000000000001";
const P = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const M = ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002"];
const A = ["b0000000-0000-4000-8000-000000000001"];
const N = ["d0000000-0000-4000-8000-000000000001", "d0000000-0000-4000-8000-000000000002"];
const rows = { threadId: T, subject: "QA-SYNTHETIC run1 chat removal walk", profileIds: P, messageIds: M, attachmentIds: A, notificationIds: N };

describe("chat-revocation walk cleanup plan", () => {
  it("lists every row once: table | row id | thread id | why", () => {
    const { dryRun } = chatWalkCleanup(rows);
    expect(dryRun[0]).toBe("table | row id | thread id | why it is ours");
    expect(dryRun).toHaveLength(1 + 1 + 3 + 2 + 1 + 2);
    for (const line of dryRun.slice(1)) expect(line.split(" | ")[2]).toBe(T);
  });

  it("one transaction, by id, scoped to the thread, aborting on any count mismatch", () => {
    const { sql } = chatWalkCleanup(rows);
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql).toContain("commit;");
    expect(sql).not.toMatch(/\blike\b|ilike|~/i);
    for (const table of ["notification_events", "conversation_message_attachments", "conversation_messages", "conversation_participants", "conversations"]) {
      expect(sql).toContain(`delete from public.${table} where`);
      expect(sql).toMatch(new RegExp(`raise exception '${table}: expected \\d+ rows`));
    }
    expect(sql.match(/get diagnostics n = row_count/g)).toHaveLength(5);
    expect(sql).toContain("if n <> 3 then raise exception 'conversation_participants");
    // Every delete names the thread id.
    expect(sql.match(new RegExp(T, "g"))!.length).toBeGreaterThanOrEqual(5);
    expect(sql).not.toMatch(/delete from public\.audit_logs/);
  });

  it("refuses anything that is not exactly one synthetic walk thread", () => {
    expect(() => chatWalkCleanup({ ...rows, subject: "Site A" })).toThrow(/QA-SYNTHETIC/);
    expect(() => chatWalkCleanup({ ...rows, threadId: "x' or '1'='1" })).toThrow(/uuid/);
    expect(() => chatWalkCleanup({ ...rows, messageIds: ["not-a-uuid"] })).toThrow(/uuid/);
    expect(() => chatWalkCleanup({ ...rows, profileIds: P.slice(0, 2) })).toThrow(/three/);
  });
});
