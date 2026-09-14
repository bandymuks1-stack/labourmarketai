import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * A JOURNAL COUNT SHOWN TO A PERSON COUNTS LIVE ENTRIES ONLY.
 *
 * THE DEFECT, MEASURED (audit 2026-09-14). `lib/profile/trust-signals.ts` read
 * `journal_entries` with no `deleted_at` / `superseded_by` filter and returned
 * its length as the person's "evidence trail length". Production held **65
 * entries, 46 live** — 8 deleted, 11 superseded, 4 real people affected — and
 * that number feeds `/dashboard/profile` AND `lib/cv-export/verified-cv.ts`,
 * a document that leaves the platform. `player-card.ts` had the same gap in
 * its confirmation count while the read four lines below it already filtered
 * `deleted_at`: one file, two answers.
 *
 * WHY THIS GUARD EXECUTES THE READER. The audit's own finding was that 642 of
 * 867 guards assert over source TEXT and never run product code, and that
 * every test defending the previous version of this rule constructed its own
 * input. A grep for `superseded_by` would pass on a file that mentions the
 * column in a comment. So each test below CALLS the real exported reader with
 * a recording client and asserts the filters that reader actually sent to
 * PostgREST.
 *
 * NEGATIVE CONTROL. On the pre-fix tree every assertion here fails: the
 * recorded filter list for the `journal_entries` read contains `eq:worker_id`
 * and nothing else, so `is:superseded_by:null` is absent.
 *
 * WHAT THIS GUARD DOES NOT CLAIM. It proves the reader ASKS for live rows. It
 * does not prove the database answers correctly — that needs a real DB, which
 * CI deliberately does not have (GOV-3, decided 2026-09-08).
 */

/** Records the filter chain a reader sends, and answers with `rows`. */
function recordingClient(rows: unknown[]) {
  const reads: { table: string; filters: string[] }[] = [];
  const client = {
    from: (table: string) => {
      const filters: string[] = [];
      reads.push({ table, filters });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      const settle = () =>
        Promise.resolve({ data: rows, error: null, count: rows.length });
      b.select = () => b;
      b.eq = (c: string) => (filters.push(`eq:${c}`), b);
      b.is = (c: string, v: null) => (filters.push(`is:${c}:${String(v)}`), b);
      b.gte = (c: string) => (filters.push(`gte:${c}`), b);
      b.in = (c: string) => (filters.push(`in:${c}`), b);
      b.order = () => b;
      b.limit = () => b;
      b.range = () => b;
      b.maybeSingle = () => Promise.resolve({ data: null, error: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.then = (ok: any, err: any) => settle().then(ok, err);
      return b;
    },
  };
  /** Filters recorded for the Nth read of a table, in call order. */
  const filtersFor = (table: string, nth = 0) =>
    reads.filter((r) => r.table === table)[nth]?.filters ?? [];
  return { client, reads, filtersFor };
}

const LIVE = ["is:deleted_at:null", "is:superseded_by:null"];

describe("the live-entry rule has ONE home", () => {
  it("liveJournalEntriesOnly sends BOTH filters, and returns the same builder", async () => {
    const { liveJournalEntriesOnly } = await import("@/lib/journal/journal-list-core");
    const { client, filtersFor } = recordingClient([]);
    const q = client.from("journal_entries").select("id");
    expect(liveJournalEntriesOnly(q)).toBe(q);
    expect(filtersFor("journal_entries")).toEqual(LIVE);
  });

  it("isLiveJournalEntry drops deleted AND superseded, and nothing else", async () => {
    const { isLiveJournalEntry } = await import("@/lib/journal/journal-list-core");
    expect(isLiveJournalEntry({})).toBe(true);
    expect(isLiveJournalEntry({ deleted_at: null, superseded_by: null })).toBe(true);
    expect(isLiveJournalEntry({ deleted_at: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(isLiveJournalEntry({ superseded_by: "e-2" })).toBe(false);
  });
});

describe("trust-signals — the number that reaches the Verified CV", () => {
  it("asks the database for LIVE entries only", async () => {
    const { client, filtersFor } = recordingClient([{ id: "e-1" }, { id: "e-2" }]);
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));
    vi.resetModules();
    const { getOwnTrustSignals } = await import("@/lib/profile/trust-signals");

    const signals = await getOwnTrustSignals("w-1");

    const filters = filtersFor("journal_entries");
    expect(
      filters,
      "trust-signals counts a person's evidence trail; it must ask for live rows",
    ).toEqual(expect.arrayContaining(LIVE));
    // The count is the LENGTH of what the filtered read returned — so the
    // filter is what decides it, which is the whole point.
    expect(signals.journalEntries).toBe(2);
    vi.doUnmock("@/lib/supabase/server");
  });

  it("still reports UNKNOWN rather than zero when the read fails (SEP-7)", async () => {
    // The pre-existing honesty property, re-asserted because this change
    // touched the same read: a failed read is not a person with nothing.
    const failing = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.is = () => b;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        b.then = (ok: any) =>
          Promise.resolve({ data: null, error: { message: "boom" }, count: null }).then(ok);
        return b;
      },
    };
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => failing }));
    vi.resetModules();
    const { getOwnTrustSignals } = await import("@/lib/profile/trust-signals");
    const signals = await getOwnTrustSignals("w-1");
    expect(signals.journalEntries).toBeNull();
    expect(signals.managerConfirmations).toBeNull();
    vi.doUnmock("@/lib/supabase/server");
  });
});

