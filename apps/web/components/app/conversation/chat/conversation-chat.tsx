"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ConversationHeader, ConversationBottomNav } from "./conversation-header";
import { ConversationThread, type ThreadItem } from "./conversation-thread";
import { Composer } from "./composer";
import type { ChatMessage, ChoiceChip } from "./types";
import { InlineActionForm } from "@/components/app/conversation/inline-action-form";
import { WorkerCvFlow } from "@/components/app/conversation/worker-cv-flow";
import {
  WorkerBookingAction,
  type BookingActionLabels,
} from "@/components/app/conversation/worker-booking-action";
import {
  WorkerWorkLogFlow,
  type WorkLogLabels,
} from "@/components/app/conversation/worker-worklog-flow";
import { getWorkerForm } from "@/lib/conversation/worker-forms";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { findWorkForChat } from "@/lib/conversation/find-work";
import type { BookingOffer } from "@/components/app/conversation/conversation-shell";

/** Client-side current date as YYYY-MM-DD (the deterministic work-log extractor
 *  takes `today` as a param so it stays pure). */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type ChatLabels = {
  headerTitle: string;
  advanced: string;
  navChat: string;
  navMessages: string;
  navCalendar: string;
  navProfile: string;
  composerPlaceholder: string;
  send: string;
  attach: string;
  greeting: string;
  chipCv: string;
  chipJobs: string;
  chipProfile: string;
  chipOffers: string;
  profileQuestion: string;
  chipLang: string;
  chipExp: string;
  chipEdu: string;
  chipCard: string;
  chipPrefs: string;
  jobsAnswer: string;
  offersEmpty: string;
  fallback: string;
  userCv: string;
  userProfile: string;
  userOffers: string;
  userJobs: string;
  // Orchestrator intent responses (deterministic; honest where a real
  // mechanism does not yet exist).
  clarifyWorkLog: string;
  calendarHint: string;
  reminderBlocked: string;
  translateBlocked: string;
  writeEmployerHint: string;
  nextActionAnswer: string;
  resumeAnswer: string;
};

let uid = 0;
const nid = () => `m${uid++}`;

/**
 * The real conversation window (Real Conversation UI). The WHOLE surface is one
 * chat: a message stream + a bottom composer. The empty state greets the user
 * and offers a few conversation starters; picking one becomes a user message
 * and the assistant continues the dialogue IN the stream — CV import, profile
 * forms, and booking offers all render as messages via the existing (real,
 * safe) flows. No dashboard cards, no module catalogue, no "open here" links as
 * the primary path. Advanced mode is the one escape hatch in the header.
 *
 * A `script` prop seeds a fixed sample thread for the dev-only design preview
 * (screenshots) without touching the live behaviour.
 */
