import "server-only";

/**
 * DOMAIN EVENT EMITTERS — the glue between a completed domain write and the
 * durable notification store.
 *
 * Every function here:
 *   - runs with the ADMIN client (the table grants authenticated no INSERT);
 *   - is called AFTER the domain RPC succeeded and is AWAITED end to end at
 *     every WRITE-PATH call site (see SERVERLESS DELIVERY below);
 *   - resolves the RECIPIENT from FACTS the write path hands over — read by
 *     the caller, under the caller's OWN session, from the row the caller
 *     just wrote (the RPC's return or a caller-scoped select). Never from
 *     browser input, and never through an admin read of a domain table (see
 *     SERVICE_ROLE GRANT TRUTH below);
 *   - never throws — so awaiting one can never fail the domain write it
 *     follows. Every failure collapses to a greppable console marker AND a
 *     returned `NotificationEmitResult`, so a caller can tell delivered from
 *     not without a database.
 *
 * SERVICE_ROLE GRANT TRUTH (verified on production 2026-09-23 through
 * information_schema.role_table_grants, grantee = 'service_role'). Production
 * deliberately allowlists service_role table grants. The notification spine
 * holds exactly: notification_events INSERT/SELECT/UPDATE,
 * notification_preferences SELECT, workers SELECT, journal_entries SELECT
 * (and company_memberships, unrelated). It holds NOTHING on booking_requests,
 * company_worker_engagements, work_tasks, worker_absences, companies,
 * demand_interest_signals, customer_requests, invitations or profiles.
 *
 * Until 2026-09-23 the booking, engagement (created + ended), task and
 * absence emitters opened with an admin read of exactly those ungranted
 * tables; PostgREST answered 42501, `maybeSingle()` surfaced it as a null
 * row, and every one of them logged `row_unreadable` and delivered nothing —
 * the same class as the demand-interest silence closed by #1761. The
 * CORRECTION to migration 20260908070000's comment (which may not be edited:
 * applied files are frozen): the `workers` grant did NOT repair the booking
 * and absence emitters, because their FIRST read was the domain row, not the
 * worker. The fix grants nothing: the write path reads its own row and hands
 * the facts over. The only admin reads left in the write-path emitters are
 * `workers` (granted), the recipient's preferences (granted) and the event
 * insert (granted). `lib/guards/notification-emitters-carry-facts.test.ts`
 * pins this module off the ungranted tables.
 *
 * SERVERLESS DELIVERY (2026-08-31, TRAIN 10). These emitters were written
 * fire-and-forget for a server that outlives the response. On Vercel's
 * serverless runtime the invocation can be FROZEN the instant the action
 * returns, killing a detached insert mid-flight — which is exactly what made
 * the live `demand_interest_expressed` emitter deliver NOTHING in production
 * (only backfill rows existed). Every write-path emitter therefore awaits its
 * insert(s) through `emitNotificationEvent` and its call site awaits the
 * emitter. The ONLY detached emitters left are the three READ-TIME ones at the
 * bottom (document_expiring ×2, weekly_digest): they are re-derived on every
 * page visit and deduped by the store's UNIQUE (recipient, dedupe_key), so a
 * killed insert self-heals on the next visit instead of losing a fact — and an
 * await there would tax a read path for no durability gain.
 *
 * RECIPIENT DECISIONS, STATED (v1):
 *   booking_proposed    → the WORKER the employer proposed to.
 *   booking_accepted    → the booking OWNER (employer) — the worker acted.
 *   booking_declined    → the booking OWNER (employer).
 *   engagement_created  → BOTH parties: a new engagement changes both diaries.
 *   absence_requested   → the WORKER, only when someone ELSE filed it for
 *                         them. The manager-side "requests awaiting review"
 *                         signal stays with the derived spine count
 *                         (pending-absence-reviews) — that is the correct
 *                         shape for "N need attention now", and duplicating
 *                         it durably per-manager would need an org-membership
 *                         fan-out this v1 deliberately does not attempt.
 *   absence_approved /
 *   absence_rejected    → the WORKER (and the requester, if different) — the
 *                         exact "outcome the offline worker never learns
 *                         about" gap the durable store exists to close.
 *   demand_interest_expressed
 *                       → the DEMAND OWNER (v5) — the same gap on the
 *                         employer side; never the worker who acted.
 *   demand_interest_reviewed
 *                       → the WORKER who raised their hand (v5) — the return
 *                         direction, so the smaller party is not the one left
 *                         guessing. Never the person who did the answering.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_EXPIRING_WINDOW_DAYS } from "@/lib/config/documents";
import {
  emitNotificationEvent,
  emitNotificationEventInBackground,
  isNotificationStoreWriteBlocked,
  type NotificationEventInput,
  type NotificationEventType,
} from "./events";
import {
  hasCurrentWeekDigest,
  weeklyDigestEntityId,
  type WeeklyDigestSkipRow,
} from "./weekly-digest-emitter";
import {
  readNotificationPreferencesFor,
  resolveChannelEnabled,
  type NotificationPreferenceRow,
} from "./notification-preferences";
import { maybeDispatchNotificationEmail } from "./email-dispatch";
import { deterministicEntityId } from "./deterministic-entity-id";
import { isoWeekKey } from "../worker/weekly-intelligence-model";
import { getWorkerCoreRow } from "../data/worker-core";
import { getWorkerJobRecommendations } from "@/lib/opportunities/recommendations";
import { getWeeklyPersonalIntelligence } from "../worker/weekly-intelligence";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * ONE greppable marker for "the domain write happened and the recipient was
 * not told" — the generic sibling of `INTEREST_UNDELIVERED` below, which
 * production proved was needed: without a marker, a permanent delivery
 * failure is indistinguishable from success anywhere outside the database.
 * Carries the EVENT TYPE and a bounded reason only — never free text, ids,
 * payloads or people. Approved silences (self-assignment, self-ack,
 * `duplicate`, `feature_unavailable`) deliberately do NOT come through here,
 * so a hit is always something to look at.
 */
export const NOTIFICATION_UNDELIVERED = "[notifications] recipient not told";

function notDelivered(
  eventType: string,
  reason: string,
  detail?: string,
): void {
  console.warn(
    NOTIFICATION_UNDELIVERED,
    detail ? { eventType, reason, detail } : { eventType, reason },
  );
}

/**
 * The recipient's stored preference rows, FAIL-OPEN (completion v1): if the
 * preferences table cannot be read — absent, degraded, anything — this
 * returns NO rows, and `resolveChannelEnabled` then applies the channel
 * defaults (in-app ON, email OFF). A preferences outage must never silently
 * kill notifications; only an explicit stored opt-out may.
 */
async function readPrefRowsFailOpen(
  admin: AdminClient,
  recipientProfileId: string,
): Promise<readonly NotificationPreferenceRow[]> {
  const prefs = await readNotificationPreferencesFor(admin, recipientProfileId);
  return prefs.kind === "ok" ? prefs.rows : [];
}

/** What `deliver` did — the cron route reports these honestly. */
type DeliverOutcome =
  | "written"
  | "duplicate"
  | "feature_unavailable"
  /** Store present, writer unprivileged (42501) — skipped for a bounded
   *  window, not retried (Lane H 2026-09-06; owner GRANT pending, #1566). */
  | "write_blocked"
  | "unexpected_error"
  /** The recipient stored an explicit in-app opt-out for this type. */
  | "suppressed_preference";

/**
 * Why a write-path emitter did not deliver. The LOGGED reasons are real
 * misses (the marker fires); the rest are approved silences or named
 * degradations that stay quiet, exactly as before — a marker that fires on
 * correct behaviour is one everybody learns to ignore.
 */
