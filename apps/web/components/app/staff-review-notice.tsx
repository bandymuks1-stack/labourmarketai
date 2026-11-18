import { REVIEW_NOTICE_VERSION } from "@/lib/operations/auto-review-model";

/**
 * THE review sentence (owner decision 1, 2026-10-12): accepting a staff
 * invitation lets a manager of that organization read the work the person
 * records there and sign it off. Every accept surface renders this ONE
 * element — invite page, addressed signup, onboarding finish, network list,
 * chat card — only when `showsStaffReviewNotice` holds, and only then passes
 * `REVIEW_NOTICE_VERSION` to the accept action. The text arrives localized
 * (`network.invitePage.reviewNotice`), so this works in server and client trees.
 */
export function StaffReviewNotice({ text, testId }: { text: string; testId: string }) {
  return (
    <p
      className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-secondary"
      data-testid={testId}
      data-review-notice={REVIEW_NOTICE_VERSION}
    >
      {text}
    </p>
  );
}
