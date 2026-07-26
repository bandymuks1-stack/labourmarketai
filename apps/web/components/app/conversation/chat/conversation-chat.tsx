"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuthOptional } from "@/lib/auth/context";
import { ConversationHeader, ConversationBottomNav } from "./conversation-header";
import { ConversationThread, type ThreadItem } from "./conversation-thread";
import { Composer } from "./composer";
import type { ChatMessage, ChoiceChip } from "./types";
import { InlineActionForm } from "@/components/app/conversation/inline-action-form";
import { WorkerCvFlow } from "@/components/app/conversation/worker-cv-flow";
import {
  WorkerBookingAction,
  type BookingActionLabels,
  type BookingOffer,
} from "@/components/app/conversation/worker-booking-action";
import {
  WorkerWorkLogFlow,
  type WorkLogLabels,
} from "@/components/app/conversation/worker-worklog-flow";
import { getWorkerForm } from "@/lib/conversation/worker-forms";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { findWorkForChat } from "@/lib/conversation/find-work";
import { loadProfileSummaryForChat } from "@/lib/conversation/profile-summary";
import type { ProfileSummaryVariant } from "@/lib/conversation/profile-summary-contract";
import type { WorkerProfileStep } from "@/lib/conversation/worker-activity";

/** Client-side current date as YYYY-MM-DD (the deterministic work-log extractor
 *  takes `today` as a param so it stays pure). */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type ChatLabels = {
  headerTitle: string;
  assistantName: string;
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
  chipLang: string;
  chipExp: string;
  chipEdu: string;
  chipCard: string;
  chipPrefs: string;
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
};

/**
 * Which profile action genuinely fixes which checkpoint.
 *
 * Deliberately PARTIAL. `about` and `skills` have no chip in this row — about
 * text is edited on the profile screen and skills are recognised from the CV or
 * the work journal — so when one of those is the first gap the row simply
 * offers no recommendation. That is the honest outcome: a recommendation exists
 * only where a listed action really closes the gap the server reported.
 */
const CHIP_FOR_STEP: Partial<Record<WorkerProfileStep, string>> = {
  languages: "f:worker.add-language",
  workHistory: "f:worker.add-work-history",
  availability: "f:worker.save-work-card",
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

  /**
   * The greeting says the user's name when the product already knows it.
   *
   * "Hi. How can I help you today?" is a search box pretending to be a
   * conversation — it proves the system knows nothing about you. The name is
   * ALREADY in the client auth context (the header renders initials from it),
   * so this costs no new query, no new API and no page-load work; it is the
   * same fact, used once more. No name → the neutral greeting, never an
   * invented one.
   */
  const t = useTranslations("conversation.chat");
  const auth = useAuthOptional();
  const firstName = useMemo(() => {
    const full = auth?.profile?.full_name?.trim();
    if (!full) return null;
    const first = full.split(/\s+/)[0];
    // Guard against a pasted paragraph or an email fragment in the name field.
    return first && first.length <= 24 ? first : null;
  }, [auth?.profile?.full_name]);

  const greetingText = firstName
    ? t("greetingNamed", { name: firstName })
    : labels.greeting;

  const initial: ThreadItem[] = useMemo(() => {
    if (script) return script.map((message) => ({ id: message.id, message }));
    return [
      {
        id: nid(),
        message: {
          id: nid(),
          role: "assistant",
          // The opening turn is the screen's page title, not a chat bubble.
          kind: "greeting",
          text: greetingText,
          assistantName: labels.assistantName,
          chips: starterChips,
        } as ChatMessage,
      },
    ];
  }, [script, greetingText, labels.assistantName, starterChips]);

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
            // Carried so each card can render the CANONICAL interest control;
            // null labels ⇒ the interest table is absent ⇒ read-only cards.
            locale,
            interestLabels: res.interestLabels,
          });
        } else {
          assistant(res.message, starterChips);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.fallback, starterChips);
      });
  }, [pushMessage, assistant, starterChips, labels.fallback, locale]);

  const profileChips: ChoiceChip[] = useMemo(
    () => [
      { id: "f:worker.add-language", label: labels.chipLang },
      { id: "f:worker.add-work-history", label: labels.chipExp },
      { id: "f:worker.add-education", label: labels.chipEdu },
      { id: "f:worker.save-work-card", label: labels.chipCard },
      { id: "f:worker.save-preferences", label: labels.chipPrefs },
    ],
    [labels.chipLang, labels.chipExp, labels.chipEdu, labels.chipCard, labels.chipPrefs],
  );

  /**
   * "Show my profile" / "what's left?" / "where did I stop?" — one REAL
   * server-derived answer, three openings. Because the facts are re-read every
   * turn, the same answer is correct after a reload and after a fresh login:
   * the chat's continuity is the user's persisted state, not a remembered
   * script. The follow-up chips are the existing profile actions, so what is
   * missing is one tap from being fixed.
   */
  const startProfileSummary = useCallback(
    (variant: ProfileSummaryVariant) => {
      setTyping(true);
      loadProfileSummaryForChat(variant)
        .then((res) => {
          setTyping(false);
          if (res.kind === "summary") {
            // The recommended chip is the one that closes the FIRST gap the
            // server reported — its ordering, its data. No match (about /
            // skills have no chip here) means no recommendation at all.
            const recommendedId = res.missingKeys
              .map((step) => CHIP_FOR_STEP[step])
              .find((id): id is string => Boolean(id));
            pushMessage({
              id: nid(),
              role: "assistant",
              kind: "profile-summary",
              intro: res.intro,
              done: res.done,
              missing: res.missing,
              lastActivity: res.lastActivity,
              chips:
                res.missing.length > 0
                  ? profileChips.map((c) =>
                      c.id === recommendedId ? { ...c, recommended: true } : c,
                    )
                  : starterChips,
            });
          } else {
            assistant(res.message, starterChips);
          }
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.fallback, starterChips);
        });
    },
    [pushMessage, assistant, starterChips, profileChips, labels.fallback],
  );

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
          // Real state first, then the actions — not a blind menu.
          startProfileSummary("profile");
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
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips, startFindWork, startProfileSummary],
  );

  const handleSend = useCallback(
    (text: string) => {
      user(text);
      const { intent } = classifyIntent(text);
      // These run a real async server read with their own typing cue.
      if (intent === "find-work") {
        startFindWork();
        return;
      }
      if (intent === "profile" || intent === "next-action" || intent === "resume") {
        startProfileSummary(
          intent === "profile" ? "profile" : intent === "next-action" ? "next" : "resume",
        );
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
          default:
            assistant(labels.fallback, starterChips);
        }
      });
    },
    [user, withTyping, handleChip, assistant, labels, starterChips, startFindWork, startWorkLog, startProfileSummary],
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
