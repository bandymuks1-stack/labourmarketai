import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Decision 0018 - SWEEP OF EVERY READER of journal_entry_confirmations.
 *
 * A client's acceptance (confirmation_scope.authority.basis = 'counterparty')
 * is CLIENT_ACCEPTED. It must never be counted as an employer confirmation,
 * a skill verification, a payment confirmation or an independent
 * verification. One regression test per reader that COUNTS or CLASSIFIES
 * confirmation rows; readers that cannot see the difference by construction
 * are pinned as such.
 */

vi.mock("server-only", () => ({}));

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const client = { confirmation_scope: { action: "client_accept", decision: "approved", authority: { basis: "counterparty" } } };
const employer = { confirmation_scope: { action: "confirm", decision: "approved", authority: { basis: "employer" } } };
const legacy = { confirmation_scope: { action: "confirm", decision: "approved" } };

/** A chainable, awaitable fake of the PostgREST builder, per table. */
function fakeSb(tables: Record<string, { data?: unknown; count?: number | null }>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = new Proxy(b, {
      get(_t, prop: string) {
        if (prop === "then") {
          const r = tables[table] ?? { data: [] };
          return (res: (v: unknown) => unknown) => res({ data: r.data ?? null, count: r.count ?? null, error: null });
        }
        return (...args: unknown[]) => {
          calls.push({ table, method: prop, args });
          return chain;
        };
      },
    });
    return chain;
  };
  return { sb: { from }, calls };
}

let current: ReturnType<typeof fakeSb>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.sb }));

describe("the shared discriminator", () => {
  it("keeps legacy and employer rows, drops only counterparty rows", async () => {
    const { withoutCounterpartyRows, EMPLOYER_BASIS_OR_FILTER } = await import("@/lib/journal/review-status");
    expect(withoutCounterpartyRows([client, employer, legacy])).toEqual([employer, legacy]);
    expect(withoutCounterpartyRows(null)).toEqual([]);
    // count/head queries: a plain .neq on the JSON path would drop legacy rows
    expect(EMPLOYER_BASIS_OR_FILTER).toContain("authority->>basis.is.null");
    expect(EMPLOYER_BASIS_OR_FILTER).toContain("authority->>basis.neq.counterparty");
  });
});

describe("reader: profile trust signals (managerConfirmations)", () => {
  it("counts through the ONE definition, which is employer-only by construction", async () => {
    // counter-canonical v1: the count is `countConfirmedEntries`
    // (review-status.ts), built on the shared derivation that drops
    // counterparty rows - not a head count with its own `.or()` filter.
    expect(read("lib/profile/trust-signals.ts")).toContain("countConfirmedEntries");
    const { countConfirmedEntries } = await import("@/lib/journal/review-status");
    expect(
      countConfirmedEntries(
        [{ id: "e1", journal_entry_confirmations: [{ ...client, created_at: "2026-10-04T10:00:00Z", confirmer_id: "rep" }] }],
        "subject",
      ),
    ).toBe(0);
  });
});

