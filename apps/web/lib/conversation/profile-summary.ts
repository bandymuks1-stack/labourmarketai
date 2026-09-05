"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getWorkerActivity } from "@/lib/conversation/worker-activity";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import {
  deriveWorkerReadiness,
  type ReadinessPillarKey,
} from "@/lib/player-card/readiness";
import type {
  ChatProfileSummary,
  ProfileSummaryVariant,
} from "./profile-summary-contract";
import { formatUtcDate } from "@/lib/time/display";

/**
 * Conversation "profile summary" — a THIN presentation adapter over the
 * canonical Player Card readiness model.
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
 * ONE COMPLETENESS SOURCE (owner rebuild 2026-07-29, W5): the chat used to
 * count its own five profile checkpoints while the Live Profile Card showed
 * six readiness pillars — two different "how complete am I" numbers about the
 * same person. Now the summary derives NOTHING of its own: the counts and the
 * named gaps come from `deriveWorkerReadiness(getWorkerPlayerCard())` — the
 * SAME pillars, the SAME order and the SAME i18n labels
 * (`playerCard.readinessSteps.pillar.*`) the card renders. The activity read
 * model stays the owner of the journal-continuity facts this module still
 * reports (worker-profile existence and the honest last-activity line).
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

  const [activity, card] = await Promise.all([
    getWorkerActivity(user.id),
    getWorkerPlayerCard(),
  ]);
  if (!activity.hasWorkerProfile || !card) {
    // A company-only account has no worker profile — say so rather than
    // reporting "0 of N complete" about a profile that does not exist.
    return { kind: "blocked", message: t("blockedNoWorker") };
  }

  const readiness = deriveWorkerReadiness(card);
  // Two label sets, one per state (prod walk 2026-09-05, fresh person): the
  // steps list phrases a pillar as DONE ("Prieinamumas nurodytas"), so a
  // missing pillar must be named as a thing ("Prieinamumas") - the brief said
  // "Profilyje dar truksta: Prieinamumas nurodytas." Both namespaces are the
  // card's own (playerCard.*), no third label set.
  const tDone = await getTranslations("playerCard.readinessSteps.pillar");
  const tName = await getTranslations("playerCard.readiness.pillars");
  const done: string[] = [];
  const missing: string[] = [];
  const missingKeys: ReadinessPillarKey[] = [];
  for (const pillar of readiness.pillars) {
    if (pillar.met) {
      done.push(tDone(pillar.key));
    } else {
      missing.push(tName(pillar.key));
      missingKeys.push(pillar.key);
    }
  }

  return {
    kind: "summary",
    intro: introFor(variant, readiness.met, readiness.total, missing.length, t),
    done,
    missing,
    missingKeys,
    // The readiness model's own counts — not recomputed here either.
    stepsDone: readiness.met,
    stepsTotal: readiness.total,
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
    date:
      formatUtcDate(when, locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }) ?? "",
  });
}
