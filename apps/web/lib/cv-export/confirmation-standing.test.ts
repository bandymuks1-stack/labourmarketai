import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isConfirmingScope,
  selectStandingConfirmations,
} from "./confirmation-standing";

/**
 * A later rejection RETRACTS an earlier confirmation — the verified CV must
 * read the ledger's newest word per entry, not its most flattering one.
 * Found 2026-09-19: the CV took the older confirm when the newest row was a
 * reject, printing "Confirmed Work Proof" for withdrawn work.
 */
describe("selectStandingConfirmations — newest row per entry decides", () => {
  const confirm = (entry: string, at: string) => ({
    entry_id: entry,
    created_at: at,
    confirmation_scope: { action: "confirm", decision: "approved" },
  });
  const reject = (entry: string, at: string) => ({
    entry_id: entry,
    created_at: at,
    confirmation_scope: { action: "reject", decision: "rejected" },
  });
  const changes = (entry: string, at: string) => ({
    entry_id: entry,
    created_at: at,
    confirmation_scope: { action: "request_changes", decision: "changes_requested" },
  });

  it("a rejection after a confirmation removes the entry from the proof", () => {
    const rows = [confirm("e1", "2026-09-01T10:00:00Z"), reject("e1", "2026-09-02T10:00:00Z")];
    expect(selectStandingConfirmations(rows)).toEqual([]);
  });

  it("changes requested after a confirmation removes it too", () => {
    const rows = [confirm("e1", "2026-09-01T10:00:00Z"), changes("e1", "2026-09-03T10:00:00Z")];
    expect(selectStandingConfirmations(rows)).toEqual([]);
  });

  it("a confirmation after a rejection restores the entry, with the newer stamp", () => {
    const rows = [reject("e1", "2026-09-01T10:00:00Z"), confirm("e1", "2026-09-04T10:00:00Z")];
    const out = selectStandingConfirmations(rows);
    expect(out.map((r) => [r.entry_id, r.created_at])).toEqual([["e1", "2026-09-04T10:00:00Z"]]);
  });

  it("input order is irrelevant — an unordered read cannot resurrect a retraction", () => {
    const newestFirst = [reject("e1", "2026-09-02T10:00:00Z"), confirm("e1", "2026-09-01T10:00:00Z")];
    const oldestFirst = [...newestFirst].reverse();
    expect(selectStandingConfirmations(newestFirst)).toEqual([]);
    expect(selectStandingConfirmations(oldestFirst)).toEqual([]);
  });

  it("one row per entry, entries independent", () => {
    const rows = [
      confirm("a", "2026-09-01T10:00:00Z"),
      confirm("a", "2026-09-05T10:00:00Z"),
      confirm("b", "2026-09-02T10:00:00Z"),
      reject("c", "2026-09-02T10:00:00Z"),
    ];
    const out = selectStandingConfirmations(rows);
    expect(out.map((r) => r.entry_id).sort()).toEqual(["a", "b"]);
    expect(out.find((r) => r.entry_id === "a")?.created_at).toBe("2026-09-05T10:00:00Z");
  });

  it("recognises every confirming shape the RPCs write, and nothing else", () => {
    expect(isConfirmingScope({ action: "confirm" })).toBe(true);
    expect(isConfirmingScope({ action: "auto_confirm" })).toBe(true);
    expect(isConfirmingScope({ decision: "approved" })).toBe(true);
    expect(isConfirmingScope({ action: "reject", decision: "rejected" })).toBe(false);
    expect(isConfirmingScope({ action: "request_changes" })).toBe(false);
    expect(isConfirmingScope(null)).toBe(false);
    expect(isConfirmingScope("confirm")).toBe(false);
  });
});

describe("the verified CV reads the ledger through this rule", () => {
  it("verified-cv.ts no longer skips non-confirm rows before marking the entry seen", () => {
    const src = readFileSync(join(__dirname, "verified-cv.ts"), "utf8");
    expect(src).toMatch(/selectStandingConfirmations\(/);
    // The exact defective shape: deciding "seen" only for confirms.
    expect(src).not.toMatch(/if \(!isConfirm \|\| seen\.has\(/);
  });
});
