"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  WORKER_PROFILE_STEPS,
  getWorkerActivity,
} from "@/lib/conversation/worker-activity";
import type {
  ChatProfileSummary,
  ProfileSummaryVariant,
} from "./profile-summary-contract";

/**
 * Conversation "profile summary" — a THIN presentation adapter over the
 * canonical worker activity/completeness read model.
 *
 * WHY IT EXISTS: the chat used to answer "show my profile" / "what's left?" /
 * "where did I stop?" with three fixed sentences. A canned answer is the same
 * class of defect as a fabricated one — it claims to know the user's state
 * while knowing nothing. It also made the conversation amnesiac across a
 * reload: the thread is session-only by design (transcript persistence is a
 * separate owner-gated proposal, docs/proposals/assistant-transcript-v1), so
 * the only honest continuity is the REAL state, re-read from the database on
 * every turn. That is what this returns — which is why the same summary is
 * correct after a refresh and after a fresh login.
 *
 * It derives NOTHING: `getWorkerActivity` performs the five presence checks
 * against the worker's own canonical rows (profile text, skill claims,
 * languages, availability, engagements) and this module only localizes them.
 * No parallel profile store, no second completeness rule, no invented signal —
 * a missing fact is reported as missing.
 */
export async function loadProfileSummaryForChat(
  variant: ProfileSummaryVariant,
): Promise<ChatProfileSummary> {
  const t = await getTranslations("conversation.summary");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "blocked", message: t("blockedNotSignedIn") };

  const activity = await getWorkerActivity(user.id);
  if (!activity.hasWorkerProfile) {
    // A company-only account has no worker profile — say so rather than
    // reporting "0 of 5 complete" about a profile that does not exist.
    return { kind: "blocked", message: t("blockedNoWorker") };
  }

  const tSteps = await getTranslations("conversation.journal.steps");
  const done: string[] = [];
  const missing: string[] = [];
  for (const step of WORKER_PROFILE_STEPS) {
    (activity.steps[step] ? done : missing).push(tSteps(step));
  }

  return {
    kind: "summary",
    intro: introFor(variant, activity.stepsDone, activity.stepsTotal, missing.length, t),
    done,
    missing,
    lastActivity: await lastActivityLine(activity.events[0] ?? null),
  };
}

type T = Awaited<ReturnType<typeof getTranslations>>;

/** The opening line. Complete profiles get a different sentence from partial
 *  ones — telling someone what is left when nothing is left is noise. */
function introFor(
  variant: ProfileSummaryVariant,
  done: number,
  total: number,
  missingCount: number,
  t: T,
): string {
  if (missingCount === 0) {
    return variant === "profile" ? t("introComplete") : t("introCompleteNext");
  }
  const key =
    variant === "next" ? "introNext" : variant === "resume" ? "introResume" : "introProfile";
  return t(key, { done, total });
}

/** "Last: added a language — 20 Jul 2026", or null when there is no activity.
 *  The date is the server-stored timestamp, formatted in the active locale. */
async function lastActivityLine(
  event: { key: string; at: string } | null,
): Promise<string | null> {
  if (!event) return null;
  const t = await getTranslations("conversation.summary");
  const tEvents = await getTranslations("conversation.journal.events");
  const locale = await getLocale();
  const when = new Date(event.at);
  if (Number.isNaN(when.getTime())) return null;
  return t("lastActivity", {
    event: tEvents(event.key),
    date: when.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  });
}
