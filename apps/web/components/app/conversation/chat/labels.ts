import type { getTranslations } from "next-intl/server";

import type { ChatLabels } from "./conversation-chat";
import type { WorkLogLabels } from "@/components/app/conversation/worker-worklog-flow";

type T = Awaited<ReturnType<typeof getTranslations>>;

const CHAT_KEYS = [
  "headerTitle", "assistantName", "speakerYou", "advanced", "navChat", "navMessages", "navCalendar", "navProfile",
  "composerPlaceholder", "send", "attach", "greeting",
  "chipCv", "chipJobs", "chipProfile", "chipOffers", "chipLang",
  "chipExp", "chipEdu", "chipCard", "chipPrefs", "offersEmpty",
  "fallback", "userCv", "userProfile", "userOffers", "userJobs",
  "clarifyWorkLog", "calendarHint", "reminderBlocked", "translateBlocked",
  "writeEmployerHint",
] as const;

const WORKLOG_KEYS = [
  "understood", "loading", "noContext", "noContextCta", "noWorker", "notAuthed",
  "labelDate", "labelTime", "labelBreak", "labelHours", "labelSite", "labelNotes",
  "labelContext", "save", "cancel", "working", "confirmTitle", "saved",
  "errorGeneric", "minutesUnit",
] as const;

/** Resolve the flat chat label bag from a `conversation.chat`-scoped translator.
 *
 *  `greetingNamed` carries a `{name}` placeholder, so it is resolved separately
 *  by the caller that actually knows the name — it must never be rendered with
 *  the raw placeholder showing. */
export function resolveChatLabels(t: T): ChatLabels {
  const out = {} as Record<(typeof CHAT_KEYS)[number], string>;
  for (const k of CHAT_KEYS) out[k] = t(k);
  return out as ChatLabels;
}

/** Resolve the work-log label bag from a `conversation.worklog`-scoped translator. */
export function resolveWorkLogLabels(t: T): WorkLogLabels {
  const out = {} as Record<(typeof WORKLOG_KEYS)[number], string>;
  for (const k of WORKLOG_KEYS) out[k] = t(k);
  return out as WorkLogLabels;
}
