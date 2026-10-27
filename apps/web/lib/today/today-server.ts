import "server-only";

import { cache } from "react";

import { getSessionProfile } from "@/lib/auth/session-profile";
import { listMyBookings } from "@/lib/booking/booking-actions";
import { getUnreadConversationIdsResult } from "@/lib/communication/unread";
import {
  getPrimaryProfessionSlug,
  getProfessionEntries,
  getWorkerCoreRow,
} from "@/lib/data/worker-core";
import type { ProfessionEntry } from "@/lib/worker/self-declared-profession";
import { listInvitationsAddressedToMe } from "@/lib/invitations/attention";
import { deriveGrowthReading, type GrowthReading } from "@/lib/journal/growth-reading";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";
import { loadOwnWorkIntelligence } from "@/lib/journal/work-intelligence-read";
import { loadOpportunitiesResultAction } from "@/lib/marketplace/worker-opportunities-actions";
import type { OpportunitiesResultView } from "@/lib/marketplace/worker-opportunities-contract";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import type { TodayAttention } from "@/lib/today/today-model";
import { getWorkerCard } from "@/lib/worker/work-card";
import { deriveWorkCardState, type WorkCardDerived } from "@/lib/worker/work-card-state";

/**
 * ŠIANDIEN — the server reads behind the worker's home, in THREE independent
 * pieces so the page can stream (the #1011 lesson: the slowest worker read
 * must never hold the whole surface behind the route's loading skeleton):
 *
 *   header        who · profession — NEVER the player card
 *                 ← the request-cached session profile (name) and the ONE
 *                   cached profession read (`getProfessionEntries` +
 *                   `getPrimaryProfessionSlug`, the same rows the card
 *                   reads). Split out of `head` for the home CLS P0
 *                   (2026-10-26): the header used to wait on the card, so
 *                   the whole ŠIANDIEN frame painted only when the card did
 *                   (t≈8 s in production) and pushed the conversation down
 *   head          the one next action
 *                 ← the ONE canonical player card + the work-card read
 *                   model (`getWorkerCard`, fed the request-cached core
 *                   `workers` row — no second `workers` select) through the
 *                   ONE work-card engine (`deriveWorkCardState`)
 *   work          today · this week · open items · one growth line
 *                 ← `loadOwnWorkIntelligence` (the journal's ONE reader) +
 *                   `deriveGrowthReading` over the same model
 *   opportunities one opportunity line
 *                 ← `loadOpportunitiesResultAction` — the SAME projection
 *                   the conversation's result renders, no second query
 *   attention     the doors — who is waiting on the person
 *                 ← `listMyBookings` (offers proposed to them),
 *                   `listInvitationsAddressedToMe` (both invitation
 *                   systems), `getUnreadConversationIds` — the SAME three
 *                   readers the conversation's opening brief, the bookings
 *                   card and the messages badge already use
 *
 * Every read degrades to `null` (UNKNOWN). Nothing here derives a figure of
 * its own; the pure model (`today-model.ts`) decides what the screen says.
 *
 * This is a plain `server-only` module, NOT a `"use server"` action file —
 * it exports readers for server components, never an endpoint.
 */

export type TodayHead = {
  readonly displayName: string | null;
  readonly professionSlug: string | null;
  /** What this person says they do, in the order they hold it — a registry
   *  slug or their OWN WORDS. The header names the first one it can render,
   *  so somebody whose profession the registry does not carry is no longer
   *  told "Profesija dar nenurodyta" after stating it (owner walk 2026-09-27,
   *  the test user who typed "LLM programuotojas"). */
  readonly professions: readonly ProfessionEntry[];
  readonly workCard: WorkCardDerived | null;
};

/**
 * The header's NAME — the request-cached session profile only (the layout and
 * the page already ran it, so this costs no round-trip). The card's own
 * `displayName` is the SAME `profiles.full_name` (player-card.ts), so waiting
 * on the card for it bought nothing but latency.
 */
export const loadTodayDisplayName = cache(async (): Promise<string | null> => {
  try {
    const session = await getSessionProfile();
    return session.profile?.full_name?.trim() || null;
  } catch {
    return null;
  }
});

export type TodayProfessions = {
  /** The registry primary — the SAME value the card carries as
   *  `professionSlug` (`getPrimaryProfessionSlug`, null without a worker row). */
  readonly professionSlug: string | null;
  readonly professions: readonly ProfessionEntry[];
};

/**
 * The header's PROFESSION — the ONE cached profession read, never the player
 * card. `getWorkerPlayerCard` derives `professionSlug` and `professions` from
 * exactly these two readers, so the header says the same thing it did, only
 * without waiting on the card's ~18 other queries. Degrades to "unknown"
 * (empty), exactly like the old `head` catch path.
 */
