/**
 * "Mano susidomėjimai" view builder (Canonical Ideas Integration v1,
 * extension A) — PURE, no DB, no IO.
 *
 * Turns the worker's OWN interest rows (lib/opportunities/interest.ts →
 * listMyInterestSignals — worker_id-filtered + RLS) into the compact list the
 * opportunities page renders. The list is INDEPENDENT of current board
 * visibility: a signal whose demand closed still shows, labelled honestly
 * ("Poreikis nebeaktyvus"), with facts taken from the snapshot context the
 * worker saw at click time — never fabricated, degraded to an honest
 * "not stated" when an old row has no context.
 *
 * ONE next action per row, EXISTING actions only:
 *   - contacted            → open the real in-app conversation list;
 *   - interested/reviewed, demand still open  → contact the employer
 *     (contactEmployerAction — re-verifies everything server-side);
 *   - interested/reviewed, demand closed      → withdraw (own-row update);
 *   - withdrawn, demand still open            → view the demand on the board;
 *   - withdrawn, demand closed                → none (honest history only).
 * No new server mutations exist for this section.
 */

import type { InterestStatus } from "./interest-snapshot";
import {
  parseInterestCvStash,
  parseSnapshotContext,
} from "./interest-snapshot";
import type { MyInterestRow } from "./interest";

export type MyInterestNextAction =
  | "contact_employer"
  | "open_conversation"
  | "withdraw"
  | "view_demand"
  | "none";

export interface MyInterestViewRow {
  readonly requestId: string;
  readonly status: InterestStatus;
  /** False ⇒ the demand is gone from the worker board (closed/unpublished) —
   *  the row stays visible with the honest "no longer active" label. */
  readonly stillOpen: boolean;
  /** Role slug — live board value first, snapshot context fallback, null
   *  when neither exists (UI shows its honest "not stated" line). */
  readonly roleText: string | null;
  readonly companyName: string | null;
  readonly locationLabel: string | null;
  readonly country: string | null;
  /** Last activity timestamp (updated_at, falls back to created_at). */
  readonly dateIso: string | null;
  readonly nextAction: MyInterestNextAction;
  /** Tailored-CV link target (extension C): present ONLY while the demand is
   *  still open (the tailored render needs board visibility — a link that
   *  would silently fall back is not offered). Template from the validated
   *  cv stash, default when a row predates the stash. */
  readonly cvTemplate: string | null;
}

export function nextActionFor(
  status: InterestStatus,
  stillOpen: boolean,
): MyInterestNextAction {
  if (status === "contacted") return "open_conversation";
  if (status === "withdrawn") return stillOpen ? "view_demand" : "none";
  // interested | reviewed
  return stillOpen ? "contact_employer" : "withdraw";
}

export interface LiveNeedFacts {
  readonly roleText: string | null;
  readonly companyName: string | null;
  readonly locationLabel: string | null;
  readonly country: string | null;
}

const DEFAULT_TEMPLATE = "standard";

export function buildMyInterestView(
  rows: readonly MyInterestRow[],
  liveNeedById: ReadonlyMap<string, LiveNeedFacts>,
): MyInterestViewRow[] {
  return rows.map((row) => {
    const live = liveNeedById.get(row.requestId) ?? null;
    const stillOpen = live !== null;
    const ctx = parseSnapshotContext(row.matchSnapshot);
    const stash = parseInterestCvStash(row.matchSnapshot);
    return {
      requestId: row.requestId,
      status: row.status,
      stillOpen,
      roleText: live?.roleText ?? ctx.role_text,
      companyName: live?.companyName ?? ctx.company_name,
      locationLabel: live?.locationLabel ?? ctx.location_label,
      country: live?.country ?? ctx.country,
      dateIso: row.updatedAt ?? row.createdAt,
      nextAction: nextActionFor(row.status, stillOpen),
      cvTemplate: stillOpen ? (stash?.template ?? DEFAULT_TEMPLATE) : null,
    };
  });
}
