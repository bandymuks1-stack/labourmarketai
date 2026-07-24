"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ConversationHeader } from "./conversation-header";
import { ConversationThread, type ThreadItem } from "./conversation-thread";
import { Composer } from "./composer";
import type { ChatMessage, ChoiceChip } from "./types";
import { InlineActionForm } from "@/components/app/conversation/inline-action-form";
import { WorkerCvFlow } from "@/components/app/conversation/worker-cv-flow";
import {
  WorkerBookingAction,
  type BookingActionLabels,
} from "@/components/app/conversation/worker-booking-action";
import { getWorkerForm } from "@/lib/conversation/worker-forms";
import type { BookingOffer } from "@/components/app/conversation/conversation-shell";

export type ChatLabels = {
  headerTitle: string;
  advanced: string;
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
  locale,
  bookingOffers = [],
  bookingLabels = null,
  script,
}: {
  labels: ChatLabels;
  locale: string;
  bookingOffers?: BookingOffer[];
  bookingLabels?: BookingActionLabels | null;
  script?: ChatMessage[];
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
          withTyping(() => assistant(labels.jobsAnswer, starterChips));
          break;
        default:
          if (chip.id.startsWith("f:")) {
            openForm(chip.id.slice(2));
          }
      }
    },
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips],
  );

  const handleSend = useCallback(
    (text: string) => {
      user(text);
      const q = text.toLowerCase();
      withTyping(() => {
        if (/cv|gyvenimo|резюме|lebenslauf/.test(q)) handleChip({ id: "cv", label: "" });
        else if (/pasiūlym|offer|booking|предложен|angebot/.test(q)) handleChip({ id: "offers", label: "" });
        else if (/profil|įgūd|kalb|patirt|skill|profile/.test(q)) handleChip({ id: "profile", label: "" });
        else assistant(labels.fallback, starterChips);
      });
    },
    [user, withTyping, handleChip, assistant, labels.fallback, starterChips],
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-ink-900" data-testid="conversation-chat">
      <ConversationHeader title={labels.headerTitle} advancedLabel={labels.advanced} />
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
    </div>
  );
}
