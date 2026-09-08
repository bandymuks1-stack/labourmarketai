import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A count we could not read is not a person with nothing.
 *
 * THE DEFECT. Every count in `getOwnTrustSignals` fell back to 0 — `count ?? 0`
 * for the two aggregates, and `entryIds.length` (0 on failure) for the third.
 * A timeout therefore told a person with twelve manager confirmations that they
 * had none, and the profile then offered them the how-to-get-started hint. This
 * block is where someone sees what their work has added up to, so it is the
 * worst place in the product to be confidently wrong about them.
 *
 * `null` now means UNREAD. `0` keeps its ordinary meaning: checked, and there
 * is none yet — a distinction the tests below assert in BOTH directions,
 * because a fix that marked everything unknown would be just as dishonest.
 */

type Result = { data?: unknown; count?: number | null; error: unknown };

const tables = new Map<string, Result>();

const ok = (r: Omit<Result, "error">): Result => ({ ...r, error: null });
const fails = (): Result => ({
  data: null,
  count: null,
  error: { code: "57014", message: "timeout" },
});

function builderFor(table: string) {
  const result = tables.get(table) ?? ok({ data: [], count: 0 });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: (t: string) => builderFor(t) })),
}));

import { getOwnTrustSignals } from "@/lib/profile/trust-signals";

beforeEach(() => {
  tables.clear();
  tables.set("worker_skills", ok({ count: 4 }));
  tables.set("journal_entries", ok({ data: [{ id: "e1" }, { id: "e2" }] }));
  tables.set("journal_entry_confirmations", ok({ count: 12 }));
});

describe("counts that were read are reported as they are", () => {
  it("returns the real numbers when every read succeeds", async () => {
    expect(await getOwnTrustSignals("w1")).toEqual({
      verifiedSkills: 4,
      managerConfirmations: 12,
      journalEntries: 2,
    });
  });

  it("a genuine zero stays 0 — checked, and there is none yet", async () => {
    tables.set("worker_skills", ok({ count: 0 }));
    tables.set("journal_entries", ok({ data: [] }));
    const s = await getOwnTrustSignals("w1");
    expect(s).toEqual({
      verifiedSkills: 0,
      managerConfirmations: 0,
      journalEntries: 0,
    });
    // The distinction only means something if 0 is still reachable.
    expect(s.journalEntries).not.toBeNull();
  });
});

describe("counts that failed are null, and only those", () => {
  it("a failed skills read does not say the person has no verified skills", async () => {
    tables.set("worker_skills", fails());
    const s = await getOwnTrustSignals("w1");
    expect(s.verifiedSkills).toBeNull();
    // The others were read and must keep their real values.
    expect(s.managerConfirmations).toBe(12);
    expect(s.journalEntries).toBe(2);
  });

  it("a failed entries read makes confirmations unknown too, because they are counted BY entry", async () => {
    tables.set("journal_entries", fails());
    const s = await getOwnTrustSignals("w1");
    expect(s.journalEntries).toBeNull();
    expect(s.managerConfirmations).toBeNull();
    expect(s.verifiedSkills).toBe(4);
  });

  it("a failed confirmations read leaves the entry count intact", async () => {
    tables.set("journal_entry_confirmations", fails());
    const s = await getOwnTrustSignals("w1");
    expect(s.managerConfirmations).toBeNull();
    expect(s.journalEntries).toBe(2);
  });
});

describe("the surface refuses to coach someone on numbers it could not read", () => {
  const BLOCK = readFileSync(
    join(process.cwd(), "components/app/trust-block.tsx"),
    "utf8",
  );

  it("the growth hint requires every count to have been CHECKED and zero", () => {
    expect(BLOCK).toContain("const allZero = !anyUnread && counts.every((c) => c === 0)");
    expect(BLOCK).toMatch(/const anyUnread = counts\.some\(\(c\) => c === null\)/);
  });

  it("an unread count renders as an em dash, never as 0", () => {
    expect(BLOCK).toMatch(/value === null \? \(\s*<span aria-hidden>—<\/span>/);
  });

  it("the unread state has its own visible line, not the zero hint", () => {
    expect(BLOCK).toContain('data-testid="trust-unread-hint"');
    expect(BLOCK).toContain("labels.unreadHint");
  });

  it("every locale says it — a silent English string here would be its own defect", () => {
    for (const locale of ["en", "lt", "de", "nl", "ru", "pl", "sv", "da", "et", "lv", "no"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as { trust?: Record<string, string> };
      expect(typeof messages.trust?.unreadHint, `${locale}: trust.unreadHint`).toBe(
        "string",
      );
    }
  });
});
