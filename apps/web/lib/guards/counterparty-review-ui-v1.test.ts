import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVID-2 slice 2 - the counterparty journey UI (register -> submit -> decide
 * -> read back). Static guards that keep the three properties the owner
 * required, because a rule that lives only in prose dies at the next refactor:
 *
 *  1. every write goes through ONE SECURITY DEFINER function, with the caller
 *     re-derived by the database (no direct table write, no identity from the
 *     browser);
 *  2. the subject can never be their own counterparty (no decision surface on
 *     the journal, no historical write path);
 *  3. the copy is honest and every active locale carries it.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const ACTIONS = read("lib/journal/counterparty-actions.ts");
const READERS = read("lib/journal/counterparty-review.ts");
const MIG2 = readFileSync(
  join(REPO, "supabase/migrations/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.sql"),
  "utf8",
);
const ROLLBACK2 = readFileSync(
  join(REPO, "supabase/rollbacks/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.down.sql"),
  "utf8",
);

describe("writes are RPC-only and never trust the browser", () => {
  it("has no direct table write anywhere in the action module", () => {
    expect(ACTIONS).not.toMatch(/\.from\(\s*["'`]/);
    expect(ACTIONS).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("calls exactly the four SECURITY DEFINER commands", () => {
    for (const fn of [
      "register_work_counterparty_link_v1",
      "revoke_work_counterparty_link_v1",
      "submit_journal_entry_for_review_v1",
      "review_journal_entry",
    ]) {
      expect(ACTIONS).toContain(`"${fn}"`);
    }
  });

  it("never reads an identity, role or authority from the form", () => {
    for (const forbidden of ["confirmer_id", "actor_id", "profile_id", "organization_id", "party_organization_id", "basis"]) {
      expect(ACTIONS).not.toMatch(new RegExp(`formData\\.get\\(\\s*["']${forbidden}["']`));
    }
  });

  it("re-derives the counterparty queue before a decision and never verifies skills", () => {
    expect(ACTIONS).toContain("list_counterparty_review_queue_v1");
    expect(ACTIONS).not.toMatch(/applyApprovalSkillEffects|confirmEntrySkills|confirm_entry_and_verify_skills/);
  });

  it("has no historical / reconstructed write path", () => {
    for (const src of [ACTIONS, READERS]) {
      expect(src).not.toMatch(/RECONSTRUCTED|imported_by|imported_at/);
    }
  });

  it("photo files are signed under the caller's OWN session - no service role", () => {
    expect(READERS).not.toMatch(/createAdminClient|supabase\/admin|service_role|serviceRole/);
    const view = READERS.slice(READERS.indexOf("export async function readCounterpartyEntryView"));
    expect(view).toMatch(/supabase\.storage/);
    expect(view).toMatch(/if \(!detail\) return null;[\s\S]*createSignedUrls/);
  });
});

describe("the surfaces", () => {
  const card = read("components/app/counterparty-review-card.tsx");
  const panel = read("components/app/entry-review-panel.tsx");
  const link = read("components/app/counterparty-link-panel.tsx");
  const queuePage = read("app/[locale]/dashboard/inbox/counterparty/page.tsx");
  const projectPage = read("app/[locale]/dashboard/projects/[id]/page.tsx");
  const journalPage = read("app/[locale]/dashboard/journal/page.tsx");

  it("the journal offers SUBMIT (explicit) and no decision control for the subject", () => {
    expect(panel).toContain("submitEntryForReview");
    expect(panel).not.toContain("decideCounterpartyEntry");
    expect(panel).not.toContain("review_journal_entry");
    expect(panel).toContain("neverAutomatic");
  });

  it("the queue card decides through the decide action only", () => {
    expect(card).toContain("decideCounterpartyEntry");
    expect(card).not.toContain("submitEntryForReview");
  });

  it("the project panel registers / revokes through the link actions only", () => {
    expect(link).toContain("registerCounterpartyLink");
    expect(link).toContain("revokeCounterpartyLink");
    expect(link).not.toContain("decideCounterpartyEntry");
  });

  it("are mounted where the journey needs them", () => {
    expect(projectPage).toContain("CounterpartyLinkPanel");
    expect(projectPage).toContain("readLinkCandidates");
    expect(journalPage).toContain("EntryReviewPanel");
    expect(journalPage).toContain("readEntryReviewStates");
    expect(queuePage).toContain("readCounterpartyQueue");
    expect(queuePage).toContain("CounterpartyReviewCard");
  });

  it("a failed read is UNKNOWN, never an empty list", () => {
    expect(queuePage).toMatch(/loadFailed/);
    expect(link).toContain("loadFailed");
  });

  it("never uses the banned 'demo' or game wording in new copy or markup", () => {
    for (const src of [card, panel, link, queuePage, ACTIONS, READERS]) {
      expect(src).not.toMatch(/\bdemo\b/i);
    }
  });
});

describe("the second migration", () => {
  it("is RED-marked, has a rollback, and revokes anon per function", () => {
    expect(MIG2.startsWith("-- @human-gate-approved")).toBe(true);
    expect(ROLLBACK2.length).toBeGreaterThan(200);
    const created = [...MIG2.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/gi)].map((m) => m[1]);
    expect(created.length).toBeGreaterThanOrEqual(7);
    for (const fn of created) {
      expect(MIG2, `explicit revoke from anon for ${fn}`).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`, "i"),
      );
    }
  });

  it("resolves a team member through ONE team assignment - never a fan-out row", () => {
    expect(MIG2).toContain("team_member_at_v1");
    expect(MIG2).toContain("to_regclass('public.team_assignments')");
    expect(MIG2).not.toMatch(/insert into public\.project_worker_assignments/i);
    expect(MIG2).not.toMatch(/\b(delete from|update public\.)\b/i);
  });

  it("keeps the employer review set employer-only", () => {
    const start = MIG2.indexOf("CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids");
    const body = MIG2.slice(start, MIG2.indexOf("-- 5c.", start));
    expect(body).toContain("= 'employer'");
    expect(body).not.toContain("= 'counterparty'");
    expect(body).not.toContain("journal_entry_review_submissions");
  });

  it("does not widen journal_entries RLS; the ONLY policy is one additive, resolver-bound storage SELECT", () => {
    expect(MIG2).not.toMatch(/on public\.journal_entries/i);
    expect(MIG2).not.toMatch(/alter policy/i);
    const policies = [...MIG2.matchAll(/create policy ("[^"]+")\s+on (\S+)/gi)];
    expect(policies.map((m) => m[2])).toEqual(["storage.objects"]);
    expect(MIG2).toMatch(/for select to authenticated\s+using \(bucket_id = 'journal-entry-photos' and public\.counterparty_can_read_photo_v1\(name\)\)/);
    expect(MIG2).not.toMatch(/grant [^;]*\bto (anon|public)\b|using \(true\)/i);
    expect(MIG2).not.toMatch(/create policy[^;]*to (anon|public)\b/i);
    expect(ROLLBACK2).toContain('drop policy if exists "journal-entry-photos counterparty select" on storage.objects');
  });
});

describe("i18n: every active locale carries the same counterparty tree", () => {
  const LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;
  const flat = (o: unknown, p = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
      : [p];
  const tree = (loc: string) => JSON.parse(read(`messages/${loc}/journal.json`)).counterparty;

  it("has identical, non-empty keys in all six", () => {
    const base = flat(tree("en")).sort();
    expect(base.length).toBeGreaterThan(100);
    for (const loc of LOCALES) {
      expect(flat(tree(loc)).sort(), loc).toEqual(base);
    }
  });

  it("says client acceptance is not an employer confirmation or a payment record, in every locale", () => {
    for (const loc of LOCALES) {
      const t = tree(loc);
      expect(t.entry.acceptedNotEmployer.length, loc).toBeGreaterThan(40);
      expect(t.queue.honestNote.length, loc).toBeGreaterThan(40);
      expect(t.link.honestNote.length, loc).toBeGreaterThan(40);
    }
  });

  it("carries the read-back keys (provenance + CV) in every locale", () => {
    for (const loc of LOCALES) {
      const root = JSON.parse(read(`messages/${loc}.json`));
      expect(root.provenance.evidenceClientAccepted, loc).toBeTruthy();
      expect(root.cvExport.clientAcceptedWorkFact, loc).toContain("{entries");
    }
  });

  it("no new string contains the banned wording", () => {
    for (const loc of LOCALES) {
      expect(JSON.stringify(tree(loc)), loc).not.toMatch(/\bdemo\b/i);
    }
  });
});