describe("reader: player card own confirmations count", () => {
  it("is filtered to employer-path rows (static pin; the function is private)", () => {
    const src = read("lib/player-card/player-card.ts");
    const fn = src.slice(src.indexOf("async function ownConfirmationsCount"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toContain(".or(EMPLOYER_BASIS_OR_FILTER)");
  });
});

describe("reader: capability evidence (independently confirmed entries)", () => {
  it("does not count another party's client acceptance as an independent confirmation", async () => {
    current = fakeSb({
      worker_skills: { count: 0 },
      journal_entries: { data: [{ id: "e1" }, { id: "e2" }, { id: "e3" }] },
      journal_entry_confirmations: {
        data: [
          { entry_id: "e1", confirmer_id: "rep", ...client },
          { entry_id: "e2", confirmer_id: "mgr", ...employer },
          { entry_id: "e3", confirmer_id: "mgr2", ...legacy },
        ],
      },
    });
    const { getOwnRecordedWorkEvidence } = await import("@/lib/qualification/capability-evidence");
    const r = await getOwnRecordedWorkEvidence("w1", "subject");
    expect(r.independentlyConfirmedEntries).toBe(2);
  });
});

describe("static pins for readers whose queries are inside large functions", () => {
  const cases: [string, string, RegExp][] = [
    ["matching workbench confirmation count", "lib/admin/matching-workbench.ts", /select\("entry_id, confirmation_scope"\)[\s\S]{0,400}withoutCounterpartyRows/],
    ["agency pool confirmation count", "lib/agency/pool.ts", /select\("entry_id, confirmation_scope"\)[\s\S]{0,400}withoutCounterpartyRows/],
    ["capability registry journal.list confirmations", "lib/capabilities/registry.ts", /confirmations: withoutCounterpartyRows\(e\.journal_entry_confirmations\)\.length/],
    ["task evidence confirmedAt", "lib/journal/task-evidence.ts", /journal_entry_confirmations\(confirmation_scope, created_at, confirmer_id\)[\s\S]{0,12000}isConfirmedEntry\(confirmations/],
    ["weekly intelligence confirmedCount", "lib/worker/weekly-intelligence.ts", /select\("entry_id, confirmation_scope, created_at, confirmer_id"\)[\s\S]{0,900}countConfirmedEntries/],
  ];
  for (const [name, file, rx] of cases) {
    it(`${name} filters counterparty rows`, () => {
      expect(read(file)).toMatch(rx);
    });
  }
});

describe("readers that derive through the shared review derivation are employer-only by construction", () => {
  it("journal standing, window report, calendar, planning, work intelligence, own-recent confirmations, confirmed-work counters", async () => {
    const { deriveReviewResult, deriveIndependentReviewResult } = await import("@/lib/journal/review-status");
    const rows = [{ ...client, created_at: "2026-10-04T10:00:00Z", confirmer_id: "rep" }];
    expect(deriveReviewResult(rows)).toBe("submitted");
    expect(deriveIndependentReviewResult(rows, "subject")).toBe("submitted");
    for (const f of [
      "lib/journal/journal-window-report.ts",
      "lib/journal/work-intelligence-read.ts",
      "lib/journal/own-recent-confirmations-model.ts",
      "lib/planning/planning.ts",
      "lib/evidence/confirmed-work-read.ts",
    ]) {
      expect(read(f), f).toMatch(/deriveReviewResult|deriveIndependentReviewResult|isConfirmedEntry/);
    }
  });

  it("the verified CV standing ignores counterparty rows and the CV counts client acceptance separately", () => {
    const src = read("lib/cv-export/confirmation-standing.ts");
    expect(src).toContain('authority?.basis === "counterparty"');
    expect(read("lib/cv-export/verified-cv.ts")).toContain("countClientAcceptedEntries");
  });
});

describe("readers that are SAFE as written (pinned so they stay safe)", () => {
  it("skill confidence counts only action 'confirm' (a client row's action is client_accept)", () => {
    expect(read("lib/journal/confirm-actions.ts")).toMatch(/if \(action !== "confirm"\) continue;/);
  });
  it("manager evidence counts only action 'confirm' of the caller's own rows", () => {
    expect(read("lib/operations/manager-evidence.ts")).toMatch(/action === "confirm"/);
  });
  it("conversation correct-work reads ANY decision as the edit lock (an append-only row closes the edit door whoever wrote it)", () => {
    expect(read("lib/conversation/correct-work.ts")).toContain("journal_entry_confirmations ?? []).length > 0");
  });
});

describe("SQL readers", () => {
  const mig = (n: string) => readFileSync(join(REPO, "supabase/migrations", n), "utf8");
  it("batch_review_exceptions counts employer approvals only (20261003150555)", () => {
    const m = mig("20261003150555_batch_review_exceptions_employer_only_v1.sql");
    expect(m).toContain("coalesce(c.confirmation_scope #>> '{authority,basis}', 'employer') <> 'counterparty'");
    expect(m).toMatch(/revoke all on function public\.batch_review_exceptions\(uuid\[\]\) from public, anon/);
  });
  it("confirm_entry_and_verify_skills / apply_learning_auto_confirmation stay employer-only through the guard trigger (unchanged bodies)", () => {
    const m1 = mig("20261003150500_journal_counterparty_review_authority_v1.sql");
    expect(m1).toMatch(/authority_basis_mismatch/);
    expect(m1).toMatch(/NOT TOUCHED[\s\S]{0,400}confirm_entry_and_verify_skills/);
  });
});
