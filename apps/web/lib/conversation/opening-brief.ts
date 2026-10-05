"use server";

import "server-only";
import { listAttentionInstructions } from "@/lib/instructions/instructions";

import { getTranslations } from "next-intl/server";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import { buildWorkContext } from "@/lib/conversation/context-intelligence";
import { loadProfileSummaryForChat } from "@/lib/conversation/profile-summary";
import { CHIP_FOR_STEP } from "@/lib/conversation/worker-activity-chips";
import { listMyEngagements } from "@/lib/invitations/network";
import { listInvitationsAddressedToMe } from "@/lib/invitations/attention";
import type { WorkerDocumentGapResult } from "@/lib/conversation/documents-gap-server";
import {
  DOCUMENT_GAP_LINE_CAP,
  groupMissingDocumentsByType,
} from "@/lib/conversation/documents-gap";
import { getUnreadConversationIdsResult } from "@/lib/communication/unread";
import { getUnreadConversationIdsForOrganizationResult } from "@/lib/communication/organization-scope";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { readPendingIncomingBookingCount } from "@/lib/booking/booking-actions";
import { loadOwnRecentConfirmations } from "@/lib/journal/own-recent-confirmations";
import { getOwnWorkerId } from "@/lib/projects/worker-project-access";

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

/** The person-brief sources whose read can fail independently (SEP-7). */
export type PersonBriefSource =
  | "bookings"
  | "invitations"
  | "documents"
  | "opportunities"
  | "calendar"
  | "instructions"
  | "confirmations"
  | "unread"
  | "learner"
  | "profile";

/** Same three outcomes as the employer brief: none / brief(+unknown) / unknown. */
export type PersonOpeningBriefResult =
  | {
      kind: "brief";
      lines: string[];
      chips: OpeningChip[];
      unknown: readonly PersonBriefSource[];
      unknownNote: string | null;
    }
  | { kind: "none" }
  | { kind: "unknown"; unknown: readonly PersonBriefSource[]; unknownNote: string };

/**
 * The employer sources whose read can fail independently. A failed source is
 * NAMED here instead of vanishing: UNKNOWN is not ZERO (SEP-7).
 */
export type EmployerBriefSource =
  | "workspace"
  | "agency"
  | "learners"
  | "agency-offers"
  | "interest"
  | "bookings"
  | "journal-reviews"
  | "learning-review"
  | "absences"
  | "availability"
  | "unread";

/**
 * The employer brief with the failure told apart from the all-clear.
 *   brief    at least one line; `unknown` lists sources that could NOT be read
 *            (the lines are true, the list is not necessarily complete)
 *   none     EVERY source answered and none had anything — the only state in
 *            which "nothing is waiting" may be said
 *   unknown  no line, and at least one source could not be read — NOT "none"
 */
export type EmployerOpeningBriefResult =
  | {
      kind: "brief";
      lines: string[];
      chips: OpeningChip[];
      unknown: readonly EmployerBriefSource[];
      /** Set exactly when `unknown` is non-empty: the sentence that says so. */
      unknownNote: string | null;
    }
  | { kind: "none" }
  | { kind: "unknown"; unknown: readonly EmployerBriefSource[]; unknownNote: string };

/**
 * The worker-brief rungs a caller may ask to leave out because the SAME
 * screen already states them. The one caller today is the worker's home:
 * ŠIANDIEN renders the booking offers, invitations and unread messages as
 * doors, the matches as its opportunity line and the next step from the
 * work-card engine (`TODAY_COVERED_BRIEF_RUNGS`, lib/today/today-route.ts),
 * so the brief under it says only what ŠIANDIEN does not.
 */
export type OpeningBriefRung = "bookings" | "invitations" | "matches" | "unread" | "profile-gap";

export type OpeningBriefOptions = {
  readonly omit?: readonly OpeningBriefRung[];
};

const OMITTABLE_RUNGS: ReadonlySet<string> = new Set<OpeningBriefRung>([
  "bookings",
  "invitations",
  "matches",
  "unread",
  "profile-gap",
]);

