"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { getPlanning } from "@/lib/planning/planning";
import {
  PLANNING_WINDOW_DAYS,
  buildAgenda,
  visibleRange,
} from "@/lib/planning/planning-model";

/**
 * Conversation "show my calendar" — a THIN presentation adapter over the
 * canonical Time Engine read (`getPlanning` → `buildAgenda`), Time Engine W2.
 *
 * Before this adapter the `calendar-view` intent answered with a navigation
 * HINT ("the calendar lives on the Kalendorius tab") — the chat could not
 * actually answer "what is my plan?". Now it reads the SAME canonical
 * projection the /dashboard/planning page renders (one calendar, one model,
 * one conflict rule — the anti-second-calendar guard stays intact because
 * this module builds no view of its own and reads no table of its own).
 *
 * Honesty contract:
 *   - every line is a real record from the caller's own RLS-scoped sources;
 *   - an empty window says so ("nothing planned") — never invented items;
 *   - REAL conflicts (approved leave × accepted booking, overlapping
 *     assigned commitments) are stated plainly, because a calendar that
 *     presents an impossible plan as fine is lying.
 */

export type AgendaChatResult =
  | { kind: "blocked" }
  | { kind: "summary"; text: string; conflictCount: number };

/** Bounded output: the chat shows at most this many day lines. */
const CHAT_AGENDA_DAY_LIMIT = 5;
/** …and at most this many items per day line. */
const CHAT_AGENDA_ITEMS_PER_DAY = 3;

export async function loadAgendaSummary(
  locale: string,
): Promise<AgendaChatResult> {
  const range = visibleRange("agenda", new Date().toISOString().slice(0, 10));
  const planning = await getPlanning({
    rangeStart: range.start,
    rangeEnd: range.end,
  });
  if (planning.status !== "ok") return { kind: "blocked" };

  const [t, tPlanning, tAll] = await Promise.all([
    getTranslations({ locale, namespace: "conversation.chat" }),
    getTranslations({ locale, namespace: "planning" }),
    getTranslations({ locale }),
  ]);

  const agenda = buildAgenda(planning.items, new Date(), PLANNING_WINDOW_DAYS);
  const conflictCount = agenda.conflicts.length;

  if (agenda.days.length === 0 && conflictCount === 0) {
    const empty =
      agenda.undated.length > 0
        ? `${t("agendaEmpty", { days: PLANNING_WINDOW_DAYS })} ${t("agendaUndated", { count: agenda.undated.length })}`
        : t("agendaEmpty", { days: PLANNING_WINDOW_DAYS });
    return { kind: "summary", text: empty, conflictCount: 0 };
  }

  const dayFmt = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  });

  const lines: string[] = [t("agendaTitle", { days: PLANNING_WINDOW_DAYS })];
  for (const group of agenda.days.slice(0, CHAT_AGENDA_DAY_LIMIT)) {
    const dayLabel = dayFmt.format(new Date(`${group.day}T00:00:00Z`));
    const parts = group.items.slice(0, CHAT_AGENDA_ITEMS_PER_DAY).map((item) => {
      const source = tPlanning(`source.${item.sourceType}`);
      const name = item.label ?? tPlanning(`fallback.${item.sourceType}`);
      const status = tAll(item.statusKey);
      const conflictMark = agenda.conflictIds.has(item.id) ? " ⚠" : "";
      return `${source}: ${name} (${status})${conflictMark}`;
    });
    const more = group.items.length - CHAT_AGENDA_ITEMS_PER_DAY;
    lines.push(
      `• ${dayLabel} — ${parts.join(" · ")}${more > 0 ? ` ${t("agendaMore", { count: more })}` : ""}`,
    );
  }
  const hiddenDays = agenda.days.length - CHAT_AGENDA_DAY_LIMIT;
  if (hiddenDays > 0) lines.push(t("agendaMoreDays", { count: hiddenDays }));
  if (conflictCount > 0) lines.push(t("agendaConflicts", { count: conflictCount }));

  return { kind: "summary", text: lines.join("\n"), conflictCount };
}
