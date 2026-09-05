"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getEmployerWorkerAvailability, unavailabilityOverlaps } from "@/lib/planning/employer-availability";

import {
  CAPACITY_CHAT_LIMIT,
  CAPACITY_WINDOW_DAYS,
  type CapacityChatResult,
  type CapacityChatRow,
} from "@/lib/conversation/capacity-contract";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Kas laisvas šią savaitę?" — the company's ACTIVE roster (the same read
 * the company page's roster section performs) against the employer-side
 * unavailability read (approved absences; the query never carries the
 * reason). A worker is FREE when no approved absence overlaps the window,
 * otherwise UNAVAILABLE until the last overlapping day. No ranking, no new
 * table, no write. Every degraded state is a named kind.
 */
export async function loadWhoIsAvailableForChat(): Promise<CapacityChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  try {
    const [roster, availability, t] = await Promise.all([
      listActiveCompanyWorkers(company.companyId),
      getEmployerWorkerAvailability(),
      // P2 object language (L1): a person the roster cannot name is said in
      // ordinary words, never as a raw id fragment.
      getTranslations("conversation.chat"),
    ]);
    if (roster.kind !== "ok") return { kind: "error" };
    const active = roster.rows.filter((w) => w.status === "active");
    if (active.length === 0) return { kind: "empty" };

    const today = new Date();
    const end = new Date(today.getTime() + (CAPACITY_WINDOW_DAYS - 1) * 86_400_000);
    const window = { startDate: isoDay(today), endDate: isoDay(end) };
    const absencesKnown = availability.status === "ok";
    const unavailability = availability.status === "ok" ? availability.unavailability : [];

    const rows: CapacityChatRow[] = active.map((w) => {
      const label = w.displayName ?? (w.email ? w.email.split("@")[0] : t("unnamedPerson"));
      const hits = unavailability.filter((u) => u.workerId === w.workerId && unavailabilityOverlaps(window, u.item));
      if (hits.length === 0) return { workerId: w.workerId, label, state: "free", unavailableUntil: null };
      const until = hits
        .map((u) => u.item.endDate ?? u.item.startDate)
        .filter((d): d is string => typeof d === "string" && d.length > 0)
        .sort()
        .at(-1) ?? null;
      return { workerId: w.workerId, label, state: "unavailable", unavailableUntil: until };
    });
    rows.sort((a, b) => (a.state === b.state ? a.label.localeCompare(b.label) : a.state === "free" ? -1 : 1));
    return { kind: "ok", from: window.startDate, to: window.endDate, rows: rows.slice(0, CAPACITY_CHAT_LIMIT), rosterTotal: active.length, absencesKnown };
  } catch {
    return { kind: "error" };
  }
}
