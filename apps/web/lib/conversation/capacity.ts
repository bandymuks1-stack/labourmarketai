"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getEmployerWorkerAvailability, unavailabilityOverlaps } from "@/lib/planning/employer-availability";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";

import {
  CAPACITY_CHAT_LIMIT,
  CAPACITY_WINDOW_DAYS,
  type CapacityChatResult,
  type CapacityChatRow,
  type CapacityPreRead,
} from "@/lib/conversation/capacity-contract";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Kas laisvas šią savaitę?" — the company's ACTIVE roster (the same read
 * the company page's roster section performs) against BOTH things that can
 * make a person not free: the employer-side unavailability read (approved
 * absences; the query never carries the reason) and their committed work
 * (accepted bookings and active project assignments).
 *
 * ── WHY BOTH, AND WHY THIS WAS WRONG ──────────────────────────────────────
 * Until 2026-09-07 this read ONE signal: approved absences. Measured on
 * production that day — `worker_absences` 0 rows, `booking_requests` 1
 * accepted, `project_worker_assignments` 3 active. The one input capacity
 * consulted was empty and the only real commitments that existed were
 * invisible, so every worker read as FREE, always. An employer planning next
 * week was told the opposite of what the calendar showed on the same screen.
 *
 * A worker is FREE when neither an absence nor a commitment overlaps the
 * window; UNAVAILABLE when an absence does; COMMITTED when only work does.
 * Absence outranks commitment because leave is the harder constraint. No
 * ranking, no new table, no write. Every degraded state is a named kind, and
 * an input that did not answer is reported as unknown rather than as "no".
 *
 * `preRead` (QA Q-3): a server caller that has ALREADY issued the roster read
 * for the same request (the company home, which the company page composes
 * next to its own roster section) hands it in, and the roster is not queried
 * twice. Without it — the chat's path — the read is unchanged. This module is
 * a server action, so the argument is client-controllable in principle: it
 * can only stand in for the caller's OWN roster rows (the absence read stays
 * the caller's, RLS-scoped, and the company context is still required), and
 * every row passes the same shape checks — nothing here reads more than the
 * zero-argument call could.
 */
export async function loadWhoIsAvailableForChat(
  preRead?: CapacityPreRead,
): Promise<CapacityChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  try {
    const [roster, availability, t] = await Promise.all([
      preRead?.roster ?? listActiveCompanyWorkers(company.companyId),
      getEmployerWorkerAvailability(),
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
    const committed = await getEmployerWorkerCommitments(active.map((w) => w.workerId));

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
