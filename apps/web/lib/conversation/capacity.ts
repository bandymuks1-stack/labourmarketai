"use server";

import "server-only";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { whoIsAvailableCore } from "@/lib/conversation/capacity-core";

import type {
  CapacityChatResult,
  CapacityPreRead,
} from "@/lib/conversation/capacity-contract";

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
  return whoIsAvailableCore(company.companyId, null, preRead);
}