export type NotificationUndeliveredReason =
  /** LOGGED — the facts named nobody to tell (null id, unresolvable worker). */
  | "recipient_unresolved"
  /** LOGGED — the store refused the row with a code that is not a known state. */
  | "insert_failed"
  /** LOGGED — the emitter threw; the domain write is already committed. */
  | "threw"
  /** LOGGED — the demand-interest write path handed over no signal id. */
  | "signal_unreadable"
  /** LOGGED — the gated owner RPC named no demand owner. */
  | "owner_unresolved"
  /** Approved silence: the actor is the only recipient (self-assignment,
   *  self-interest, an absence the worker filed for themselves). */
  | "self_action"
  /** Approved silence: the recipient stored an in-app opt-out. */
  | "suppressed_preference"
  /** Approved silence: this event type does not carry this status. */
  | "not_applicable"
  /** Named degradation: the store is not applied here. */
  | "feature_unavailable"
  /** Named degradation: the writer is unprivileged (42501 window). */
  | "write_blocked";

/**
 * What a write-path emitter tells its caller. `delivered: true` means a row
 * for at least one recipient is in the store — written now, or already
 * there from an earlier identical emit (`duplicate`, the UNIQUE dedupe key).
 * Anything else says WHY, with a bounded reason and never a person. Callers
 * may ignore it (the domain write already succeeded); tests and the cron
 * route read it.
 */
export type NotificationEmitResult =
  | {
      readonly delivered: true;
      readonly outcome: "written" | "duplicate";
      /** Distinct recipients that now hold a row. */
      readonly recipients: number;
    }
  | { readonly delivered: false; readonly reason: NotificationUndeliveredReason };

/** One `deliver` outcome, as a result. */
function resultFromOutcome(outcome: DeliverOutcome): NotificationEmitResult {
  if (outcome === "written" || outcome === "duplicate") {
    return { delivered: true, outcome, recipients: 1 };
  }
  if (outcome === "unexpected_error") return { delivered: false, reason: "insert_failed" };
  return { delivered: false, reason: outcome };
}

/** Several recipients of one fact: delivered when ANY of them holds a row;
 *  otherwise the first recipient's reason (they fail alike). */
function combineResults(
  results: readonly NotificationEmitResult[],
  eventType: string,
): NotificationEmitResult {
  const held = results.filter((r) => r.delivered);
  if (held.length > 0) {
    return {
      delivered: true,
      outcome: held.some((r) => r.delivered && r.outcome === "written")
        ? "written"
        : "duplicate",
      recipients: held.length,
    };
  }
  const first = results[0];
  if (!first) {
    notDelivered(eventType, "recipient_unresolved");
    return { delivered: false, reason: "recipient_unresolved" };
  }
  return first;
}

/** The named-and-logged miss, as a result — one call, one marker. */
function undeliveredResult(
  eventType: string,
  reason: Extract<
    NotificationUndeliveredReason,
    "recipient_unresolved" | "threw"
  >,
  detail?: string,
): NotificationEmitResult {
  notDelivered(eventType, reason, detail);
  return { delivered: false, reason };
}

/**
 * The AWAITED insert every write-path emitter rides. A detached insert is
 * killable on the serverless runtime (see the module header); this one is
 * awaited end to end and reports the only unapproved outcome. It cannot
 * throw: `emitNotificationEvent` catches everything into its outcome union.
 *
 * Completion v1 adds the two channel hops around the insert:
 *   - BEFORE: the recipient's stored in-app preference (M5 closure). The
 *     default stays ON (opt-out model); only an explicit stored opt-out row
 *     suppresses, and an unreadable preferences table FAILS OPEN (see
 *     `readPrefRowsFailOpen`) — deliver anyway.
 *   - AFTER a successful insert: the email dispatcher (M6 preparation).
 *     Consent-first (email default OFF) and env-inert: it becomes live
 *     automatically the moment the owner configures a real email provider —
 *     that is the design intent, no further code change needed. Its every
 *     failure collapses to a tagged outcome; it can never fail the insert
 *     that already happened.
 */
async function deliver(
  admin: AdminClient,
  input: NotificationEventInput,
): Promise<DeliverOutcome> {
  // The store refused the last write (42501): the preference read only
  // exists to feed the insert, so neither runs while the block holds.
  if (isNotificationStoreWriteBlocked()) return "write_blocked";
  const prefRows = await readPrefRowsFailOpen(admin, input.recipientProfileId);
  if (!resolveChannelEnabled(prefRows, input.eventType, "in_app")) {
    // APPROVED silence: the recipient turned this type off themselves.
    return "suppressed_preference";
  }
  const outcome = await emitNotificationEvent(admin, input);
  if (outcome.kind === "unexpected_error") {
    // `duplicate` and `feature_unavailable` are approved outcomes and stay
    // quiet; this line only fires on something real.
    notDelivered(input.eventType, "insert_failed", outcome.code);
    return "unexpected_error";
  }
  if (outcome.kind === "written") {
    await maybeDispatchNotificationEmail(admin, input, prefRows);
  }
  return outcome.kind;
}

async function workerProfileId(
  admin: AdminClient,
  workerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("workers")
    .select("profile_id")
    .eq("id", workerId)
    .maybeSingle();
  return (data as { profile_id?: string } | null)?.profile_id ?? null;
}

/**
 * The facts a booking write path hands the two booking-shaped emitters. Read
 * by the CALLER from `booking_requests` under their own session right after
 * the RPC returned — `booking_requests_select` admits exactly the two parties
 * (the proposing owner and the addressed worker), which is exactly who ever
 * calls propose / respond / withdraw. service_role holds no grant on the
 * table (see SERVICE_ROLE GRANT TRUTH), so this is the ONLY honest source.
 *   - `ownerProfileId` — `owner_id`: the company-side recipient;
 *   - `workerId`       — `worker_id` (workers.id): resolved to a profile by
 *                        the emitter through `workers` (granted);
 *   - dates/country    — the safe render hints the row already carries.
 * Null fields mean the caller could not read the row; the emitter then
 * reports `recipient_unresolved` instead of guessing.
 */
export interface BookingNotificationFacts {
  readonly bookingId: string;
  readonly ownerProfileId: string | null;
  readonly workerId: string | null;
  readonly startDate: string | null;
  readonly locationCountry: string | null;
}

function bookingMetadata(facts: BookingNotificationFacts) {
  return {
    country: facts.locationCountry ?? undefined,
    startDate: facts.startDate ?? undefined,
  };
}

export type BookingNotificationEventType = Extract<
  NotificationEventType,
  "booking_proposed" | "booking_accepted" | "booking_declined" | "booking_withdrawn"
>;