describe("player-card — one file may not hold two answers", () => {
  it("both journal reads ask for LIVE entries only", async () => {
    // getWorkerPlayerCard is `cache()`d, takes no arguments and resolves its
    // subject from the session, so driving it means standing up its whole
    // dependency chain. It is worth it: the FIRST version of this test called
    // a function that does not exist (`getOwnPlayerCard`), optional chaining
    // swallowed it, and the assertion sat behind `if (reads.length > 0)` —
    // vacuous, which is precisely the register-guard defect this whole audit
    // was about. A guard that cannot fail is worse than no guard.
    const { client, filtersFor, reads } = recordingClient([{ id: "e-1", created_at: "2026-01-01T00:00:00Z" }]);
    const withAuth = {
      ...client,
      auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    };
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => withAuth }));
    vi.doMock("@/lib/auth/session-profile", () => ({
      getSessionProfile: async () => ({ profile: { display_name: "A" } }),
    }));
    vi.doMock("@/lib/data/worker-core", () => ({
      getWorkerCoreRow: async () => ({ id: "w-1" }),
      getWorkerSkillRows: async () => [],
      getPrimaryProfessionSlug: async () => null,
    }));
    vi.doMock("@/lib/player-card/work-history", () => ({ getOwnWorkHistory: async () => [] }));
    vi.doMock("@/lib/instructions/instructions", () => ({
      listAttentionInstructions: async () => [],
    }));
    vi.doMock("@/lib/documents/readiness", () => ({
      listMyDocuments: async () => [],
      deriveDocumentStatus: () => "ok",
    }));
    vi.resetModules();

    const { getWorkerPlayerCard } = await import("@/lib/player-card/player-card");
    await getWorkerPlayerCard();

    const journalReads = reads.filter((r) => r.table === "journal_entries");
    expect(
      journalReads.length,
      "the card made no journal read at all — this test would then prove nothing",
    ).toBeGreaterThan(0);
    journalReads.forEach((r, i) => {
      expect(
        r.filters,
        `journal_entries read #${i} did not ask for live rows: ${r.filters.join(", ")}`,
      ).toEqual(expect.arrayContaining(LIVE));
    });
    expect(filtersFor("journal_entries")).toEqual(expect.arrayContaining(LIVE));

    for (const m of [
      "@/lib/supabase/server",
      "@/lib/auth/session-profile",
      "@/lib/data/worker-core",
      "@/lib/player-card/work-history",
      "@/lib/instructions/instructions",
      "@/lib/documents/readiness",
    ]) {
      vi.doUnmock(m);
    }
  });
});

