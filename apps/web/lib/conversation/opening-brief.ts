"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import { buildWorkContext } from "@/lib/conversation/context-intelligence";
import { loadProfileSummaryForChat } from "@/lib/conversation/profile-summary";
import { CHIP_FOR_STEP } from "@/lib/conversation/worker-activity-chips";

/**
 * THE OPENING BRIEF (owner ruling 2026-07-29, W2).
 *
 * The chat's first words must not be "Kuo šiandien galiu padėti?" — the
 * product KNOWS things about this person, and pretending otherwise is the
 * "search box dressed as a conversation" failure. This composes the opening
 * from the three canonical reads that already exist, in priority order:
 *
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

  // 4 ── the first missing profile step ────────────────────────────────────
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
