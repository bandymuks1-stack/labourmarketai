import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  deriveOwnRecentConfirmations,
  OWN_RECENT_CONFIRMATIONS_DAYS,
  OWN_RECENT_CONFIRMATIONS_LIMIT,
  windowStartIso,
  type OwnConfirmationRow,
} from "./own-recent-confirmations-model";

/**
 * Owner contract §14, the PERSON's side: after the employer confirms work by
 * sentence (#1513), the person's opening brief says so — from the canonical
 * evidence rows, never from a parallel notification truth.
 */

const row = (entry: string, scope: unknown, at: string): OwnConfirmationRow => ({
  entry_id: entry,
  confirmation_scope: scope,
  created_at: at,
  confirmer_role: "manager",
});

describe("deriveOwnRecentConfirmations — pure truth table", () => {
  it("nothing → zeros, no timestamp", () => {
    expect(deriveOwnRecentConfirmations(null)).toEqual({ approvedEntries: 0, skillsConfirmed: 0, latestAt: null });
    expect(deriveOwnRecentConfirmations([])).toEqual({ approvedEntries: 0, skillsConfirmed: 0, latestAt: null });
  });

  it("counts DISTINCT approved entries and DISTINCT confirmed skills (the RPC's confirmation_scope shape)", () => {
    const out = deriveOwnRecentConfirmations([
      row("e1", { action: "confirm", decision: "approved", skills_confirmed: ["s1", "s2"] }, "2026-09-05T06:00:00Z"),
      row("e2", { action: "confirm", decision: "approved", skills_confirmed: ["s2", "s3"] }, "2026-09-04T06:00:00Z"),
    ]);
    expect(out).toEqual({ approvedEntries: 2, skillsConfirmed: 3, latestAt: "2026-09-05T06:00:00Z" });
  });

  it("latest-wins per entry, exactly as the journal list derives a review result — a later rejection is NOT confirmed work", () => {
    const out = deriveOwnRecentConfirmations([
      row("e1", { decision: "approved", skills_confirmed: ["s1"] }, "2026-09-04T06:00:00Z"),
      row("e1", { decision: "rejected" }, "2026-09-05T06:00:00Z"),
    ]);
    expect(out.approvedEntries).toBe(0);
    expect(out.skillsConfirmed).toBe(0);
  });

  it("a legacy 0013 row (action only) still counts; a changes-request or an unreadable scope never does", () => {
    const out = deriveOwnRecentConfirmations([
      row("e1", { action: "confirm" }, "2026-09-05T06:00:00Z"),
      row("e2", { action: "request_changes" }, "2026-09-05T06:00:00Z"),
      row("e3", null, "2026-09-05T06:00:00Z"),
      row("e4", { decision: "approved", skills_confirmed: "not-a-list" }, "2026-09-05T06:00:00Z"),
    ]);
    expect(out.approvedEntries).toBe(2);
    expect(out.skillsConfirmed).toBe(0);
  });

  it("a row without an entry id contributes nothing (never a phantom entry)", () => {
    const out = deriveOwnRecentConfirmations([row("", { decision: "approved", skills_confirmed: ["s1"] }, "2026-09-05T06:00:00Z") as OwnConfirmationRow]);
    expect(out.approvedEntries).toBe(0);
  });

  it("the window is a trailing 7 days, the read is bounded", () => {
    expect(OWN_RECENT_CONFIRMATIONS_DAYS).toBe(7);
    expect(OWN_RECENT_CONFIRMATIONS_LIMIT).toBeLessThanOrEqual(50);
    expect(windowStartIso(new Date("2026-09-08T00:00:00Z"))).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("loadOwnRecentConfirmations — ONE bounded read under the caller's RLS (source pins)", () => {
  const SRC = readFileSync(join(__dirname, "own-recent-confirmations.ts"), "utf8");

  it("reads the canonical evidence table joined to the person's OWN entries, time-bounded and limited — never the person's history", () => {
    expect(SRC).toMatch(/\.from\("journal_entry_confirmations"\)/);
    expect(SRC).toMatch(/journal_entries!inner\(worker_id\)/);
    expect(SRC).toMatch(/\.eq\("journal_entries\.worker_id", workerId\)/);
    expect(SRC).toMatch(/\.gte\("created_at", windowStartIso\(now\)\)/);
    expect(SRC).toMatch(/\.limit\(OWN_RECENT_CONFIRMATIONS_LIMIT\)/);
    // The old card helper loaded EVERY entry id first, then an unbounded IN —
    // this read must not repeat that shape.
    expect(SRC).not.toMatch(/\.in\("entry_id"/);
  });

  it("never writes, never uses a privileged client, and a failed read yields null (no invented confirmation)", () => {
    expect(SRC).toMatch(/import \{ createClient \} from "@\/lib\/supabase\/server"/);
    expect(SRC).not.toMatch(/service_role|createAdminClient|\.insert\(|\.update\(|\.rpc\(/);
    expect(SRC).toMatch(/if \(error\) return null;/);
    expect(SRC).toMatch(/catch \{\s*return null;/);
  });
});
