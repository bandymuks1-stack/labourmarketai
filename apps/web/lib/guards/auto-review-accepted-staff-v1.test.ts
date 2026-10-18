import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner decision 1 (2026-10-12): work review may switch on by itself ONLY for
 * an employee who accepted a staff invitation after being told so, with an
 * auditable acceptance fact, organization isolation and a manager's manual
 * choice preserved. These guards pin the parts a refactor could quietly widen.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the executor — the person's own session, one party-gated RPC", () => {
  const src = read("lib/operations/auto-review.ts");

  it("records through the RPC only, never a direct write", () => {
    expect(src).toContain('rpc("record_staff_review_notice_v1"');
    expect(src).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    expect(src).not.toContain('rpc("set_engagement_journal_review"');
  });

  it("no service role, no admin client", () => {
    expect(src).not.toMatch(/service[_-]?role|createAdminClient|SUPABASE_SERVICE/i);
    expect(src).toContain("createClient");
  });

  it("forwards only the exact notice version and the enable flag", () => {
    expect(src).toContain("input.notice !== REVIEW_NOTICE_VERSION");
    expect(src).toContain("p_enable_review: STAFF_REVIEW_AUTO_ENABLE");
  });

  it("the manager's dashboard no longer switches review on (the heuristic is gone)", () => {
    expect(read("app/[locale]/dashboard/company/page.tsx")).not.toContain("autoEnableReviewForAcceptedStaff");
  });
});

/** Every surface that accepts a staff invitation: it shows the ONE sentence
 *  with the shared predicate and passes the version only when it did. */
const SURFACES: readonly { file: string; testId: string; passes: RegExp }[] = [
  { file: "app/[locale]/invite/[token]/page.tsx", testId: "invite-review-notice", passes: /name="reviewNotice" value=\{REVIEW_NOTICE_VERSION\}/ },
  { file: "app/[locale]/invite/[token]/page.tsx", testId: "invite-anon-review-notice", passes: /showsStaffReviewNotice\(/ },
  { file: "components/app/signup-form.tsx", testId: "signup-review-notice", passes: /reviewNotice: invitation\.reviewNoticeText \? REVIEW_NOTICE_VERSION : null/ },
  { file: "components/app/onboarding-wizard.tsx", testId: "onboarding-review-notice", passes: /reviewNotice: invitationReviewNotice \? REVIEW_NOTICE_VERSION : null/ },
  { file: "components/app/invitation-list.tsx", testId: "incoming-invitation-review-notice-", passes: /reviewNotice: rowShowsReviewNotice\(row\) \? REVIEW_NOTICE_VERSION : null/ },
  { file: "components/app/conversation/worker-invitation-action.tsx", testId: "conversation-invitation-review-notice", passes: /reviewNotice: REVIEW_NOTICE_VERSION/ },
];

describe("the sentence is on every accept path before the automation", () => {
  for (const s of SURFACES) {
    it(`${s.file} shows it (${s.testId}) and passes the version only then`, () => {
      const src = read(s.file);
      expect(src).toContain("StaffReviewNotice");
      expect(src).toContain(s.testId);
      expect(src).toMatch(s.passes);
    });
  }

  it("the pages that pre-translate the sentence decide with the shared predicate", () => {
    for (const f of ["app/[locale]/auth/signup/page.tsx", "app/[locale]/onboarding/page.tsx", "components/app/conversation/chat/conversation-chat.tsx"]) {
      expect(read(f), f).toContain("showsStaffReviewNotice(");
    }
  });

  it("every accept action threads the surface and the notice to the recorder", () => {
    const actions = read("lib/invitations/actions.ts");
    expect(actions).toContain("recordStaffReviewNotice({");
    expect(actions).toContain("notice: acceptedReviewNotice(args.reviewNotice)");
    expect(read("lib/invitations/signup-accept-action.ts")).toContain('surface: "addressed_signup"');
    expect(read("lib/invitations/invite-page-actions.ts")).toContain('noticeSurface: "invite_page"');
    expect(read("lib/conversation/worker-executors.ts")).toContain('noticeSurface: "conversation"');
  });

  it("the chat schema admits only the exact version, optionally", () => {
    expect(read("lib/conversation/worker-schemas.ts")).toContain("reviewNotice: z.literal(REVIEW_NOTICE_VERSION).optional()");
  });

  it("the sentence exists in every active locale", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const d = JSON.parse(read(`messages/${loc}.json`)) as { network: { invitePage: Record<string, string> } };
      expect(d.network.invitePage.reviewNotice, loc).toContain("{organization}");
    }
  });
});
