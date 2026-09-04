"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import { buildWorkContext } from "@/lib/conversation/context-intelligence";
import { loadProfileSummaryForChat } from "@/lib/conversation/profile-summary";
import { CHIP_FOR_STEP } from "@/lib/conversation/worker-activity-chips";
import { listMyEngagements } from "@/lib/invitations/network";
import { getUnreadConversationCount } from "@/lib/communication/unread";
import { getPendingIncomingBookingCount } from "@/lib/booking/booking-actions";

/**
 * THE OPENING BRIEF (owner ruling 2026-07-29, W2).
 *
 * The chat's first words must not be "Kuo šiandien galiu padėti?" — the
 * product KNOWS things about this person, and pretending otherwise is the
 * "search box dressed as a conversation" failure. This composes the opening
 * from the canonical reads that already exist, in priority order:
 *
 *   0. a booking proposal awaiting YOUR answer → someone is blocked on you
 *   1. new matching opportunities        → the reason to be here today
 *   2. calendar conflict / overdue work  → the thing that will bite
 *   3. work done today but not logged    → the journal is the spine
 *   4. the first missing profile step    → the next investment
 *
 * At most THREE lines and THREE chips (the owner's cap: 1–3 relevant actions,
 * never a button wall). If nothing is genuinely relevant it returns `none`
 * and the caller shows the greeting with ONE meaningful action instead.
 *
 * HONESTY: every line is a count or a fact from the person's own rows. An
 * unavailable read contributes NOTHING — it never fabricates a line, and the
 * brief never blocks the chat (any failure degrades to `none`).
 */

export type OpeningChip = { id: string; label: string };

export type OpeningBrief =
  | { kind: "brief"; lines: string[]; chips: OpeningChip[] }
  | { kind: "none" };

const MAX_LINES = 3;
const MAX_CHIPS = 3;