/** The caller's omit list, from a client — only known rung names count. */
function omittedRungs(options: OpeningBriefOptions | undefined): ReadonlySet<string> {
  const omit = options?.omit;
  if (!Array.isArray(omit)) return new Set();
  return new Set(omit.filter((r): r is OpeningBriefRung => OMITTABLE_RUNGS.has(r)));
}

const MAX_LINES = 3;
const MAX_CHIPS = 3;

export async function loadOpeningBrief(options?: OpeningBriefOptions): Promise<OpeningBrief> {
  // Historical shape, kept for its callers; the honest reader is the same body.
  const result = await loadOpeningBriefResult(options);
  return result.kind === "brief"
    ? { kind: "brief", lines: result.lines, chips: result.chips }
    : { kind: "none" };
}

export async function loadOpeningBriefResult(options?: OpeningBriefOptions): Promise<PersonOpeningBriefResult> {
  const t = await getTranslations("conversation.chat");
  const unknown = new Set<PersonBriefSource>();
  // Omitting only ever REMOVES a line from the caller's own brief: every read
  // below is still the caller's own, so the list is never an authority.
  const omitted = omittedRungs(options);

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
    let pending = 0;
    if (!omitted.has("bookings")) {
      const read = await readPendingIncomingBookingCount();
      if (read.status === "ok") pending = read.count;
      else unknown.add("bookings");
    }
    if (pending > 0) {
      const tBookings = await getTranslations("bookings");
      lines.push(`${tBookings("pendingLink")} — ${tBookings("pendingNote")}`);
      addChip("offers", t("chipOffers"));
    }
  } catch {
    /* no line — a failed read never invents an offer, and is never "none" */
    unknown.add("bookings");
  }

  // 0a ── an invitation addressed to THIS person (owner contract §4D: someone
  // is waiting on you; §15 the learner's invitation, §9 the employer's).
  // Transactional e-mail is an owner gate — until it opens, this line is how
  // a signed-in person learns they were invited at all. The ONE domain read
  // (lib/invitations/attention: the network page's canonical invitations +
  // the dashboard card's roster invitations, pending, the caller's verified
  // e-mail); the chip opens the in-chat decision over the SAME accept those
  // pages call. Names the inviter when known, never invents one.
  try {
    if (lines.length < MAX_LINES && !omitted.has("invitations")) {
      const inv = await listInvitationsAddressedToMe();
      if (inv.status === "ok" && inv.total > 0) {
        const first = inv.items[0];
        lines.push(t("briefInvitations", { count: inv.total, who: first.organizationName ?? first.inviterName ?? t("invitationSomeone") }));
        addChip("invitations", t("chipInvitations"));
      } else if (inv.status === "error") {
        unknown.add("invitations");
      }
    }
  } catch {
    /* no line — a failed read never invents an invitation, and is never "none" */
    unknown.add("invitations");
  }

  // 0b ── a document about to expire (owner contract 2026-09-04 §4D/§14).
  // A deadline on the person's OWN papers outranks every passive line below
  // (prod walk 2026-09-04: with the cap at three, a documents line placed
  // after matches / unlogged work / unread never reached an active worker).
  // The SAME derivation the chat answers "kas baigia galioti?" with; the
  // chip is the same documents-centre answer. Read once, reused below.
  let docGap: WorkerDocumentGapResult | null = null;
  try {
    const { loadWorkerDocumentGap } = await import("@/lib/conversation/documents-gap-server");
    docGap = await loadWorkerDocumentGap();
    if (docGap.kind === "ok" && docGap.gap.expiring.length > 0 && lines.length < MAX_LINES) {
      lines.push(t("briefDocumentsExpiring", { count: docGap.gap.expiring.length }));
      addChip("documents-centre", t("documentsChip"));
    }
    if (docGap.kind === "unavailable") unknown.add("documents");
  } catch {
    /* no line — a failed read never invents a document gap, and is never "none" */
    unknown.add("documents");
  }

  // 1 ── new matching opportunities ────────────────────────────────────────
  try {
    const view = await loadWorkerOpportunityMatches({
      surface: "conversation",
      limit: 1,
    });
    if (view.kind === "ready" && view.capabilities.boardAvailable) {
      // 1a ── a company answered the person's OWN interest with "contacted"
      // (owner contract §4D: another human moved on something this person
      // started — it outranks a passive match count). Same read, same rows the
      // board's "Mano susidomėjimai" shows — demands still on the board.
      const contacted = Object.values(view.interestStatusByRequestId).filter((status) => status === "contacted").length;
      if (contacted > 0 && lines.length < MAX_LINES) {
        lines.push(t("briefInterestContacted", { count: contacted }));
        addChip("jobs", t("chipMyOwnInterest"));
      }
      // The match COUNT is a rung a screen may already state (ŠIANDIEN's
      // opportunity line reads the same projection); the "contacted" line
      // above is not, and stays.
      const fresh = view.newCount > 0 && !omitted.has("matches") ? view.newCount : 0;
      const total = omitted.has("matches") ? 0 : view.totalRecommendable;
      if (fresh > 0) {
        lines.push(t("briefNewMatches", { count: fresh }));
        addChip("jobs", t("chipJobs"));
      } else if (total > 0) {
        lines.push(t("briefMatches", { count: total }));
        addChip("jobs", t("chipJobs"));
      }
    }
  } catch {
    /* no line — never a fabricated one, and a failed read is never "none" */
    unknown.add("opportunities");
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
      const failedSource = Object.values(planning.sources).some(
        (src) => (src as { status?: string }).status === "error",
      );
      if (failedSource) unknown.add("calendar");
    }
  } catch {
    unknown.add("calendar");
  }

  // 3a ── work instructions waiting — a manager asked for something (e.g. a
  // readiness document, §11/§12): the canonical unread-instruction read and
  // the one chip to the instructions page. Never a count that is not real.
  try {
    if (lines.length < MAX_LINES) {
      const waiting = await listAttentionInstructions();
      if (waiting.length > 0) {
        lines.push(t("briefInstructions", { count: waiting.length }));
        addChip("link:/dashboard/instructions", t("chipInstructions"));
      }
    }
  } catch {
    unknown.add("instructions");
  }

  // 3a' ── the employer CONFIRMED this person's work (owner contract §14 —
  // WORK → EVIDENCE → EMPLOYER CONFIRMATION → VERIFIED CAPABILITY → LIVING
  // IDENTITY, read back on the PERSON's side). The line is derived from the
  // canonical evidence rows themselves (journal_entry_confirmations inside a
  // trailing window) — the SAME rows the journal list and the card derive
  // from; no parallel notification truth, no "seen" table. The chip opens
  // the one surface that shows the verified state: the person's card.
  try {
    if (lines.length < MAX_LINES) {
      const workerId = await getOwnWorkerId();
      const fresh = workerId ? await loadOwnRecentConfirmations(workerId) : null;
      if (fresh && fresh.approvedEntries > 0) {
        lines.push(t("briefWorkConfirmed", { count: fresh.approvedEntries, skills: fresh.skillsConfirmed }));
        addChip("player-card", t("chipMyCard"));
      }
    }
  } catch {
    /* no line — a failed read never invents a confirmation, and is never "none" */
    unknown.add("confirmations");
  }

  // 3b ── unread human messages (owner audit §4.4/§8: with the tab row gone,
  // Messages is a conversation-driven projection — the brief is where a real
  // unread thread announces itself, with the one chip that opens it).
  try {
    if (lines.length < MAX_LINES && !omitted.has("unread")) {
      const unreadRead = await getUnreadConversationIdsResult();
      if (unreadRead.status === "unavailable") unknown.add("unread");
      const unread = unreadRead.status === "ok" ? unreadRead.ids.size : 0;
      if (unread > 0) {
        lines.push(t("briefUnreadMessages", { count: unread }));
        addChip("link:/dashboard/communication", t("navMessages"));
      }
    }
  } catch {
    unknown.add("unread");
  }

  // 3b ── documents missing for the person's OWN stated countries. No
  // country stated → no line (the chat asks, the brief never guesses).
  //
  // NAMED, NOT COUNTED (owner window 11 §24). Production said "Trūksta 9
  // dokumentų jūsų šalims." and nothing else: not which document, not which
  // country, not whether it is required or merely conditional. The product
  // already knew all three — `deriveDocumentGap` carries `documentTypeSlug`,
  // `country` and `requirementLevel` per row, and `runDocumentsReadiness`
  // renders them — so the brief was the ONE surface throwing the answer away.
  // It now reuses the SAME `groupMissingDocumentsByType` the workflow uses
  // (one name per type, its countries beside it), so the two can never
  // disagree. `missing` never contains a `recommended` row, so naming these
  // as things the countries require is a fact, not an inference.
  try {
    if (docGap && docGap.kind === "ok" && docGap.gap.expiring.length === 0 && docGap.gap.missing.length > 0 && docGap.countries.length > 0 && lines.length < MAX_LINES) {
      const tDocs = await getTranslations("documents");
      const tLm = await getTranslations("labourMarket");
      const countryName = (code: string) =>
        tLm.has(`countryNames.${code}`) ? (tLm(`countryNames.${code}` as never) as string) : code;
      const list = groupMissingDocumentsByType(docGap.gap.missing, DOCUMENT_GAP_LINE_CAP)
        .map((g) => {
          const name = tDocs.has(`types.${g.documentTypeSlug}`)
            ? (tDocs(`types.${g.documentTypeSlug}` as never) as string)
            : g.documentTypeSlug;
          return `${name} (${g.countries.map(countryName).join(", ")})`;
        })
        .join("; ");
      lines.push(t("briefDocumentsMissing", { count: docGap.gap.missing.length, list }));
      addChip("documents-centre", t("documentsChip"));
    }
  } catch {
    unknown.add("documents");
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
    /* no line — a failed read never invents an enrolment, and is never "none" */
    unknown.add("learner");
  }

  try {
    if (lines.length < MAX_LINES && !omitted.has("profile-gap")) {
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
    unknown.add("profile");
  }

  const unknownSources = [...unknown];
  if (lines.length === 0) {
    return unknownSources.length > 0
      ? { kind: "unknown", unknown: unknownSources, unknownNote: t("briefPersonUnknown") }
      : { kind: "none" };
  }
  return {
    kind: "brief",
    lines: lines.slice(0, MAX_LINES),
    chips,
    unknown: unknownSources,
    unknownNote: unknownSources.length > 0 ? t("briefPersonUnknown") : null,
  };
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
  // Historical shape, kept for its callers: a brief or `none`. The honest
  // reader below is the same body; `unknown` collapses to `none` HERE only.
  const result = await loadEmployerOpeningBriefResult();
  return result.kind === "brief"
    ? { kind: "brief", lines: result.lines, chips: result.chips }
    : { kind: "none" };
}

