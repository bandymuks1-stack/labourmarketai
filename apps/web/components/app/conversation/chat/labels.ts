import type { getTranslations } from "next-intl/server";

import type { ChatLabels } from "./conversation-chat";
import type { WorkLogLabels } from "@/components/app/conversation/worker-worklog-flow";

type T = Awaited<ReturnType<typeof getTranslations>>;

const CHAT_KEYS = [
  "headerTitle", "assistantName", "speakerYou", "navChat", "navJournal", "navMessages", "navCalendar", "navProfile",
  "composerPlaceholder", "send", "attach", "greeting",
  "chipCv", "chipJobs", "chipProfile", "chipOffers", "chipLang",
  "chipExp", "chipEdu", "chipCard", "chipPrefs", "offersEmpty",
  "searchAskCriteria", "playerCardAfterLog", "playerCardOpened",
  // `userFindWork` doubles as the CONTINUE label on the saved criteria form
  // (beta audit W-J1): the button that actually runs the promised search must
  // say "Find work", not "Add another". Key already exists in all catalogues.
  "fallback", "userCv", "userProfile", "userOffers", "userJobs", "userFindWork",
  "chipLogWork", "userLogWork",
  "chipAgenda", "userAgenda", "chipNeedWorkers", "chipCandidates",
  "chipCompanyHub", "companyDemandNext", "chipTasks",
  "clarifyWorkLog", "calendarHint", "messagesHint", "reminderBlocked", "translateBlocked",
  "writeEmployerHint",
  // W7 slice 2 — intent-aware attach.
  "attachChoice", "chipAttachPhoto", "chipAttachCv", "userAttachPhoto",
  // W6 slice 3D — the experience entry point. Four states because the answer
  // is always the person's REAL state, never a prompt to write something.
  "experiencesEligible", "experiencesAllSubmitted", "experiencesNothingYet",
  "experiencesUnavailable", "experienceLeave",
  // W8 — the employer's hiring stage. Five states because "no company",
  // "no needs yet" and "the read failed" are three different truths, and
  // none of them may be rendered as one of the others.
  "userCandidates", "candidatesOpened", "candidatesNoDemands",
  "candidatesNoCompany", "candidatesUnavailable",
  // W11 — projects and the assignment step. Same rule as above: "no project",
  // "no company" and "the read failed" are three different truths.
  "chipProjects", "userProjects", "projectsOpened", "projectsNone",
  "projectsNoCompany", "projectsUnavailable",
  "assignPickWorker", "assignNoWorkers", "assignUnavailable",
  "assignDone", "assignFailed",
  // §7.1 — work relationships. Same rule again: "none recorded", "no company"
  // and "the read failed" are three different truths and stay three sentences.
  "chipEngagements", "userEngagements", "engagementsOpened", "engagementsNone",
  "engagementsNoCompany", "engagementsUnavailable",
] as const;

const WORKLOG_KEYS = [
  "understood", "loading", "noContext", "noContextCta", "noWorker", "notAuthed",
  "labelDate", "labelTime", "labelBreak", "labelHours", "labelSite", "labelNotes",
  "labelContext", "save", "cancel", "working", "confirmTitle", "saved",
  "errorGeneric", "minutesUnit",
  // PR-C "what changed" completion summary (real pipeline outcome only).
  "addedSkillPrefix", "strengthenedSkillPrefix", "pendingConfirmPrefix",
  "cvUpdatedNote", "matchingNote", "pipelineFailedNote",
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