export async function loadOpeningBrief(): Promise<OpeningBrief> {
  const t = await getTranslations("conversation.chat");

  const lines: string[] = [];
  const chips: OpeningChip[] = [];
  const seenChip = new Set<string>();
  const addChip = (id: string, label: string) => {
    if (chips.length >= MAX_CHIPS || seenChip.has(id)) return;
    seenChip.add(id);
    chips.push({ id, label });
  };

  // 0 ── a company is waiting on THIS person's answer ─────────────────────
  // Beta audit B1. A proposed booking is the one thing on this screen that
  // another human is actively blocked on, so it outranks every passive line
  // below it (the same ladder the notification spine already uses). The offer
  // cards themselves are ALREADY loaded by the dashboard page and already
  // render behind the `offers` chip — the only thing missing was ever saying
  // so. Without this, a worker learns about a real offer only by opening an
  // unlabelled bell popover or typing the right sentence.
  //
  // Bookings deliberately get NO nav entry (owner IA ruling, pinned by
  // lib/guards/booking-visibility-honest.test.ts) — which is exactly why the
  // conversation has to carry the signal.
  try {
    const pending = await getPendingIncomingBookingCount();
    if (pending > 0) {
      const tBookings = await getTranslations("bookings");
      lines.push(`${tBookings("pendingLink")} — ${tBookings("pendingNote")}`);
      addChip("offers", t("chipOffers"));
    }
  } catch {
    /* no line — a failed read never invents an offer */
  }

  // 1 ── new matching opportunities ────────────────────────────────────────
  try {
    const view = await loadWorkerOpportunityMatches({
      surface: "conversation",
      limit: 1,
    });
    if (view.kind === "ready" && view.capabilities.boardAvailable) {
      const fresh = view.newCount > 0 ? view.newCount : 0;
      const total = view.totalRecommendable;
      if (fresh > 0) {
        lines.push(t("briefNewMatches", { count: fresh }));
        addChip("jobs", t("chipJobs"));
      } else if (total > 0) {
        lines.push(t("briefMatches", { count: total }));
        addChip("jobs", t("chipJobs"));
      }
    }
  } catch {
    /* no line — never a fabricated one */
  }

  // 2 ── calendar conflicts / overdue, and 3 ── unlogged work ──────────────
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const range = visibleRange("agenda", todayIso);
    const planning = await getPlanning({ rangeStart: range.start, rangeEnd: range.end });
    if (planning.status === "ok") {
      const ctx = buildWorkContext(planning.items, todayIso);
      if (ctx.conflictCount > 0 && lines.length < MAX_LINES) {
        lines.push(t("briefConflicts", { count: ctx.conflictCount }));
        addChip("agenda", t("chipAgenda"));
      } else if (ctx.overdueTasks.length > 0 && lines.length < MAX_LINES) {
        lines.push(t("briefOverdue", { count: ctx.overdueTasks.length }));
        addChip("agenda", t("chipAgenda"));
      }
      if (
        ctx.hasAcceptedBookingToday &&
        !ctx.hasJournalEntryToday &&
        lines.length < MAX_LINES
      ) {
        lines.push(t("briefLogToday"));
        addChip("logwork", t("chipLogWork"));
      }
    }
  } catch {
    /* no line */
  }

  // 3b ── unread human messages (owner audit §4.4/§8: with the tab row gone,
  // Messages is a conversation-driven projection — the brief is where a real
  // unread thread announces itself, with the one chip that opens it).
  try {
    if (lines.length < MAX_LINES) {
      const unread = await getUnreadConversationCount();
      if (unread > 0) {
        lines.push(t("briefUnreadMessages", { count: unread }));
        addChip("link:/dashboard/communication", t("navMessages"));
      }
    }
  } catch {
    /* no line */
  }

  // 3b ── documents: expiring, or missing for the person's OWN stated
  // countries (owner contract 2026-09-04 §4D/§14 — attention from real
  // canonical state). The SAME derivation the chat answers "kas baigia
  // galioti?" with; no country stated → no missing line (the chat asks,
  // the brief never guesses). The chip is the same documents-centre answer.
  try {
    if (lines.length < MAX_LINES) {
      const { loadWorkerDocumentGap } = await import("@/lib/conversation/documents-gap-server");
      const docs = await loadWorkerDocumentGap();
      if (docs.kind === "ok") {
        if (docs.gap.expiring.length > 0) {
          lines.push(t("briefDocumentsExpiring", { count: docs.gap.expiring.length }));
          addChip("documents-centre", t("documentsChip"));
        } else if (docs.gap.missing.length > 0 && docs.countries.length > 0) {
          lines.push(t("briefDocumentsMissing", { count: docs.gap.missing.length }));
          addChip("documents-centre", t("documentsChip"));
        }
      }
    }
  } catch {
    /* no line — a failed read never invents a document gap */
  }

  // 4 ── the first missing profile step ────────────────────────────────────
  // ── learner identity (M10, second half — FINAL COMPLETION Train G2) ──
  // A person enrolled with a training provider (an ACTIVE engagement whose
  // relationship is `student`, the slug the institution↔learner invitation
  // establishes as DATA, never a third base identity) greeted only with
  // worker copy could not tell that the product knew where they study or
  // that their practice counts as evidence. One line names the institution;
  // the chip is the SAME journal starter — learning and practice are logged
  // exactly like work, and become the same evidence and capabilities.
  try {
    if (lines.length < MAX_LINES) {
      const engagements = await listMyEngagements();
      const learner = engagements.find((e) => e.relationshipSlug === "student");
      if (learner) {
        lines.push(
          learner.organizationName
            ? t("briefLearner", { organization: learner.organizationName })
            : t("briefLearnerUnnamed"),
        );
        addChip("logwork", t("chipLogLearning"));
      }
    }
  } catch {
    /* no line — a failed read never invents an enrolment */
  }

  try {
    if (lines.length < MAX_LINES) {
      const summary = await loadProfileSummaryForChat("resume");
      if (summary.kind === "summary" && summary.missing.length > 0) {
        lines.push(t("briefProfileGap", { step: summary.missing[0] }));
        const mapped = summary.missingKeys
          .map((step) => CHIP_FOR_STEP[step])
          .find((id): id is string => Boolean(id));
        if (mapped) addChip(`f:${mapped.replace(/^f:/, "")}`, t("chipProfile"));
        else addChip("profile", t("chipProfile"));
      }
    }
  } catch {
    /* no line */
  }

  if (lines.length === 0) return { kind: "none" };
  return { kind: "brief", lines: lines.slice(0, MAX_LINES), chips };
}

/**
 * THE EMPLOYER OPENING BRIEF (V8 employer daily loop, GAP 1).
 *
 * The 2026-08-13 audit measured the employer's first screen as a greeting
 * plus three HIRING chips — the state-aware brief was worker-only by a
 * one-line gate, with the comment "the worker reads would be the wrong
 * audience". Correct comment, wrong conclusion: the fix is an employer
 * brief over EMPLOYER reads, not silence.
 *
 * Priority ladder — the manager's morning, most-blocking first:
 *   1. work entries awaiting YOUR review   → people are blocked on you
 *   2. absence requests awaiting decision  → people are blocked on you
 *   3. workers absent today                → today's plan may be short-handed
 *   4. unread human messages               → someone wrote to you
 *
 * Same contract as the worker brief: at most three lines, at most three
 * chips, every line a count from rows the caller may already read, a failed
 * read contributes NOTHING, and an empty brief returns `none` so the
 * greeting stands honestly on its own. Recruitment deliberately does not
 * appear here — hiring is episodic; the daily loop is the product.
 */