export function ConversationChat({
  labels,
  workLogLabels,
  locale,
  bookingOffers = [],
  bookingLabels = null,
  script,
  mobile = false,
}: {
  labels: ChatLabels;
  workLogLabels: WorkLogLabels;
  locale: string;
  bookingOffers?: BookingOffer[];
  bookingLabels?: BookingActionLabels | null;
  script?: ChatMessage[];
  /** Force the phone layout — used by the mobile design preview frame. */
  mobile?: boolean;
}) {
  const starterChips: ChoiceChip[] = useMemo(
    () => [
      { id: "cv", label: labels.chipCv },
      { id: "jobs", label: labels.chipJobs },
      { id: "profile", label: labels.chipProfile },
      { id: "offers", label: labels.chipOffers },
    ],
    [labels],
  );

  const initial: ThreadItem[] = useMemo(() => {
    if (script) return script.map((message) => ({ id: message.id, message }));
    return [
      {
        id: nid(),
        message: {
          id: nid(),
          role: "assistant",
          kind: "text",
          text: labels.greeting,
          chips: starterChips,
        } as ChatMessage,
      },
    ];
  }, [script, labels.greeting, starterChips]);

  const [items, setItems] = useState<ThreadItem[]>(initial);
  const [typing, setTyping] = useState(false);

  const pushMessage = useCallback((message: ChatMessage) => {
    setItems((prev) => [...prev, { id: message.id, message }]);
  }, []);
  const pushEmbed = useCallback((embed: ReactNode) => {
    setItems((prev) => [...prev, { id: nid(), embed }]);
  }, []);
  const assistant = useCallback(
    (text: string, chips?: ChoiceChip[]) =>
      pushMessage({ id: nid(), role: "assistant", kind: "text", text, chips }),
    [pushMessage],
  );
  const user = useCallback(
    (text: string) => pushMessage({ id: nid(), role: "user", kind: "text", text }),
    [pushMessage],
  );

  const withTyping = useCallback((fn: () => void) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      fn();
    }, 350);
  }, []);

  const openForm = useCallback(
    (actionId: string) => {
      const spec = getWorkerForm(actionId);
      if (spec) {
        pushEmbed(
          <InlineActionForm
            spec={spec}
            locale={locale}
            onClose={() => assistant(labels.fallback, starterChips)}
          />,
        );
      }
    },
    [locale, assistant, labels.fallback, starterChips, pushEmbed],
  );

  /** Real employer/opportunity search — its own typing lifecycle (async). */
  const startFindWork = useCallback(() => {
    setTyping(true);
    findWorkForChat()
      .then((res) => {
        setTyping(false);
        if (res.kind === "matches") {
          pushMessage({
            id: nid(),
            role: "assistant",
            kind: "employer-match",
            intro: res.intro,
            matches: res.matches,
          });
        } else {
          assistant(res.message, starterChips);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.fallback, starterChips);
      });
  }, [pushMessage, assistant, starterChips, labels.fallback]);

  /** Work-log from a natural sentence → real journal save (deterministic). */
  const startWorkLog = useCallback(
    (text: string) => {
      const draft = extractWorkLog(text, todayIso());
      if (!draft.hasSignal) {
        // Data unclear → ask ONE concrete question (brief §3).
        assistant(labels.clarifyWorkLog);
        return;
      }
      pushEmbed(
        <WorkerWorkLogFlow
          draft={draft}
          locale={locale}
          labels={workLogLabels}
          onClose={() => assistant(labels.fallback, starterChips)}
        />,
      );
    },
    [assistant, pushEmbed, locale, workLogLabels, labels.clarifyWorkLog, labels.fallback, starterChips],
  );

  const handleChip = useCallback(
    (chip: ChoiceChip) => {
      switch (chip.id) {
        case "cv":
          user(labels.userCv);
          withTyping(() => pushEmbed(<WorkerCvFlow onClose={() => assistant(labels.fallback, starterChips)} />));
          break;
        case "profile":
          user(labels.userProfile);
          withTyping(() =>
            assistant(labels.profileQuestion, [
              { id: "f:worker.add-language", label: labels.chipLang },
              { id: "f:worker.add-work-history", label: labels.chipExp },
              { id: "f:worker.add-education", label: labels.chipEdu },
              { id: "f:worker.save-work-card", label: labels.chipCard },
              { id: "f:worker.save-preferences", label: labels.chipPrefs },
            ]),
          );
          break;
        case "offers":
          user(labels.userOffers);
          withTyping(() => {
            if (bookingOffers.length > 0 && bookingLabels) {
              bookingOffers.forEach((o) =>
                pushEmbed(
                  <WorkerBookingAction
                    bookingId={o.bookingId}
                    locale={locale}
                    title={o.title || bookingLabels.offerFrom}
                    subtitle={o.subtitle}
                    labels={bookingLabels}
                  />,
                ),
              );
            } else {
              assistant(labels.offersEmpty, starterChips);
            }
          });
          break;
        case "jobs":
          user(labels.userJobs);
          // Real search now, not a canned answer.
          startFindWork();
          break;
        default:
          if (chip.id.startsWith("f:")) {
            openForm(chip.id.slice(2));
          }
      }
    },
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips, startFindWork],
  );

  const handleSend = useCallback(
    (text: string) => {
      user(text);
      const { intent } = classifyIntent(text);
      // find-work runs a real async server search with its own typing cue.
      if (intent === "find-work") {
        startFindWork();
        return;
      }
      withTyping(() => {
        switch (intent) {
          case "cv":
            handleChip({ id: "cv", label: "" });
            break;
          case "offers":
            handleChip({ id: "offers", label: "" });
            break;
          case "profile":
            handleChip({ id: "profile", label: "" });
            break;
          case "log-work":
            startWorkLog(text);
            break;
          case "calendar-view":
            assistant(labels.calendarHint, starterChips);
            break;
          case "reminder":
            // No scheduler exists — never a fake reminder (honest degradation).
            assistant(labels.reminderBlocked, starterChips);
            break;
          case "translate":
            // No real translation engine — never a fake translation.
            assistant(labels.translateBlocked, starterChips);
            break;
          case "write-employer":
            assistant(labels.writeEmployerHint, starterChips);
            break;
          case "next-action":
            assistant(labels.nextActionAnswer, starterChips);
            break;
          case "resume":
            assistant(labels.resumeAnswer, starterChips);
            break;
          default:
            assistant(labels.fallback, starterChips);
        }
      });
    },
    [user, withTyping, handleChip, assistant, labels, starterChips, startFindWork, startWorkLog],
  );

  const nav = {
    chat: labels.navChat,
    messages: labels.navMessages,
    calendar: labels.navCalendar,
    profile: labels.navProfile,
    advanced: labels.advanced,
  };

  return (
    <div className={`flex flex-col bg-ink-900 ${mobile ? "h-full" : "h-[100dvh]"}`} data-testid="conversation-chat">
      <ConversationHeader title={labels.headerTitle} nav={nav} mobile={mobile} />
      <ConversationThread
        items={items}
        typing={typing}
        handlers={{
          onChip: handleChip,
          onConfirm: () => {},
          onCancel: () => {},
        }}
      />
      <Composer
        placeholder={labels.composerPlaceholder}
        attachLabel={labels.attach}
        sendLabel={labels.send}
        onSend={handleSend}
        onAttach={() => handleChip({ id: "cv", label: "" })}
      />
      <ConversationBottomNav nav={nav} mobile={mobile} />
    </div>
  );
}
