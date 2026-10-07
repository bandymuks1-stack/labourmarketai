import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Whole-product audit C1-C4 (PR #2143), static pins. The behavioural proof of
 * the SQL is scripts/db-proof/journal-counterparty-*.sh (defect first, then
 * fixed); these keep the TS side from drifting.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const web = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const sql = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const M1 = sql("supabase/migrations/20261003150500_journal_counterparty_review_authority_v1.sql");
const M2 = sql("supabase/migrations/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.sql");

describe("C1 - a client decision never suppresses employer review (ONE definition)", () => {
  const fnBody = (m: string, name: string) => {
    const i = m.search(new RegExp(`create or replace function public\\.${name}`, "i"));
    return m.slice(i, m.indexOf("end $function$;", i));
  };
  for (const [label, m] of [["150500", M1], ["150550", M2]] as const) {
    it(`${label}: reviewable_journal_entry_ids ignores counterparty-basis rows when deciding 'already confirmed'`, () => {
      const body = fnBody(m, "reviewable_journal_entry_ids");
      expect(body).toMatch(/not exists \(select 1 from public\.journal_entry_confirmations c[\s\S]*<> 'counterparty'\)/);
    });
  }

  it("every employer 'pending review' surface reads the ONE RPC, none re-derives it from confirmation rows", () => {
    for (const f of [
      "lib/journal/reviewable-count.ts",
      "lib/journal/review-queue.ts",
      "lib/company/worker-readiness.ts",
      "lib/journal/review-report.ts",
      "lib/conversation/confirm-work.ts",
    ]) {
      const src = web(f);
      expect(src, f).toContain("reviewable_journal_entry_ids");
      expect(src, f).not.toMatch(/from\(\s*["']journal_entry_confirmations["']/);
    }
  });
});

describe("C2 - ONE card per correction chain, and the counters count the same set", () => {
  it("the queue projection hides a version once a later version (correction_of -> it) has been submitted", () => {
    const body = M1.slice(M1.indexOf("create or replace function public.list_counterparty_review_queue_v1"));
    expect(body).toMatch(/not exists \(select 1 from public\.journal_entries je2[\s\S]*je2\.correction_of = je\.id/);
  });

  it("the page's bucket sizes come from the full queue and truncation is stated as 'N of M'", () => {
    const page = web("app/[locale]/dashboard/inbox/counterparty/page.tsx");
    expect(page).toContain("allParts");
    expect(page).toMatch(/t\("truncated", \{ n: MAX_CARDS, m:/);
  });

  it("the inbox link, confirm-pulse, company dashboard and organization-today use ONE reader for the client count", () => {
    for (const f of [
      "components/app/arena/confirm-pulse.tsx",
      "app/[locale]/dashboard/company/page.tsx",
      "lib/planning/organization-today.ts",
    ]) {
      expect(web(f), f).toContain("countCounterpartyToDecide");
    }
    const reader = web("lib/journal/counterparty-to-decide-count.ts");
    expect(reader).toContain("readCounterpartyQueue");
    expect(reader).toContain('queueBucket(r) === "to_decide"');
  });

  it("the client count is its own labelled item and is never summed with the employer count", () => {
    const pulse = web("components/app/arena/confirm-pulse.tsx");
    expect(pulse).toContain('data-testid="confirm-pulse-client-review"');
    expect(pulse).not.toMatch(/pending\s*\+\s*clientToDecide|clientToDecide\s*\+\s*pending/);
    const company = web("app/[locale]/dashboard/company/page.tsx");
    expect(company).toMatch(/key: "clientReview"/);
    expect(company).not.toMatch(/reviewPendingCount\s*\+|\+\s*clientToDecide/);
    const today = web("lib/planning/organization-today.ts");
    expect(today).toMatch(/clientReviewToDecide/);
    expect(today).not.toMatch(/awaitingReview\s*\+|\+\s*clientReviewToDecide/);
  });
});

describe("C3 - the verified CV reads only live, counted-once entries", () => {
  it("verified-cv builds its proof rows and the client-accepted count over cvLiveEntries", () => {
    const src = web("lib/cv-export/verified-cv.ts");
    expect(src).toContain("cvLiveEntries(");
    expect(src).toMatch(/correction_of/);
    // the confirmations are read for exactly those entry ids
    expect(src).toMatch(/\.in\("entry_id", entries\.map\(\(e\) => e\.id\)\)/);
  });
});

describe("C4 - the guard trigger itself refuses a note-less negative CLIENT decision", () => {
  it("raises note_required for counterparty-basis rejected / changes_requested / client_dispute / client_request_correction", () => {
    const guard = M1.slice(M1.indexOf("CREATE OR REPLACE FUNCTION public.journal_entry_confirmations_guard"), M1.indexOf("-- 5. Register / revoke"));
    expect(guard).toContain("raise exception 'note_required'");
    expect(guard).toContain("v_claimed = 'counterparty'");
    expect(guard).toMatch(/'rejected', 'changes_requested'/);
    expect(guard).toMatch(/'client_dispute', 'client_request_correction'/);
  });
  it("employer-basis semantics are untouched: the note rule sits inside the counterparty condition only", () => {
    const guard = M1.slice(M1.indexOf("CREATE OR REPLACE FUNCTION public.journal_entry_confirmations_guard"), M1.indexOf("-- 5. Register / revoke"));
    const at = guard.indexOf("raise exception 'note_required'");
    expect(guard.slice(Math.max(0, at - 420), at)).toContain("v_claimed = 'counterparty'");
  });
});