export async function loadEmployerOpeningBrief(): Promise<OpeningBrief> {
  const t = await getTranslations("conversation.chat");

  const lines: string[] = [];
  const chips: OpeningChip[] = [];
  const seenChip = new Set<string>();
  const addChip = (id: string, label: string) => {
    if (chips.length >= MAX_CHIPS || seenChip.has(id)) return;
    seenChip.add(id);
    chips.push({ id, label });
  };

  // 0 ── ATTENTION for the workspace's OTHER capabilities (owner contract
  // 2026-09-04 §4D: "client has not confirmed", "offer awaiting decision",
  // "learner invitation pending"). An agency's daily loop IS its clients and
  // offers; an institution's IS its learners. Same rules: real counts from
  // rows the caller may already read, each read in its own try, nothing
  // invented. The capability flags come from the ONE starter-context read.
  try {
    const { loadCompanyStarterContext } = await import("@/lib/conversation/starter-signals");
    const ws = await loadCompanyStarterContext();
    if (ws.signals.staffingAgency) {
      const { listAgencyOfferProgress, listSharedRequestsForAgency } = await import("@/lib/agency/bridge-read");
      const [progress, shared] = await Promise.all([listAgencyOfferProgress(), listSharedRequestsForAgency()]);
      if (progress.kind === "ok") {
        const awaiting = progress.rows.filter((r) => r.offerStatus === "offered").length;
        if (awaiting > 0 && lines.length < MAX_LINES) {
          lines.push(t("briefAgencyOffersAwaiting", { count: awaiting }));
          addChip("agency:progress", t("chipProposalStatus"));
        }
        if (shared.kind === "ok") {
          const offeredFor = new Set(progress.rows.map((r) => r.requestId));
          const withoutOffer = shared.rows.filter((s) => s.status !== "closed" && !offeredFor.has(s.requestId)).length;
          if (withoutOffer > 0 && lines.length < MAX_LINES) {
            lines.push(t("briefAgencySharedWithoutOffer", { count: withoutOffer }));
            addChip("agency:demand", t("chipClientDemand"));
          }
        }
      }
      const pendingClients = ws.signals.facts.clientConnectionsPending ?? 0;
      if (pendingClients > 0 && lines.length < MAX_LINES) {
        lines.push(t("briefAgencyClientsPending", { count: pendingClients }));
      }
    }
    if (ws.signals.capabilities.includes("training_provider") && ws.organizationId) {
      const { readInstitutionLearners } = await import("@/lib/education/institution-learners");
      const learners = await readInstitutionLearners(ws.organizationId);
      if (learners.status === "ok" && learners.counts.pending > 0 && lines.length < MAX_LINES) {
        lines.push(t("briefEduLearnerInvitesPending", { count: learners.counts.pending }));
        addChip("link:/dashboard/network?relationship=student", t("chipInviteStudent"));
      }
    }
    // Candidates who raised a hand on the company's OWN demands and are
    // still waiting for an answer (interest signals not yet acknowledged —
    // the same read the candidates screen counts with). The chip is the
    // in-chat candidates answer, never a route out of the workspace.
    if (lines.length < MAX_LINES) {
      const { listPendingInterestCountsForCompany } = await import("@/lib/opportunities/interest");
      const pending = await listPendingInterestCountsForCompany();
      let waiting = 0;
      for (const n of pending.values()) waiting += n;
      if (waiting > 0) {
        lines.push(t("briefEmployerInterestWaiting", { count: waiting }));
        addChip("candidates", t("chipInterestOnMyNeeds"));
      }
    }
  } catch {
    /* no line — a failed read never invents attention */
  }

  // 1 ── work entries awaiting review ──────────────────────────────────────
  try {
    const { fetchQuickReviewQueue } = await import("@/lib/journal/review-queue");
    const queue = await fetchQuickReviewQueue();
    if (queue.length > 0) {
      lines.push(t("briefEmployerJournalReviews", { count: queue.length }));
      addChip("link:/dashboard/inbox", t("chipEmployerInbox"));
    }
  } catch {
    /* no line — a failed read never invents a queue */
  }

  // 2 ── absence requests awaiting decision ────────────────────────────────
  try {
    const { getManagerPendingAbsences } = await import("@/lib/leave/absences");
    const pending = await getManagerPendingAbsences();
    if (pending.applied && pending.pending.length > 0 && lines.length < MAX_LINES) {
      lines.push(t("briefEmployerPendingAbsences", { count: pending.pending.length }));
      addChip("link:/dashboard/absences", t("chipEmployerAbsences"));
    }
  } catch {
    /* no line */
  }

  // 3 ── workers absent today ──────────────────────────────────────────────
  try {
    const { getEmployerWorkerAvailability, absentOn } = await import(
      "@/lib/planning/employer-availability"
    );
    const availability = await getEmployerWorkerAvailability();
    if (availability.status === "ok" && lines.length < MAX_LINES) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const absent = absentOn(todayIso, availability.unavailability);
      if (absent.length > 0) {
        lines.push(t("briefEmployerAbsentToday", { count: absent.length }));
        addChip("link:/dashboard/absences", t("chipEmployerAbsences"));
      }
    }
  } catch {
    /* no line */
  }

  // 4 ── unread human messages ─────────────────────────────────────────────
  try {
    if (lines.length < MAX_LINES) {
      const unread = await getUnreadConversationCount();
      if (unread > 0) {
        lines.push(t("briefUnreadMessages", { count: unread }));
        addChip("link:/dashboard/communication", t("navMessages"));
      }
    }
  } catch {
    /* no line */
  }

  if (lines.length === 0) return { kind: "none" };
  return { kind: "brief", lines: lines.slice(0, MAX_LINES), chips };
}