export const loadTodayProfessions = cache(async (): Promise<TodayProfessions> => {
  try {
    const [professions, professionSlug] = await Promise.all([
      getProfessionEntries(),
      getPrimaryProfessionSlug(),
    ]);
    return { professionSlug, professions };
  } catch {
    return { professionSlug: null, professions: [] };
  }
});

export const loadTodayHead = cache(async (): Promise<TodayHead> => {
  const session = await getSessionProfile();
  const displayName = session.profile?.full_name?.trim() || null;
  try {
    const [card, worker, professions] = await Promise.all([
      getWorkerPlayerCard(),
      getWorkerCoreRow(),
      getProfessionEntries(),
    ]);
    if (!card)
      return { displayName, professionSlug: null, professions, workCard: null };
    const data = await getWorkerCard({
      workerId: worker?.id ?? null,
      name: displayName ?? "",
      // `getWorkerCard` reads this for PRESENCE only (`hasProfession: !!name`);
      // the human label is resolved by the screen.
      //
      // PRESENCE MEANS "THIS PERSON NAMED ONE", not "the catalogue carries it"
      // (Codex P1 on #1880, verified): with only their own words
      // `card.professionSlug` is null, so the next action told them to add a
      // profession on the same screen whose header was already showing the one
      // they had added. Matching is untouched by this — it reads
      // `getPrimaryProfessionSlug`, which still answers with a catalogue slug
      // only and is deliberately not widened.
      professionName:
        card.professionSlug ??
        professions.find((e) => (e.label ?? "").trim())?.label ??
        null,
      skillsCount: card.skillsDeclared,
      evidenceCount: card.evidenceEntries,
      // The card columns are already in hand: the request-cached core row
      // (`getWorkerCoreRow`, read above in the SAME batch as the card)
      // selects every column `getWorkerCard` reads. Handing it over removes a
      // THIRD sequential round-trip (a second `workers` select) that ran only
      // after the whole card had finished (home CLS P0, 2026-10-26).
    }, { row: worker });
    return {
      displayName: displayName ?? card.displayName,
      professionSlug: card.professionSlug,
      professions,
      workCard: deriveWorkCardState(data.signals, Date.now()),
    };
  } catch {
    // The person is still greeted; the next action is honestly unknown.
    return { displayName, professionSlug: null, professions: [], workCard: null };
  }
});

/** ONE journal read per request, shared by the header's state line and the
 *  work section (both stream separately but never read twice). */
export const loadTodayWorkIntelligence = cache(async (): Promise<WorkIntelligence | null> => {
  try {
    return await loadOwnWorkIntelligence({ focus: "today" });
  } catch {
    return null;
  }
});

export const loadTodayGrowth = cache(async (): Promise<GrowthReading | null> => {
  const wi = await loadTodayWorkIntelligence();
  if (!wi) return null;
  try {
    const primaryProfessionSlug = await getPrimaryProfessionSlug().catch(() => null);
    return deriveGrowthReading(wi, { primaryProfessionSlug });
  } catch {
    return null;
  }
});

/**
 * THE DOORS — what is waiting on the person, from the three domain readers
 * that already answer it elsewhere. Three independent reads in one batch;
 * each degrades to `null` (UNKNOWN) on its own, so one failed reader never
 * hides the other two, and no failure is ever rendered as "nothing waiting".
 *
 * Bounded: the invitation read is capped by its own module, the unread read
 * by its newest-500 window; the booking read is the bookings page's own
 * list (the same rows the conversation's offer card filters).
 */
export const loadTodayAttention = cache(async (): Promise<TodayAttention> => {
  const [offers, invitations, unread] = await Promise.all([
    listMyBookings()
      .then((res) =>
        res.kind === "ok"
          ? res.incoming.filter((b) => b.status === "proposed").length
          : null,
      )
      .catch((): number | null => null),
    listInvitationsAddressedToMe().catch(() => null),
    // The RESULT reader: a failed read is `null` (UNKNOWN), a successful
    // empty read is a zero count. The lossy `getUnreadConversationIds` could
    // never report a failure, which made this door's `null` unreachable.
    getUnreadConversationIdsResult()
      .then((res): TodayAttention["unread"] =>
        res.status === "ok"
          ? { count: res.ids.size, onlyId: res.ids.size === 1 ? ([...res.ids][0] ?? null) : null }
          : null,
      )
      .catch((): TodayAttention["unread"] => null),
  ]);
  return {
    offers,
    // An unproven mailbox still counts the account-keyed invitations; only a
    // real failure is unknown (null).
    invitations:
      invitations?.status === "ok" || invitations?.status === "email_unverified" ? invitations.total : null,
    unread,
    invitationsMailboxUnproven: invitations?.status === "email_unverified",
  };
});

export const loadTodayOpportunities = cache(async (): Promise<OpportunitiesResultView | null> => {
  try {
    return await loadOpportunitiesResultAction();
  } catch {
    return null;
  }
});
