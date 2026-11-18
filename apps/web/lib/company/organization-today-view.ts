import "server-only";

import { listClaimablePublicIntakes } from "@/lib/company/claim-public-intake";
import { listCompanyWorkerInvitations } from "@/lib/company/company-workers";
import {
  exceptionReadIds,
  pendingInvitationCount,
  rowsOfOrganization,
  todayViewApprovals,
  todayViewDecisions,
  todayViewFacts,
} from "@/lib/company/organization-today-view-model";
import { fetchBatchExceptions } from "@/lib/journal/batch-review";
import { readOrganizationApprovalFacts } from "@/lib/journal/organization-approvals";
import { fetchQuickReviewQueue, type QuickQueueEntry } from "@/lib/journal/review-queue";
import { countReviewableEntriesEverywhere } from "@/lib/journal/reviewable-count";
import { countWorkersWithUnconfirmableWork } from "@/lib/operations/org-members";
import { getOrganizationToday, type OrganizationToday } from "@/lib/planning/organization-today";
import { countRosterConflicts } from "@/lib/planning/roster-conflicts";
import { utcTodayKey } from "@/lib/time/display";
import { viewerWorkToday } from "@/lib/time/viewer-day";

const NO_FACTS = { employees: null, ownUnconfirmed: null, otherReviewer: null, readerReviews: null };
const unknownOnFailure = <T,>(read: Promise<T>): Promise<T | null> => read.catch((): null => null);

/**
 * Everything `/dashboard/company?view=today` shows, composed from the existing reads.
 * Runs only for that view, so the default page's request count does not move. The
 * reviewable-set read is request-cached and shared with `getOrganizationToday`. No write
 * lives here: approvals go through the quick queue's own actions.
 */
export async function loadOrganizationTodayView(input: {
  readonly organizationId: string | null;
  readonly companyId: string | null;
}) {
  const { organizationId, companyId } = input;
  const [workToday, today, reviewable, facts, reviewOff, conflicts, invitations, claims] = await Promise.all([
    viewerWorkToday(),
    getOrganizationToday().catch((): OrganizationToday => ({ applied: false, reason: "error" })),
    // The whole set: the model scopes it to this organization itself and names the rest.
    countReviewableEntriesEverywhere(),
    organizationId ? readOrganizationApprovalFacts(organizationId).catch(() => NO_FACTS) : NO_FACTS,
    organizationId ? unknownOnFailure(countWorkersWithUnconfirmableWork(organizationId)) : null,
    unknownOnFailure(countRosterConflicts()),
    companyId ? unknownOnFailure(listCompanyWorkerInvitations(companyId)) : null,
    unknownOnFailure(listClaimablePublicIntakes()),
  ]);

  // The rows are read only when the count says some wait, as on the first screen.
  const queue: QuickQueueEntry[] | null =
    reviewable === null ? null : reviewable > 0 ? await unknownOnFailure(fetchQuickReviewQueue()) : [];
  const utcToday = utcTodayKey();
  const here = queue ? rowsOfOrganization(organizationId, queue) : [];
  // Nobody who may not review is shown a row, so nothing is asked about one.
  const exceptions =
    here.length > 0 && (facts.readerReviews ?? null) !== false
      ? Object.fromEntries(await fetchBatchExceptions(exceptionReadIds(here, utcToday)))
      : {};

  return {
    todayIso: workToday.todayIso,
    approvals: todayViewApprovals({
      organizationId,
      reviewable,
      queue,
      exceptions,
      utcToday,
      employees: facts.employees,
      ownUnconfirmed: facts.ownUnconfirmed,
      otherReviewer: facts.otherReviewer,
      readerReviews: facts.readerReviews ?? null,
    }),
    exceptions,
    today: todayViewFacts(today),
    decisions: todayViewDecisions({
      absences: today.applied ? today.pendingAbsenceDecisions : null,
      clientReview: today.applied ? today.clientReviewToDecide : null,
      reviewOff,
      conflicts,
      invitations: pendingInvitationCount(invitations),
      claims: claims === null ? null : claims.length,
    }),
  };
}