export async function loadEmployerOpeningBriefResult(): Promise<EmployerOpeningBriefResult> {
  const t = await getTranslations("conversation.chat");
  const unknown = new Set<EmployerBriefSource>();

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
    // The ONE agency rule (type OR declared workforce role), as computed by
    // the starter context — never the company type alone.
    if (ws.agencyWorkspace) {
      const { listAgencyOfferProgress, listSharedRequestsForAgency } = await import("@/lib/agency/bridge-read");
      const { listAgencyPlacements } = await import("@/lib/agency/delegation-read");
      const { sharedNeedsAwaitingWorker } = await import("@/lib/agency/bridge-model");
      const [[progress, shared], placements] = await Promise.all([
        Promise.all([listAgencyOfferProgress(), listSharedRequestsForAgency()]),
        listAgencyPlacements(),
      ]);
      // A failed placements read means "needs a replacement?" cannot be told.
      if (placements.kind === "error") unknown.add("agency");
      if (progress.kind === "ok") {
        // A client's shared need whose accepted person did not start (the
        // worker declined) or whose placement ended is OPEN AGAIN: the client
        // still needs someone and this agency may propose another roster
        // worker. First, because it is the one thing that stops the client's
        // work (production walk 2026-09-29: the need stayed open and shared
        // while this Home said nothing).
        const awaitingWorker = sharedNeedsAwaitingWorker(shared, progress, placements);
        const reopened = awaitingWorker.filter((n) => n.reason === "placement_did_not_proceed");
        if (reopened.length > 0 && lines.length < MAX_LINES) {
          lines.push(t("briefAgencyNeedReopened", { count: reopened.length }));
          // The in-chat shared-needs read, where each need carries its own
          // "propose someone" action — the existing presentation path.
          addChip("agency:demand", t("chipProposeReplacement"));
        }
        const awaiting = progress.rows.filter((r) => r.offerStatus === "offered").length;
        if (awaiting > 0 && lines.length < MAX_LINES) {
          lines.push(t("briefAgencyOffersAwaiting", { count: awaiting }));
          addChip("agency:progress", t("chipProposalStatus"));
        }
        if (shared.kind === "ok") {
          const withoutOffer = awaitingWorker.filter((n) => n.reason === "no_offer").length;
          if (withoutOffer > 0 && lines.length < MAX_LINES) {
            lines.push(t("briefAgencySharedWithoutOffer", { count: withoutOffer }));
            addChip("agency:demand", t("chipClientDemand"));
          }
        } else if (shared.kind === "error") {
          unknown.add("agency");
        }
      } else if (progress.kind === "error") {
        unknown.add("agency");
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
      } else if (learners.status === "unavailable") {
        unknown.add("learners");
      }
    }
    // Agency offers on the company's OWN demands still awaiting the client's
    // decision — the other side of the agency's "offers awaiting" rung above.
    // The chip is the in-chat offers answer with its accept / decline chips.
    if (!ws.signals.staffingAgency && lines.length < MAX_LINES) {
      const { loadClientOffersForChat } = await import("@/lib/conversation/client-offers");
      const offers = await loadClientOffersForChat();
      if (offers.kind === "ok" && offers.offers.length > 0) {
        lines.push(t("briefEmployerAgencyOffersWaiting", { count: offers.offers.length }));
        addChip("agency-offers", t("chipAgencyOffers"));
      } else if (offers.kind === "error") {
        unknown.add("agency-offers");
      }
    }
    // Candidates who raised a hand on the company's OWN demands and are
    // still waiting for an answer (interest signals not yet acknowledged —
    // the same read the candidates screen counts with). The chip is the
    // in-chat candidates answer, never a route out of the workspace.
    if (lines.length < MAX_LINES) {
      const { readPendingInterestCountsForCompany } = await import("@/lib/opportunities/interest");
      const pending = await readPendingInterestCountsForCompany();
      if (pending.status === "ok") {
        let waiting = 0;
        for (const n of pending.counts.values()) waiting += n;
        if (waiting > 0) {
          lines.push(t("briefEmployerInterestWaiting", { count: waiting }));
          addChip("candidates", t("chipInterestOnMyNeeds"));
        }
      } else if (pending.status === "unavailable") {
        // no-company-context / needs-migration: nothing CAN be waiting — not a failure.
        unknown.add("interest");
      }
    }
    // Workers who ANSWERED the company's own booking proposals — accepted or
    // declined — since the bookings surface was last opened (or inside the
    // last 14 days when it never was). Prod walk 2026-09-05: a worker's
    // decline in the chat left the employer's next greeting silent. Same
    // read the bookings badge uses; the caller's own moves never count.
    if (lines.length < MAX_LINES) {
      const { readBookingResponsesNewCount } = await import("@/lib/booking/booking-actions");
      const answered = await readBookingResponsesNewCount({ fallbackDays: 14 });
      if (answered.status === "unavailable") {
        unknown.add("bookings");
      } else if (answered.count > 0) {
        lines.push(t("briefEmployerBookingResponses", { count: answered.count }));
        addChip("link:/dashboard/bookings", t("chipEmployerBookings"));
      }
    }
  } catch {
    /* no line — a failed read never invents attention, and is never "nothing" */
    unknown.add("workspace");
  }

  // 1 ── work entries awaiting review ──────────────────────────────────────
  try {
    const { readQuickReviewQueueResult } = await import("@/lib/journal/review-queue");
    const queue = await readQuickReviewQueueResult();
    if (queue.status === "unavailable") {
      unknown.add("journal-reviews");
    } else if (queue.status === "ok" && queue.entries.length > 0) {
      lines.push(t("briefEmployerJournalReviews", { count: queue.entries.length }));
      addChip("link:/dashboard/inbox", t("chipEmployerInbox"));
    }
  } catch {
    /* no line — a failed read never invents a queue, and is never "nothing" */
    unknown.add("journal-reviews");
  }

  // 1a ── learning suggestions awaiting review (EDU-5) ─────────────────────
  // A worker accepted a recognised skill on an entry of THIS organisation
  // (review enabled). The one producer turns that observation into a pending
  // suggestion under the manager's own RLS; the line states only the count of
  // pending ones and appears only when there is one, with the one door to
  // the review page (owner: no count without a door, no door without a count).
  try {
    if (lines.length < MAX_LINES) {
      const { createClient } = await import("@/lib/supabase/server");
      const { produceReviewQueueFromSignals, readPendingReviewQueue } = await import(
        "@/lib/learning/signal-queue-producer"
      );
      const sb = await createClient();
      await produceReviewQueueFromSignals(sb);
      const pendingRead = await readPendingReviewQueue(sb);
      if (pendingRead.status === "unavailable") unknown.add("learning-review");
      const waiting = pendingRead.status === "ok" ? pendingRead.count : 0;
      if (waiting > 0) {
        lines.push(t("briefEmployerLearningReview", { count: waiting }));
        // The door exists ONLY in this N>0 state, so it is never empty
        // navigation: the review page then has real items to show.
        addChip("link:/dashboard/learning", t("chipEmployerLearningReview"));
      }
    }
  } catch {
    /* no line — a failed read never invents a queue, and is never "nothing" */
    unknown.add("learning-review");
  }

  // 2 ── absence requests awaiting decision ────────────────────────────────
  try {
    const { readManagerPendingAbsences } = await import("@/lib/leave/absences");
    const pending = await readManagerPendingAbsences();
    if (pending.status === "unavailable") {
      unknown.add("absences");
    } else if (pending.status === "ok" && pending.pending.length > 0 && lines.length < MAX_LINES) {
      lines.push(t("briefEmployerPendingAbsences", { count: pending.pending.length }));
      addChip("link:/dashboard/absences", t("chipEmployerAbsences"));
    }
  } catch {
    unknown.add("absences");
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
    } else if (availability.status === "error") {
      // "unavailable" = the leave model is not applied yet: nobody CAN be absent.
      unknown.add("availability");
    }
  } catch {
    unknown.add("availability");
  }

  // 4 ── unread human messages ─────────────────────────────────────────────
  // SCOPED TO THE COMPANY (owner 2026-10-01): a person's private threads are
  // not their company's inbox. Only the unread conversations that belong to
  // the organization acted for are counted; with no resolvable company there
  // is nothing to count, never the person's whole inbox.
  try {
    if (lines.length < MAX_LINES) {
      const ctx = await resolveEmployerCompanyContext();
      // No resolvable company → nothing to count (not a failure). A scope or
      // unread read that FAILED is UNKNOWN, never "no unread".
      let unread = 0;
      if (ctx.kind === "ok") {
        const scoped = await getUnreadConversationIdsForOrganizationResult(ctx.companyId);
        if (scoped.status === "ok") unread = scoped.ids.size;
        else unknown.add("unread");
      }
      if (unread > 0) {
        lines.push(t("briefUnreadMessages", { count: unread }));
        addChip("link:/dashboard/communication", t("navMessages"));
      }
    }
  } catch {
    unknown.add("unread");
  }

  const unknownSources = [...unknown];
  if (lines.length === 0) {
    return unknownSources.length > 0
      ? { kind: "unknown", unknown: unknownSources, unknownNote: t("briefEmployerUnknown") }
      : { kind: "none" };
  }
  return {
    kind: "brief",
    lines: lines.slice(0, MAX_LINES),
    chips,
    unknown: unknownSources,
    unknownNote: unknownSources.length > 0 ? t("briefEmployerUnknown") : null,
  };
}
