import "server-only";

import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import {
  getEmployerWorkerAvailability,
  unavailabilityOverlaps,
} from "@/lib/planning/employer-availability";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";
import {
  CAPACITY_CHAT_LIMIT,
  CAPACITY_WINDOW_DAYS,
  type CapacityChatResult,
  type CapacityChatRow,
  type CapacityPreRead,
} from "@/lib/conversation/capacity-contract";

/**
 * THE capacity core, in its OWN module and deliberately not in `capacity.ts`.
 *
 * `capacity.ts` is a `"use server"` module, so every export it carries becomes
 * a client-callable server action. A core whose signature takes a company id
 * and a caller has no business being one of those: the arguments exist so a
 * TRUSTED server-side transport can hand in a context it already resolved, and
 * exposing them to the browser would invite exactly the confusion the split
 * prevents. The action module keeps one zero-argument export; this module
 * keeps the logic.
 */

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * THE capacity answer, transport-neutral (G4 bridge).
 *
 * `caller` absent = the cookie session — the web and chat path, unchanged.
 * `caller` present = a bearer or agent transport handing in ITS OWN RLS-scoped
 * client, so `workforce.availability` on `/api/mcp` gives an authorized
 * assistant the SAME answer the chat gives, from the same three reads. There
 * is no second capacity implementation, and there must never be: the whole
 * defect this module carries a scar from was one surface disagreeing with
 * another about who is free.
 *
 * The company id is resolved by the CALLER's own employer-context chain before
 * it reaches here, never trusted from a client.
 */
export async function whoIsAvailableCore(
  companyId: string,
  caller: { readonly supabase: SupabaseClient; readonly userId: string } | null,
  preRead?: CapacityPreRead,
): Promise<CapacityChatResult> {
  try {
    const [roster, availability, t] = await Promise.all([
      preRead?.roster ?? listActiveCompanyWorkers(companyId, caller ?? undefined),
      getEmployerWorkerAvailability(caller ?? undefined),
      // P2 object language (L1): a person the roster cannot name is said in
      // ordinary words, never as a raw id fragment.
      getTranslations("conversation.chat"),
    ]);
    if (!roster || roster.kind !== "ok" || !Array.isArray(roster.rows)) return { kind: "error" };
    const active = roster.rows.filter((w) => w.status === "active");
    if (active.length === 0) return { kind: "empty" };

    // The commitment read depends on the roster, so it cannot join the batch
    // above — it needs the worker ids that read produces. One extra stage, and
    // the alternative is asking for every worker's commitments in the company,
    // which is a wider read to save a round trip.
    const committed = await getEmployerWorkerCommitments(
      active.map((w) => w.workerId),
      caller ?? undefined,
    );

    const today = new Date();
    const end = new Date(today.getTime() + (CAPACITY_WINDOW_DAYS - 1) * 86_400_000);
    const window = { startDate: isoDay(today), endDate: isoDay(end) };
    const absencesKnown = availability.status === "ok";
    const unavailability = availability.status === "ok" ? availability.unavailability : [];

    const commitmentsKnown = committed.status === "ok";
    const commitments = committed.status === "ok" ? committed.commitments : [];

    /** The last day inside the window that a set of bands covers. */
    const lastDayOf = (
      bands: readonly { startDate: string | null; endDate: string | null }[],
    ): string | null =>
      bands
        .map((b) => b.endDate ?? b.startDate)
        .filter((d): d is string => typeof d === "string" && d.length > 0)
        .sort()
        .at(-1) ?? null;

    const rows: CapacityChatRow[] = active.map((w) => {
      const label = w.displayName ?? (w.email ? w.email.split("@")[0] : t("unnamedPerson"));
      const absent = unavailability.filter(
        (u) => u.workerId === w.workerId && unavailabilityOverlaps(window, u.item),
      );
      // ABSENCE OUTRANKS COMMITMENT — leave is the harder constraint, and a
      // person who is both booked and on leave is not "busy", they are away.
      if (absent.length > 0) {
        return {
          workerId: w.workerId,
          label,
          state: "unavailable",
          unavailableUntil: lastDayOf(absent.map((u) => u.item)),
          committedTo: null,
        };
      }
      // The SAME overlap helper the absence branch uses, so the two kinds of
      // "not free" can never drift apart on date semantics.
      const busy = commitments.filter(
        (c) => c.workerId === w.workerId && unavailabilityOverlaps(window, c),
      );
      if (busy.length > 0) {
        return {
          workerId: w.workerId,
          label,
          state: "committed",
          unavailableUntil: lastDayOf(busy),
          // A real title or nothing — never an invented name for the work.
          committedTo: busy.map((c) => c.label).find((l): l is string => !!l) ?? null,
        };
      }
      return { workerId: w.workerId, label, state: "free", unavailableUntil: null, committedTo: null };
    });
    // Free first, then committed (reprioritisable), then away (not).
    const rank = (s: CapacityChatRow["state"]) =>
      s === "free" ? 0 : s === "committed" ? 1 : 2;
    rows.sort((a, b) =>
      rank(a.state) === rank(b.state)
        ? a.label.localeCompare(b.label)
        : rank(a.state) - rank(b.state),
    );
    return { kind: "ok", from: window.startDate, to: window.endDate, rows: rows.slice(0, CAPACITY_CHAT_LIMIT), rosterTotal: active.length, absencesKnown, commitmentsKnown };
  } catch {
    return { kind: "error" };
  }
}