/**
 * EVERY READER IS CLASSIFIED, ON PURPOSE.
 *
 * The executing tests above prove the three readers the completion plan named.
 * They cannot prove anything about a reader added next month. This block does
 * the complementary job: it enumerates EVERY non-test module that reads
 * `journal_entries` and requires each to be one of two things —
 *
 *   · it applies the live-entry rule (through the shared helpers, or by naming
 *     `superseded_by` itself where the read is embedded on a joined table and
 *     the helper cannot express the column prefix), or
 *   · it is on `SEES_EVERY_ROW` below WITH A WRITTEN REASON.
 *
 * A new reader that does neither fails this test. That is the point: the
 * default becomes "state your case", not "silently count deleted work".
 *
 * This is a STRUCTURAL guard over source text and it says so — the audit's own
 * finding was that 642 of 867 guards assert over text while claiming to prove
 * behaviour. It claims only that no reader is unclassified.
 */
const SEES_EVERY_ROW: Record<string, string> = {
  // THE home of the rule itself.
  "lib/journal/journal-list-core.ts":
    "defines the rule; reads all rows because `correctedOriginals` needs the superseded ones",

  // Integrity: the append-only head must move when ANY row is appended,
  // including one later deleted or superseded — otherwise a confirm token
  // stops being one-time and a replay writes a second entry.
  "lib/capabilities/registry.ts":
    "journal chain fingerprint — a one-time token's head must count every append",

  // Writers and ownership lookups act ON a row; they must be able to see the
  // row they are about to change.
  "lib/journal/journal-write-core.ts":
    "append/correct path — it writes the very rows the rule later filters",
  "lib/journal/confirm-actions.ts": "writer path; its presented count uses the helper",
  "lib/journal/review-actions.ts":
    "writer — records a manager's review against one entry addressed by id",
  "lib/journal/journal-entry-skills-actions.ts": "writer — links skills to a specific entry",
  "lib/journal/skill-pipeline.ts": "ownership lookup of one entry by id before writing",

  // Reviewable ids come from `reviewable_journal_entry_ids()`, which filters
  // `deleted_at is null and superseded_by is null` in SQL (migration
  // 20260720150000). Filtering again in the reader would be a second home.
  "lib/journal/review-queue.ts": "ids come from reviewable_journal_entry_ids(), filtered in SQL",
  "lib/journal/review-report.ts": "ids come from reviewable_journal_entry_ids(), filtered in SQL",
  "app/[locale]/dashboard/inbox/page.tsx":
    "ids come from reviewable_journal_entry_ids(), filtered in SQL",

  // A subject-access export is the one place the person is entitled to
  // EVERYTHING held about them, retracted rows included.
  "lib/privacy/export-data.ts": "GDPR subject access — withholding rows would be the defect",

  // Not a figure shown to anyone: which workers were active, for notification
  // targeting. A superseded entry still means the person worked.
  "lib/notifications/event-emitters.ts": "activity cohort for notifications, not a presented count",
};

describe("no reader of journal_entries is unclassified", () => {
  const APP = join(__dirname, "..", "..");

  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "tests") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sources(full, out);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  const readers = sources(APP)
    .filter((f) => readFileSync(f, "utf8").includes('from("journal_entries")'))
    .map((f) => relative(APP, f).split(sep).join("/"))
    .sort();

  it("finds the readers at all (a zero-length sweep would prove nothing)", () => {
    expect(readers.length).toBeGreaterThan(20);
    expect(readers).toContain("lib/profile/trust-signals.ts");
    expect(readers).toContain("lib/player-card/player-card.ts");
  });

  it("every reader applies the rule or is exempt WITH A REASON", () => {
    const unclassified = readers.filter((rel) => {
      if (rel in SEES_EVERY_ROW) return false;
      const src = readFileSync(join(APP, rel), "utf8");
      return !(
        src.includes("liveJournalEntriesOnly") ||
        src.includes("isLiveJournalEntry") ||
        src.includes("superseded_by")
      );
    });
    expect(
      unclassified,
      "these read journal_entries without the live-entry rule and without an exemption reason — " +
        "either apply the rule or add the file to SEES_EVERY_ROW saying why it must see every row",
    ).toEqual([]);
  });

  it("every exemption still names a real reader, and gives a reason", () => {
    for (const [rel, reason] of Object.entries(SEES_EVERY_ROW)) {
      expect(readers, `${rel} is exempt but no longer reads journal_entries`).toContain(rel);
      expect(reason.length, `${rel} needs a real reason`).toBeGreaterThan(15);
    }
  });
});