/** Booking lifecycle events, from the facts the write path resolved. */
export async function emitBookingNotification(
  facts: BookingNotificationFacts,
  eventType: BookingNotificationEventType,
): Promise<NotificationEmitResult> {
  try {
    const admin = createAdminClient();
    const metadata = bookingMetadata(facts);

    // The COMPANY acts on these two — the worker is who must hear about it.
    // A withdrawn proposal is v2's first gap: the worker who saw the offer
    // otherwise finds a silently vanished row.
    if (eventType === "booking_proposed" || eventType === "booking_withdrawn") {
      const worker = facts.workerId
        ? await workerProfileId(admin, facts.workerId)
        : null;
      if (!worker) return undeliveredResult(eventType, "recipient_unresolved");
      return resultFromOutcome(
        await deliver(admin, {
          recipientProfileId: worker,
          eventType,
          entityType: "booking_request",
          entityId: facts.bookingId,
          metadata,
        }),
      );
    }

    if (!facts.ownerProfileId) {
      return undeliveredResult(eventType, "recipient_unresolved");
    }
    return resultFromOutcome(
      await deliver(admin, {
        recipientProfileId: facts.ownerProfileId,
        eventType,
        entityType: "booking_request",
        entityId: facts.bookingId,
        metadata,
      }),
    );
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded. But the
    // failure is named — a bare catch is how interest delivery died unseen.
    return undeliveredResult(
      eventType,
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/** Engagement creation — both parties hear it. Carried by the SAME booking
 *  facts the accept path already resolved (v3 accepts create the engagement
 *  in one transaction and return no engagement id). */
export async function emitEngagementCreatedNotification(
  facts: BookingNotificationFacts,
): Promise<NotificationEmitResult> {
  try {
    const admin = createAdminClient();
    const metadata = bookingMetadata(facts);
    const recipients = new Set<string>();
    if (facts.ownerProfileId) recipients.add(facts.ownerProfileId);
    const worker = facts.workerId
      ? await workerProfileId(admin, facts.workerId)
      : null;
    if (worker) recipients.add(worker);
    if (recipients.size === 0) {
      notDelivered("engagement_created", "recipient_unresolved");
      return { delivered: false, reason: "recipient_unresolved" };
    }
    const results: NotificationEmitResult[] = [];
    for (const recipientProfileId of recipients) {
      results.push(
        resultFromOutcome(
          await deliver(admin, {
            recipientProfileId,
            eventType: "engagement_created",
            entityType: "engagement",
            // v1 carries the BOOKING id as the entity: it is the row both
            // sides can already open, and the engagement id is not returned
            // by the RPC.
            entityId: facts.bookingId,
            metadata,
          }),
        ),
      );
    }
    return combineResults(results, "engagement_created");
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    return undeliveredResult(
      "engagement_created",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/**
 * Engagement END — v2's second gap. The COUNTERPARTY hears it durably; the
 * actor already watched it happen on their own screen.
 *
 * Recipient resolution mirrors the shared end action's authority model: the
 * row names both parties, and `actorSide` (server-derived by the RPC, never
 * client-supplied) says which of them acted. worker acted → the company
 * owner hears; company acted → the worker hears.
 *
 * The facts come from the END ACTION, under the actor's own session: the
 * engagement row (`company_worker_engagements_select` admits both parties)
 * and, when the worker acted, `companies.profile_id` (readable to any
 * signed-in profile). service_role holds no grant on either table — the
 * admin reads this emitter used to open with returned nothing, so no
 * counterparty ever heard an engagement end (2026-09-23, see the header).
 *
 * The rendered label stays NEUTRAL about visibility on purpose: whether the
 * company still sees the worker after the end depends on other relationships
 * (the F2 assignment branch), and this emitter has not measured that. The
 * acting surface carries the measured rider; the notification only states
 * the fact that the engagement ended.
 */
export interface EngagementEndedNotificationFacts {
  readonly engagementId: string;
  readonly actorSide: "company" | "worker";
  /** `companies.profile_id` of the engagement's company — the owner pointer
   *  `owns_company` checks first. Resolved by the caller only when the
   *  WORKER acted (the company is the recipient); null otherwise. */
  readonly companyOwnerProfileId: string | null;
  /** `worker_id` (workers.id) of the engagement; resolved to a profile by
   *  the emitter through `workers` (granted) when the COMPANY acted. */
  readonly workerId: string | null;
}

export async function emitEngagementEndedNotification(
  facts: EngagementEndedNotificationFacts,
): Promise<NotificationEmitResult> {
  try {
    const admin = createAdminClient();
    const { actorSide } = facts;
    let recipient: string | null = null;
    if (actorSide === "worker") {
      // The company owner hears — the caller read the owner pointer.
      recipient = facts.companyOwnerProfileId;
    } else if (facts.workerId) {
      recipient = await workerProfileId(admin, facts.workerId);
    }
    if (!recipient) {
      return undeliveredResult("engagement_ended", "recipient_unresolved");
    }

    return resultFromOutcome(
      await deliver(admin, {
        recipientProfileId: recipient,
        eventType: "engagement_ended",
        entityType: "engagement",
        entityId: facts.engagementId,
        metadata: {},
      }),
    );
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    return undeliveredResult(
      "engagement_ended",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/**
 * Task assignment — v4 (train D). The NEW assignee hears it durably; the
 * actor already watched the assignment happen on their own screen, so a
 * self-assignment emits nothing. The recipient comes from the TASK ROW read
 * by the caller AFTER the domain write succeeded (`wt_select` admits the
 * creator and any manager of the project — exactly who may assign) — never
 * from browser input, and never through the admin client, which holds no
 * grant on `work_tasks` (see the header).
 */
export interface WorkTaskAssignedNotificationFacts {
  readonly taskId: string;
  /** `assignee_profile_id` as STORED after the RPC, read under the actor's session. */
  readonly assigneeProfileId: string | null;
  /** The acting profile (auth.uid()) — never notified about their own act. */
  readonly actorProfileId: string;
  /** `due_at` as stored — a safe render hint. */
  readonly dueAt: string | null;
}

export async function emitWorkTaskAssignedNotification(
  facts: WorkTaskAssignedNotificationFacts,
): Promise<NotificationEmitResult> {
  try {
    const assignee = facts.assigneeProfileId;
    const actorProfileId = facts.actorProfileId;
    if (!assignee) {
      return undeliveredResult("work_task_assigned", "recipient_unresolved");
    }
    // APPROVED silence: a self-assignment needs no telling.
    if (assignee === actorProfileId) return { delivered: false, reason: "self_action" };

    const admin = createAdminClient();
    return resultFromOutcome(
      await deliver(admin, {
        recipientProfileId: assignee,
        eventType: "work_task_assigned",
        entityType: "work_task",
        entityId: facts.taskId,
        metadata: { startDate: facts.dueAt?.slice(0, 10) ?? undefined },
      }),
    );
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    return undeliveredResult(
      "work_task_assigned",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/**
 * DEMAND INTEREST — a worker raised their hand at a company's demand.
 *
 * WHY THIS IS THE ONE THAT MATTERED MOST. Production held four real
 * `demand_interest_signals` rows from 2026-07-05 and `notification_events` had
 * zero inserts ever: the marketplace's defining event was the only domain
 * write on the platform with no emitter. The demand owner learned a candidate
 * existed only by opening /dashboard/company/scouting unprompted, which is the
 * exact "outcome the offline party never learns about" gap this store exists
 * to close — here on the EMPLOYER side rather than the worker side.
 *
 * RECIPIENT: the demand owner (`customer_requests.profile_id`), read from the
 * signal's own request row, never from caller input. That is precisely the set
 * `demand_interest_signals_demand_owner_select` already admits, so this
 * notification discloses nothing the recipient could not already read.
 *
 * NOT EMITTED when the demand owner and the interested worker are the same
 * person — you do not need telling that you raised your own hand (the
 * work_task_assigned self-assignment precedent).
 *
 * METADATA: the demand's own `country`, and only when it is an ISO-3166
 * alpha-2 code. The worker's `note` is free text and never leaves the signal
 * row — a notification must be safe to render in a preview.
 *
 * AWAITED — and no longer unlike its siblings. This emitter was the FIRST to
 * await its insert end to end, because a detached insert is killable on the
 * serverless runtime (the invocation can be frozen the moment the action
 * returns) — the exact mechanism that made this event deliver nothing live.
 * TRAIN 10 (2026-08-31) extended the same fix to every write-path emitter in
 * this module: all of them now ride the awaited `deliver` helper and are
 * awaited at their call sites. It CANNOT fail the domain write because it
 * never throws: the try/catch below and `emitNotificationEvent`'s own outcome
 * union between them turn every failure into a logged outcome rather than an
 * exception.
 */
/**
 * ONE greppable marker for "a worker raised their hand and the owner was not
 * told". Production evidence (2026-08-27): five `demand_interest_signals`, two
 * `demand_interest_expressed` rows — and both of those carry a `created_at`
 * identical to their signal to the microsecond, which this emitter cannot
 * produce because it never sets `created_at`. They are backfill artifacts, so
 * the LIVE emitter has delivered nothing since it shipped, and every path by
 * which it could fail was silent. Correct suppressions (self-interest,
 * duplicate) deliberately do NOT come through here, so a hit is always
 * something to look at.
 *
 * Carries a REASON only — never the worker's free text, the ids, the payload
 * or the person.
 */
export const INTEREST_UNDELIVERED = "[notifications/interest] owner not told";

function undelivered(reason: string, detail?: string): void {
  console.warn(INTEREST_UNDELIVERED, detail ? { reason, detail } : { reason });
}

/**
 * The facts the write path hands this emitter. Every one is resolved by the
 * write path from ITS OWN authoritative reads — never from the browser:
 *   - `signalId`      — `.select("id")` of the upsert, under the worker's RLS;
 *   - `ownerProfileId`— `contact_demand_owner_v1` (SECURITY DEFINER, applied
 *                        20260723053000), called under the CALLER's session
 *                        right after the write. The RPC reveals the owner only
 *                        when the caller holds their own active signal on an
 *                        open demand of a verified company — the exact gate
 *                        the board applies — and returns NULL for the owner's
 *                        own demand. `null` here = unresolved;
 *   - `actorProfileId`— the caller's `auth.uid()` (DomainCaller.userId);
 *   - `country`       — the board row the worker just acted on.
 */
export interface DemandInterestNotificationFacts {
  readonly signalId: string;
  readonly ownerProfileId: string | null;
  readonly actorProfileId: string;
  readonly country: string | null;
}

/**
 * ROOT CAUSE, FOUND AND CLOSED (2026-09-17). The emitter used to open with two
 * admin-client reads — `demand_interest_signals` (for request/worker) and
 * `customer_requests` (for the owner). Production deliberately allowlists
 * service_role table grants, and NEITHER table is on the list (verified
 * 2026-09-17: service_role holds SELECT on `workers`,
 * `notification_preferences` and `notification_events`, and nothing on
 * `demand_interest_signals`, `customer_requests` or `profiles`). The first
 * read failed 42501 on every call, `maybeSingle()` surfaced it as a null row,
 * and the emitter returned `signal_unreadable` for every genuine interest
 * since it shipped — which is exactly the "backfill-only" evidence above.
 *
 * The fix grants NOTHING. The write path already holds every fact this
 * emitter needs, under the worker's own authorization plus the gated owner
 * RPC that the contact action has used since 2026-07-23; it now hands them
 * over (see `DemandInterestNotificationFacts`). The two remaining admin
 * touches — the recipient's preferences and the event insert — are the two
 * grants service_role actually has.
 */
export async function emitDemandInterestNotification(
  facts: DemandInterestNotificationFacts,
): Promise<NotificationEmitResult> {
  try {
    const { signalId, actorProfileId, country } = facts;
    if (!signalId) {
      undelivered("signal_unreadable");
      return { delivered: false, reason: "signal_unreadable" };
    }
    const owner = facts.ownerProfileId;
    if (!owner) {
      // The gated RPC returned no owner. For the owner's OWN demand that is
      // the approved self-interest silence and the caller does not reach
      // here (see interest.ts); anything else is a real miss.
      undelivered("owner_unresolved");
      return { delivered: false, reason: "owner_unresolved" };
    }

    // APPROVED silence, not a failure: you do not need telling that you raised
    // your own hand. Deliberately unlogged so the marker below stays a signal.
    const actor = actorProfileId;
    if (actor && actor === owner) return { delivered: false, reason: "self_action" };

    const admin = createAdminClient();
    // Preference gate + email hop (completion v1) — this emitter predates
    // `deliver` and keeps its own audited insert (guard-pinned), so it
    // carries the same two channel hops explicitly. Fail-open on an
    // unreadable preferences table; suppression only on a stored opt-out.
    const prefRows = await readPrefRowsFailOpen(admin, owner);
    if (!resolveChannelEnabled(prefRows, "demand_interest_expressed", "in_app")) {
      // APPROVED silence: the owner turned this type off themselves.
      return { delivered: false, reason: "suppressed_preference" };
    }

    const outcome = await emitNotificationEvent(admin, {
      recipientProfileId: owner,
      eventType: "demand_interest_expressed",
      entityType: "demand_interest_signal",
      entityId: signalId,
      metadata: /^[A-Z]{2}$/.test(country ?? "")
        ? { country: country as string }
        : {},
    });
    if (outcome.kind === "unexpected_error") {
      // `duplicate` and `feature_unavailable` are approved outcomes and stay
      // quiet; this line only fires on something real.
      undelivered("insert_failed", outcome.code);
    }
    if (outcome.kind === "written") {
      await maybeDispatchNotificationEmail(
        admin,
        {
          recipientProfileId: owner,
          eventType: "demand_interest_expressed",
          entityType: "demand_interest_signal",
        },
        prefRows,
      );
    }
    return resultFromOutcome(outcome.kind);
  } catch (err) {
    // Emission is an enhancement; the signal itself is already stored — the
    // worker's action still succeeded. But this catch used to be BARE, which
    // is why a permanent delivery failure was undiagnosable from outside the
    // database: nothing threw, nothing logged, and the employer simply never
    // heard anything. The failure is now named. Bounded and secret-free: no
    // free text, no ids, no payload.
    undelivered(
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
    return { delivered: false, reason: "threw" };
  }
}

/**
 * DEMAND INTEREST, THE RETURN DIRECTION — the company answered.
 *
 * The sibling above closes the employer's silence; this closes the worker's,
 * and shipping only the first would have been the worse asymmetry. A worker
 * who raises their hand and hears nothing is the most common way a labour
 * market wastes a person's hope, and doctrine §1 exists precisely so the
 * smaller party is not the one left guessing.
 *
 * RECIPIENT: the worker who expressed the interest, resolved from the signal
 * row's own `worker_id`. Emitted only when `acknowledge_demand_interest`
 * actually changed something, so a no-op acknowledgement never manufactures
 * news.
 *
 * ONLY 'reviewed'. The 'contacted' status is set exclusively by
 * `contact-interested-worker`, and only AFTER a real conversation thread has
 * been opened — which already reaches the worker through the existing
 * unread-message signal. The message itself is the better notification, so a
 * second bell for the same act would be noise. 'reviewed' is the status that
 * had no carrier at all.
 *
 * WHAT IT DOES NOT COVER, deliberately: shortlist status. `setShortlist`
 * records an employer-internal judgement (including a rejection), and turning
 * that into a notification is a product decision about telling someone they
 * were passed over — not a gap to close silently. Acknowledgement is different
 * in kind: the company chose to say something.
 *
 * METADATA: empty. The demand's country is the WORKER's counterparty data
 * here, not their own, and nothing about the answer needs a render hint.
 */
export async function emitDemandInterestResponseNotification(input: {
  readonly requestId: string;
  readonly workerId: string;
  /**
   * The signal row id, read by the ACKNOWLEDGING OWNER under their own RLS
   * (`demand_interest_signals_demand_owner_select`) in `acknowledgeInterest`.
   * Same root cause as the outbound half (2026-09-17): this emitter used to
   * read the signal with the admin client, which holds no grant on the table,
   * so no worker was ever told their interest had been reviewed. The event
   * stays keyed on the SIGNAL row — one answer per (worker, demand).
   */
  readonly signalId: string | null;
  /** Only "reviewed" emits; "contacted" returns without a write (see above). */
  readonly status: "reviewed" | "contacted";
  /** The acting profile — never notified about answering themselves. */
  readonly actorProfileId: string;
}): Promise<NotificationEmitResult> {
  if (input.status !== "reviewed") return { delivered: false, reason: "not_applicable" };
  try {
    const admin = createAdminClient();
    const signalId = input.signalId;
    if (!signalId) {
      notDelivered("demand_interest_reviewed", "signal_unreadable");
      return { delivered: false, reason: "signal_unreadable" };
    }

    const recipient = await workerProfileId(admin, input.workerId);
    if (!recipient) {
      return undeliveredResult("demand_interest_reviewed", "recipient_unresolved");
    }
    // APPROVED silence: nobody is told they answered themselves.
    if (recipient === input.actorProfileId) return { delivered: false, reason: "self_action" };

    // Same two channel hops as the outbound half (rationale up there).
    const prefRows = await readPrefRowsFailOpen(admin, recipient);
    if (!resolveChannelEnabled(prefRows, "demand_interest_reviewed", "in_app")) {
      return { delivered: false, reason: "suppressed_preference" };
    }

    const outcome = await emitNotificationEvent(admin, {
      recipientProfileId: recipient,
      eventType: "demand_interest_reviewed",
      entityType: "demand_interest_response",
      entityId: signalId,
      metadata: {},
    });
    if (outcome.kind === "unexpected_error") {
      notDelivered("demand_interest_reviewed", "insert_failed", outcome.code);
    }
    if (outcome.kind === "written") {
      await maybeDispatchNotificationEmail(
        admin,
        {
          recipientProfileId: recipient,
          eventType: "demand_interest_reviewed",
          entityType: "demand_interest_response",
        },
        prefRows,
      );
    }
    return resultFromOutcome(outcome.kind);
  } catch (err) {
    // Emission is an enhancement; the acknowledgement already succeeded. The
    // catch used to be bare — named now, like every sibling (2026-09-23).
    return undeliveredResult(
      "demand_interest_reviewed",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/**
 * The facts an absence write path hands the absence emitter. Read by the
 * CALLER from `worker_absences` under their own session. The applied
 * `worker_absences_select` (20260808120000) admits the worker themselves
 * always, and a real manager of that worker ONLY WHILE `status =
 * 'requested'` — so the request path reads after its RPC (the requester is
 * the worker) and the review path reads BEFORE its RPC, because
 * `review_worker_absence_v1` is exactly what closes the manager's arm
 * (lib/leave/absences-actions.ts, absenceNotificationFacts). service_role
 * holds no grant on the table (see the header), so the admin read this
 * emitter used to open with was the whole silence.
 */
export interface AbsenceNotificationFacts {
  readonly absenceId: string;
  /** `worker_id` (workers.id); resolved to a profile through `workers`. */
  readonly workerId: string | null;
  /** `requested_by` — the profile that filed it (the worker, per the RPC). */
  readonly requestedByProfileId: string | null;
  /** `start_date` — a safe render hint. */
  readonly startDate: string | null;
}

/** Absence lifecycle events, from the facts the write path resolved. */
export async function emitAbsenceNotification(
  facts: AbsenceNotificationFacts,
  eventType: Extract<
    NotificationEventType,
    "absence_requested" | "absence_approved" | "absence_rejected"
  >,
): Promise<NotificationEmitResult> {
  try {
    const admin = createAdminClient();
    if (!facts.workerId) return undeliveredResult(eventType, "recipient_unresolved");
    const worker = await workerProfileId(admin, facts.workerId);
    if (!worker) return undeliveredResult(eventType, "recipient_unresolved");
    const metadata = { startDate: facts.startDate ?? undefined };
    const requestedBy = facts.requestedByProfileId;

    if (eventType === "absence_requested") {
      // APPROVED silence otherwise: only when someone ELSE filed it for the
      // worker — see the header. (`request_worker_absence_v1` only lets the
      // worker file their own, so today this is always the silence.)
      if (requestedBy && requestedBy !== worker) {
        return resultFromOutcome(
          await deliver(admin, {
            recipientProfileId: worker,
            eventType,
            entityType: "worker_absence",
            entityId: facts.absenceId,
            metadata,
          }),
        );
      }
      return { delivered: false, reason: "self_action" };
    }

    const recipients = new Set<string>([worker]);
    if (requestedBy && requestedBy !== worker) recipients.add(requestedBy);
    const results: NotificationEmitResult[] = [];
    for (const recipientProfileId of recipients) {
      results.push(
        resultFromOutcome(
          await deliver(admin, {
            recipientProfileId,
            eventType,
            entityType: "worker_absence",
            entityId: facts.absenceId,
            metadata,
          }),
        ),
      );
    }
    return combineResults(results, eventType);
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    return undeliveredResult(
      eventType,
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/* ── Workflow & Approval Engine v1 (canonical engine) ───────────────────────
 *
 * RECIPIENT DECISIONS, STATED (v3):
 *   workflow_step_pending — every approver (and delegate) on the instance's
 *     CURRENT decidable step. Resolved from the engine's own rows, never
 *     from caller-supplied ids. Dedupe is (type, instance) per recipient, so
 *     a person approving on several steps of one request hears once — the
 *     inbox itself stays the exact count.
 *   workflow_decided — the REQUESTER, when their request reaches a terminal
 *     outcome (approved / rejected / cancelled). The label states only that
 *     a decision exists; the outcome is read on the surface.
 *   workflow_delegated — the DELEGATE who just received a slot.
 *   workflow_escalated — the escalation rule's notify_roles members (default
 *     owner/admin). Escalation is a marked SAFE STATE: this event says a
 *     deadline passed — nothing was auto-approved, and approvers can still
 *     decide.
 */

const WORKFLOW_GOVERNANCE_NOTIFY_FALLBACK = ["owner", "admin"] as const;

// The workflow_* tables are proposed by the human-gated engine migration and
// are not in the generated Database types yet — the blessed boundary cast
// (lib/supabase/types.ts convention) until pnpm db:types learns them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asWorkflowClient(admin: AdminClient): any {
  return admin;
}

type WorkflowInstanceLite = {
  readonly id: string;
  readonly organizationId: string;
  readonly requesterProfileId: string | null;
  readonly currentStepOrder: number | null;
  readonly versionId: string | null;
};

async function readWorkflowInstanceLite(
  admin: AdminClient,
  instanceId: string,
): Promise<WorkflowInstanceLite | null> {
  const { data } = await asWorkflowClient(admin)
    .from("workflow_instances")
    .select(
      "id, organization_id, requester_profile_id, current_step_order, version_id",
    )
    .eq("id", instanceId)
    .maybeSingle();
  const row = data as {
    id?: string;
    organization_id?: string;
    requester_profile_id?: string | null;
    current_step_order?: number | null;
    version_id?: string | null;
  } | null;
  if (!row?.id || !row.organization_id) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    requesterProfileId: row.requester_profile_id ?? null,
    currentStepOrder: row.current_step_order ?? null,
    versionId: row.version_id ?? null,
  };
}

/** The approvers (and delegates) of the instance's CURRENT decidable step
 *  durably hear that a request awaits them. Call after a successful start
 *  and after a step handover. */
export async function emitWorkflowStepPendingNotifications(
  instanceId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const instance = await readWorkflowInstanceLite(admin, instanceId);
    if (!instance || instance.currentStepOrder === null) return;

    const { data: stepData } = await asWorkflowClient(admin)
      .from("workflow_instance_steps")
      .select("id, status")
      .eq("instance_id", instance.id)
      .eq("step_order", instance.currentStepOrder)
      .maybeSingle();
    const step = stepData as { id?: string; status?: string } | null;
    if (!step?.id) return;
    if (step.status !== "active" && step.status !== "escalated") return;

    const { data: slotData } = await asWorkflowClient(admin)
      .from("workflow_instance_approvers")
      .select("approver_profile_id, delegated_to_profile_id, decision")
      .eq("instance_step_id", step.id);
    const recipients = new Set<string>();
    for (const raw of (slotData ?? []) as {
      approver_profile_id?: string;
      delegated_to_profile_id?: string | null;
      decision?: string | null;
    }[]) {
      if (raw.decision) continue; // a settled slot needs no summons
      if (raw.approver_profile_id) recipients.add(raw.approver_profile_id);
      if (raw.delegated_to_profile_id) recipients.add(raw.delegated_to_profile_id);
    }
    for (const recipientProfileId of recipients) {
      await deliver(admin, {
        recipientProfileId,
        eventType: "workflow_step_pending",
        entityType: "workflow_instance",
        entityId: instance.id,
        metadata: {},
      });
    }
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    notDelivered(
      "workflow_step_pending",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/** The requester durably hears that their request reached a terminal
 *  outcome. The recipient comes from the instance row itself. */
export async function emitWorkflowDecidedNotification(
  instanceId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const instance = await readWorkflowInstanceLite(admin, instanceId);
    if (!instance?.requesterProfileId) {
      notDelivered("workflow_decided", "recipient_unresolved");
      return;
    }
    await deliver(admin, {
      recipientProfileId: instance.requesterProfileId,
      eventType: "workflow_decided",
      entityType: "workflow_instance",
      entityId: instance.id,
      metadata: {},
    });
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    notDelivered(
      "workflow_decided",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/** The delegate durably hears they received a slot. The delegate is read
 *  from the actor's own slot row — never from client input. */
export async function emitWorkflowDelegatedNotification(
  instanceId: string,
  actorProfileId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await asWorkflowClient(admin)
      .from("workflow_instance_approvers")
      .select("delegated_to_profile_id")
      .eq("instance_id", instanceId)
      .eq("approver_profile_id", actorProfileId)
      .is("decision", null)
      .maybeSingle();
    const delegate =
      (data as { delegated_to_profile_id?: string | null } | null)
        ?.delegated_to_profile_id ?? null;
    if (!delegate) {
      notDelivered("workflow_delegated", "recipient_unresolved");
      return;
    }
    await deliver(admin, {
      recipientProfileId: delegate,
      eventType: "workflow_delegated",
      entityType: "workflow_instance",
      entityId: instanceId,
      metadata: {},
    });
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    notDelivered(
      "workflow_delegated",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/** The escalation rule's notify_roles members durably hear a deadline
 *  passed. Marked + notified ONLY — nothing here (or anywhere) approves. */
export async function emitWorkflowEscalatedNotifications(
  instanceId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const instance = await readWorkflowInstanceLite(admin, instanceId);
    if (!instance) return;

    // The escalated step's authored rule (fallback: governance owner/admin).
    let notifyRoles: readonly string[] = WORKFLOW_GOVERNANCE_NOTIFY_FALLBACK;
    if (instance.versionId && instance.currentStepOrder !== null) {
      const { data } = await asWorkflowClient(admin)
        .from("workflow_version_steps")
        .select("escalation_rule")
        .eq("version_id", instance.versionId)
        .eq("step_order", instance.currentStepOrder)
        .maybeSingle();
      const rule = (data as { escalation_rule?: { notify_roles?: unknown } | null } | null)
        ?.escalation_rule;
      if (rule && Array.isArray(rule.notify_roles) && rule.notify_roles.length > 0) {
        notifyRoles = rule.notify_roles.filter(
          (r): r is string => typeof r === "string",
        );
      }
    }

    const { data: members } = await asWorkflowClient(admin)
      .from("company_memberships")
      .select("profile_id, role, status")
      .eq("organization_id", instance.organizationId)
      .eq("status", "active")
      .in("role", [...notifyRoles]);
    const recipients = new Set<string>();
    for (const raw of (members ?? []) as { profile_id?: string }[]) {
      if (raw.profile_id) recipients.add(raw.profile_id);
    }
    if (recipients.size === 0) {
      notDelivered("workflow_escalated", "recipient_unresolved");
      return;
    }
    for (const recipientProfileId of recipients) {
      await deliver(admin, {
        recipientProfileId,
        eventType: "workflow_escalated",
        entityType: "workflow_instance",
        entityId: instanceId,
        metadata: {},
      });
    }
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    notDelivered(
      "workflow_escalated",
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}
// ── Document & Evidence Engine v3 emitters (20260817140100) ────────────────
//
// RECIPIENT DECISIONS, STATED (v3):
//   document_ack_assigned  → the ASSIGNEE — someone asked them to confirm a
//                            document version; resolved from the ack row.
//   document_ack_completed → the ASSIGNER — their request was answered;
//                            never emitted when assigner acknowledged their
//                            own assignment (the actor already watched it).
//   document_expiring      → worker scope: the WORKER whose own document
//                            enters the 30-day window (same derivation the
//                            documents page shows); org scope: the register
//                            entry's responsible person (falling back to
//                            its creator). Deduped by the store's UNIQUE
//                            (recipient, type:entity) key, so a document is
//                            durably announced ONCE per validity period —
//                            a renewed document that expires again later is
//                            a recorded v1 limitation, not a silent bug.
// All three stay INERT until the lead applies the v3 constraint widening —
// the CHECK rejects the insert and the fire-and-forget wrapper logs it.

// The document-engine tables ship behind the human-gated 20260817140000
// migration, so they are not in the generated Database types yet — the
// blessed boundary cast (lib/supabase/types.ts convention). RLS/authority
// still hold at runtime; these are admin-client reads by design (emitters).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAnyClient(c: AdminClient): any {
  return c;
}

/** Ack lifecycle events. `ackId` is the document_acknowledgements row id. */
export async function emitDocumentAckNotification(
  ackId: string,
  eventType: Extract<
    NotificationEventType,
    "document_ack_assigned" | "document_ack_completed"
  >,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await asAnyClient(admin)
      .from("document_acknowledgements")
      .select("assignee_profile_id, assigned_by")
      .eq("id", ackId)
      .maybeSingle();
    const row = data as {
      assignee_profile_id?: string;
      assigned_by?: string;
    } | null;
    if (!row) {
      notDelivered(eventType, "row_unreadable");
      return;
    }

    let recipient: string | null = null;
    if (eventType === "document_ack_assigned") {
      recipient = row.assignee_profile_id ?? null;
      if (!recipient) {
        notDelivered(eventType, "recipient_unresolved");
        return;
      }
    } else if (
      row.assigned_by &&
      row.assigned_by !== row.assignee_profile_id
    ) {
      // Completed → the assigner hears it; the acting assignee does not.
      recipient = row.assigned_by;
    }
    // APPROVED silence: acknowledging your own assignment needs no telling.
    if (!recipient) return;

    await deliver(admin, {
      recipientProfileId: recipient,
      eventType,
      entityType: "document_acknowledgement",
      entityId: ackId,
      metadata: {},
    });
  } catch (err) {
    // Emission is an enhancement; the domain write already succeeded.
    notDelivered(
      eventType,
      "threw",
      err instanceof Error ? err.message.slice(0, 200) : undefined,
    );
  }
}

/** True when a date-only string falls inside the (0, window] days-ahead
 *  band: not yet expired, but expiring. Same semantics the documents page
 *  derives (deriveDocumentStatus's 30-day window). */
function isInsideExpiryWindow(dateOnly: string | null, now: Date): boolean {
  if (!dateOnly) return false;
  const until = new Date(`${dateOnly}T23:59:59Z`);
  if (Number.isNaN(until.getTime())) return false;
  const ms = until.getTime() - now.getTime();
  return ms >= 0 && ms < DOCUMENT_EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Durable "your document enters the 30-day expiry window" facts for one
 *  worker's OWN documents.
 *
 *  READ-TIME DETACHED — the documented exception to the module's awaited
 *  rule. This fires on the documents READ path, where an await would tax
 *  every page load; and unlike a write-path event the fact is not one-shot:
 *  it is re-derived on EVERY visit and deduped by the store's UNIQUE
 *  (recipient, dedupe_key), so an insert killed by the serverless freeze
 *  self-heals on the next visit instead of losing the fact forever. A
 *  THROWN failure still logs the NOTIFICATION_UNDELIVERED marker. */
export function emitWorkerDocumentExpiringNotifications(workerId: string): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data: worker } = await admin
        .from("workers")
        .select("profile_id")
        .eq("id", workerId)
        .maybeSingle();
      const recipient =
        (worker as { profile_id?: string } | null)?.profile_id ?? null;
      if (!recipient) return;

      // Preference gate (completion v1): a stored in-app opt-out for this
      // type suppresses the whole derivation. Fail-open like `deliver`.
      const prefRows = await readPrefRowsFailOpen(admin, recipient);
      if (!resolveChannelEnabled(prefRows, "document_expiring", "in_app")) {
        return;
      }

      const { data } = await admin
        .from("worker_documents")
        .select("id, status, valid_until")
        .eq("worker_id", workerId)
        .eq("status", "ready")
        .not("valid_until", "is", null)
        .limit(200);
      const now = new Date();
      for (const row of (data ?? []) as {
        id: string;
        valid_until: string | null;
      }[]) {
        if (!isInsideExpiryWindow(row.valid_until, now)) continue;
        emitNotificationEventInBackground(admin, {
          recipientProfileId: recipient,
          eventType: "document_expiring",
          entityType: "worker_document",
          entityId: row.id,
          metadata: {},
        });
      }
    } catch (err) {
      // Emission is an enhancement; reads must never fail because of it.
      notDelivered(
        "document_expiring",
        "threw",
        err instanceof Error ? err.message.slice(0, 200) : undefined,
      );
    }
  })();
}

/** Durable expiry facts for an org register: the responsible person (or the
 *  creator) hears that an ACTIVE entry enters the window.
 *
 *  READ-TIME DETACHED — same documented exception (and same self-healing
 *  argument) as `emitWorkerDocumentExpiringNotifications` above. */
export function emitOrgDocumentExpiringNotifications(
  organizationId: string,
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data } = await asAnyClient(admin)
        .from("org_documents")
        .select("id, expires_on, responsible_profile_id, created_by")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .not("expires_on", "is", null)
        .limit(200);
      const now = new Date();
      // Preference gate per DISTINCT recipient (completion v1), cached so a
      // register with one responsible person costs one read. Fail-open.
      const allowedByRecipient = new Map<string, boolean>();
      for (const row of (data ?? []) as {
        id: string;
        expires_on: string | null;
        responsible_profile_id: string | null;
        created_by: string;
      }[]) {
        if (!isInsideExpiryWindow(row.expires_on, now)) continue;
        const recipient = row.responsible_profile_id ?? row.created_by;
        if (!recipient) continue;
        let allowed = allowedByRecipient.get(recipient);
        if (allowed === undefined) {
          allowed = resolveChannelEnabled(
            await readPrefRowsFailOpen(admin, recipient),
            "document_expiring",
            "in_app",
          );
          allowedByRecipient.set(recipient, allowed);
        }
        if (!allowed) continue;
        emitNotificationEventInBackground(admin, {
          recipientProfileId: recipient,
          eventType: "document_expiring",
          entityType: "org_document",
          entityId: row.id,
          metadata: {},
        });
      }
    } catch (err) {
      // Emission is an enhancement; reads must never fail because of it.
      notDelivered(
        "document_expiring",
        "threw",
        err instanceof Error ? err.message.slice(0, 200) : undefined,
      );
    }
  })();
}

/**
 * v6 — weekly personal digest, materialized READ-TIME (value train 2, B2).
 *
 * Unlike every emitter above, this is not triggered by a domain write: it
 * fires on an authenticated dashboard visit (SpineStream), at most once per
 * ISO week. The skip check runs over the durable feed the caller already
 * fetched; the authority is the store's UNIQUE (recipient, dedupe_key) with
 * a deterministic per-week entity id, so races and re-renders are
 * duplicate-conflict no-ops.
 *
 * WHY NO SCHEDULER: a cron would be a second notification path for people
 * who are present anyway; reaching ABSENT workers needs the email channel,
 * which is deliberately owner-gated behind the notification_preferences
 * decision (consent/unsubscribe first) and will ride this same event row.
 *
 * POINTER-ONLY by doctrine: §19(d) forbids persisting computed fit values,
 * so the row carries NO metadata — the numbers live where the href lands
 * (the opportunities board recomputes them at read time). Nothing is
 * emitted when neither the journal nor the market block could be read: a
 * digest that can say nothing true says nothing.
 *
 * READ-TIME DETACHED — the third documented exception to the module's
 * awaited rule (see the header). It fires on every dashboard visit and the
 * UNIQUE dedupe key makes it exactly-once per week, so an insert killed by
 * the serverless freeze self-heals on the very next visit; awaiting it
 * would gate the spine render for no durability gain. Its catch stays an
 * APPROVED silence: it also covers "no service env at all", which would
 * turn the marker into per-visit noise in environments without the key.
 */
export function maybeEmitWeeklyDigestInBackground(
  durable: readonly WeeklyDigestSkipRow[],
): void {
  void (async () => {
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (hasCurrentWeekDigest(durable, todayIso)) return;
      // The store refused the last write (42501, owner GRANT pending —
      // #1566): the three reads below exist only to feed that write, so
      // they are skipped too while the block holds. Measured 2026-09-06:
      // 273 `permission denied for table notification_preferences` +
      // 272 `... notification_events` in 24 h of Postgres logs, one pair per
      // dashboard render.
      if (isNotificationStoreWriteBlocked()) return;

      const worker = await getWorkerCoreRow();
      if (!worker?.profile_id) return;

      const result = await getWeeklyPersonalIntelligence();
      if (result.kind !== "ready") return;
      const { journal, opportunities } = result.intelligence;
      if (!journal.available && !opportunities.available) return;

      // DIGEST TRUTH (2026-09-17). The board's own matchability gate decides
      // what this row may claim: a person the engine cannot match yet (no
      // work type or no skill evidence) gets a PROFILE-COMPLETION digest —
      // "confirm what work you do" — that lands on the profile, never the
      // "your week's opportunities" digest that lands on a board answering
      // missing_profile_info. Same exactly-once entity id: one digest a
      // week, of the kind that is true. Nothing here weakens matching.
      const recs = await getWorkerJobRecommendations();
      const matchable = recs.kind === "ready" ? recs.matchable : false;

      const admin = createAdminClient();
      // Preference gate (completion v1): a stored in-app opt-out for the
      // digest suppresses the read-time emit too. Fail-open like `deliver`.
      const prefRows = await readPrefRowsFailOpen(admin, worker.profile_id);
      if (!resolveChannelEnabled(prefRows, "weekly_digest", "in_app")) return;
      emitNotificationEventInBackground(admin, {
        recipientProfileId: worker.profile_id,
        eventType: "weekly_digest",
        entityType: "weekly_digest",
        entityId: weeklyDigestEntityId(todayIso),
        metadata: matchable ? {} : { focus: "profile_completion" },
      });
    } catch {
      // Missing service env / transient read failure — observability only,
      // never the page. The next visit tries again.
    }
  })();
}

/** The cron sweep's honest report — counts only, never ids or people. */
export interface WeeklyDigestCronSummary {
  readonly kind: "ran";
  /** Distinct candidate recipients the sweep considered. */
  readonly candidates: number;
  readonly written: number;
  /** Already had this week's row (read-time emit or an earlier sweep). */
  readonly duplicates: number;
  /** Stored in-app opt-outs. */
  readonly suppressed: number;
  readonly failures: number;
}

const WEEKLY_DIGEST_CRON_RECIPIENT_LIMIT = 500;

/**
 * WEEKLY DIGEST CRON SWEEP (completion v1) — the scheduled sibling of the
 * read-time emitter above, for the people the read-time path structurally
 * cannot reach: workers who did NOT visit the dashboard this week. Both
 * paths write the SAME deterministic per-week entity id, so the UNIQUE
 * (recipient, dedupe_key) constraint keeps the digest exactly-once per
 * recipient per week whichever path gets there first.
 *
 * RECIPIENT DECISION, stated: workers with at least one live journal entry
 * in the trailing 7 days. The read-time emitter's richer "can this digest
 * say something true" check (`getWeeklyPersonalIntelligence`) runs under the
 * signed-in session and cannot run here; recent journal activity is the
 * service-role-readable subset of that truth — a worker who logged work this
 * week always has a non-empty digest. Widening the audience is a deliberate
 * later decision, not a default.
 *
 * Rides `deliver`, so the sweep inherits the preference gate AND the email
 * hop: once the owner configures a real email provider, workers who opted in
 * to digest email start receiving it from this sweep with no further code
 * change. Lives in THIS module because event-emitters.ts is the one audited
 * home of durable-notification service-role writers (chat-visibility-rls
 * pins the caller inventory).
 */
export async function emitWeeklyDigestNotificationsForCron(): Promise<
  WeeklyDigestCronSummary | { readonly kind: "unavailable" }
> {
  try {
    const admin = createAdminClient();
    const todayIso = new Date().toISOString().slice(0, 10);
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("journal_entries")
      .select("worker_id")
      .gte("created_at", sinceIso)
      .is("deleted_at", null)
      .limit(5000);
    if (error) return { kind: "unavailable" };
    const workerIds = [
      ...new Set(
        ((data ?? []) as { worker_id?: string | null }[])
          .map((r) => r.worker_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ].slice(0, WEEKLY_DIGEST_CRON_RECIPIENT_LIMIT);

    const recipients = new Set<string>();
    for (let i = 0; i < workerIds.length; i += 100) {
      const { data: workers } = await admin
        .from("workers")
        .select("id, profile_id")
        .in("id", workerIds.slice(i, i + 100));
      for (const w of (workers ?? []) as { profile_id?: string | null }[]) {
        if (w.profile_id) recipients.add(w.profile_id);
      }
    }

    const entityId = weeklyDigestEntityId(todayIso);
    const summary = {
      candidates: recipients.size,
      written: 0,
      duplicates: 0,
      suppressed: 0,
      failures: 0,
    };
    for (const recipientProfileId of recipients) {
      const outcome = await deliver(admin, {
        recipientProfileId,
        eventType: "weekly_digest",
        entityType: "weekly_digest",
        // POINTER-ONLY (§19(d)): no counts — the numbers live where the
        // href lands, recomputed at read time. `focus: "journal"` is not a
        // count, it is a limit on the claim: this sweep can only know the
        // person logged work this week (service_role cannot read skills or
        // professions), so its digest speaks of the journal and never
        // promises opportunities it could not check.
        entityId,
        metadata: { focus: "journal" },
      });
      if (outcome === "written") summary.written += 1;
      else if (outcome === "duplicate") summary.duplicates += 1;
      else if (outcome === "suppressed_preference") summary.suppressed += 1;
      else if (outcome === "unexpected_error") summary.failures += 1;
      // feature_unavailable: the store is unapplied — every later recipient
      // would fail identically, so stop and report honestly. write_blocked
      // (42501, writer unprivileged) is the same shape: nothing can be
      // written for anyone until the grant lands.
      else if (outcome === "feature_unavailable" || outcome === "write_blocked") {
        return { kind: "unavailable" };
      }
    }
    return { kind: "ran", ...summary };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * A SAVED SEARCH HAS ANSWERS THE WORKER HAS NOT SEEN (DEM-8, v7).
 *
 * Emitted from the worker's OWN board render, after their own read has
 * already counted the matches under their own authorization — so this writer
 * never decides what matches, it only records that something did. The row is
 * a POINTER, exactly like the weekly digest: no count is persisted, because a
 * number written by a background writer is a claim nobody re-checked, and the
 * board recomputes it live where the href lands.
 *
 * EXACTLY ONCE PER SEARCH PER WEEK. The entity id is a deterministic uuid of
 * `saved_search:<id>:<ISO week>`, so the store's UNIQUE (recipient,
 * dedupe_key) makes re-renders, races and retries no-ops. A standing question
 * is not a firehose: a worker who keeps finding new matches every day still
 * hears about each saved search once a week.
 *
 * Fire-and-forget, like every other emitter here: a board render must never
 * fail because a notification could not be written.
 */
export async function emitSavedSearchMatchNotification(input: {
  readonly recipientProfileId: string;
  readonly savedSearchId: string;
  readonly todayIso: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await deliver(admin, {
      recipientProfileId: input.recipientProfileId,
      eventType: "saved_search_match",
      entityType: "saved_search",
      entityId: deterministicEntityId(
        `saved_search:${input.savedSearchId}:${isoWeekKey(input.todayIso)}`,
      ),
    });
  } catch {
    // Never surfaced to the reader — the board they are looking at is the
    // answer; the notification is a convenience on top of it.
    undelivered("saved_search_emit_failed");
  }
}

/**
 * Universal invitation / referral network v1: somebody accepted an
 * invitation this person created. The recipient is resolved from the accept
 * RPC's own return (`inviter_profile_id`) — no admin table read, because
 * service_role holds no grant on `invitations` in production. Self-acceptance
 * (an inviter opening their own link) is not a fact worth a bell. An
 * external-source referral has no inviter and emits nothing here. Awaited by
 * the write path that calls it, like every sibling emitter.
 */
export async function emitInvitationAcceptedNotification(input: {
  readonly inviterProfileId: string | null;
  readonly acceptedByProfileId: string;
  readonly invitationId: string;
}): Promise<void> {
  if (!input.inviterProfileId || input.inviterProfileId === input.acceptedByProfileId) {
    return;
  }
  try {
    const admin = createAdminClient();
    await deliver(admin, {
      recipientProfileId: input.inviterProfileId,
      eventType: "invitation_accepted",
      entityType: "invitation",
      entityId: input.invitationId,
    });
  } catch {
    undelivered("invitation_accepted_emit_failed");
  }
}
