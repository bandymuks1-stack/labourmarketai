"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuthOptional } from "@/lib/auth/context";
import { ConversationHeader } from "./conversation-header";
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
import { getCompanyForm } from "@/lib/conversation/company-forms";
import { baseIdentityForRole } from "@/lib/config/roles";
import { useRouter } from "@/lib/i18n/navigation";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { findWorkForChat } from "@/lib/conversation/find-work";
import { loadContextBrief } from "@/lib/conversation/agenda-summary";
import { loadPlayerCardForChat } from "@/lib/conversation/player-card-chat";
import { loadMessagesForChat } from "@/lib/conversation/messages-chat";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { ChatMessageReply } from "@/components/app/conversation/chat-message-reply";
import { loadCriteriaSummaryForChat } from "@/lib/conversation/criteria-summary";
import { loadProfileSummaryForChat } from "@/lib/conversation/profile-summary";
import {
  appendAssistantTurn,
  loadAssistantThread,
} from "@/lib/assistant/transcript";
import { WorldStateProvider } from "@/components/app/world-state/world-state-provider";
import { ContextPanel } from "@/components/app/world-state/context-panel";
import { useResultParam } from "@/components/app/workspace/use-result-param";
import type { ResultContext } from "@/lib/conversation/result-registry";
import {
  AiWorkspaceBridge,
  type AiWorldStateHandle,
} from "@/components/app/world-state/ai-workspace-bridge";
import {
  runContextReadback,
  runFigures,
  runFindWork,
  runFindWorkers,
  runOpenProject,
  runRecentJournal,
  runSkillGap,
} from "@/lib/ai-workspace/workflows";
import type { WorkflowResult } from "@/lib/ai-workspace/workflow-contract";
import { HistoryBlock } from "./history-block";
import type { ProfileSummaryVariant } from "@/lib/conversation/profile-summary-contract";
import { CHIP_FOR_STEP } from "@/lib/conversation/worker-activity-chips";
import { loadOpeningBrief } from "@/lib/conversation/opening-brief";

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
  speakerYou: string;
  advanced: string;
  navChat: string;
  navJournal: string;
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
  chipLogWork: string;
  userLogWork: string;
  chipAgenda: string;
  userAgenda: string;
  chipNeedWorkers: string;
  chipCandidates: string;
  chipCompanyHub: string;
  companyDemandNext: string;
  chipTasks: string;
  chipLang: string;
  chipExp: string;
  chipEdu: string;
  chipCard: string;
  chipPrefs: string;
  offersEmpty: string;
  /** P0.5 (owner audit): the search dialog's opening line — what we know,
   *  before asking for what is missing. */
  searchAskCriteria: string;
  /** §5.1: the line above the card when it re-renders after a work log. */
  playerCardAfterLog: string;
  fallback: string;
  userCv: string;
  userProfile: string;
  userOffers: string;
  userJobs: string;
  // Orchestrator intent responses (deterministic; honest where a real
  // mechanism does not yet exist).
  clarifyWorkLog: string;
  calendarHint: string;
  /** Messages projection opener (owner audit §4.4). */
  messagesHint: string;
  reminderBlocked: string;
  translateBlocked: string;
  writeEmployerHint: string;
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
  const auth0 = useAuthOptional();
  const router = useRouter();
  /** The active base identity decides which WORK the greeting offers
   *  (rebuild W4): an employer gets employer starters, a worker gets worker
   *  starters — same window, same dispatcher, no second entry point. */
  const identity = auth0?.activeRole
    ? (baseIdentityForRole(auth0.activeRole) ?? "person")
    : "person";

  const starterChips: ChoiceChip[] = useMemo(
    () =>
      identity === "company"
        ? [
            // The employer's primary action — the canonical demand intake as
            // an inline conversation form (company.create-demand executor).
            // Employer greeting also honours the 1–3 cap (§D).
            { id: "f:company.create-demand", label: labels.chipNeedWorkers },
            { id: "agenda", label: labels.chipAgenda },
            { id: "link:/dashboard/company/scouting", label: labels.chipCandidates },
          ]
        : [
            // OWNER RULING 2026-07-29 (§D): the six-chip wall is gone. The
            // greeting offers at most THREE meaningful starts; everything
            // else is contextual — the opening brief and each answer's own
            // follow-ups surface actions when they are actually relevant.
            { id: "logwork", label: labels.chipLogWork },
            { id: "cv", label: labels.chipCv },
            { id: "jobs", label: labels.chipJobs },
          ],
    [labels, identity],
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
  const tSummary = useTranslations("conversation.summary");
  /** AI-workspace copy (W4) — explanations, workflow answers, chip labels. */
  const tAi = useTranslations("workspace.ai");
  /** The AI's hand on World State, published by the bridge inside the provider. */
  const worldRef = useRef<AiWorldStateHandle | null>(null);
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

  /**
   * Transcript persistence (owner-gated schema). While the RED migration is
   * unapplied `loadAssistantThread` reports unavailable and this surface stays
   * session-only — no fake "saved" claims. Once applied: the last turns are
   * restored above the greeting on mount, and every text turn is appended
   * through the hash-chaining RPC. Fire-and-forget: a failed append never
   * blocks the visible conversation and never fabricates a success.
   */
  const transcriptRef = useRef<{ conversationId: string | null; enabled: boolean }>({
    conversationId: null,
    enabled: false,
  });
  useEffect(() => {
    if (script) return; // design preview: never touches real persistence
    let cancelled = false;
    loadAssistantThread()
      .then((res) => {
        if (cancelled || !res.available) return;
        transcriptRef.current = { conversationId: res.conversationId, enabled: true };
        if (res.messages.length > 0) {
          // ChatGPT-style history model: earlier turns arrive as ONE collapsed
          // block above the active conversation — never an unbounded dump.
          // The block pages backwards in chunks on demand (see HistoryBlock).
          const restored = res.messages;
          setItems((prev) => [
            {
              id: nid(),
              embed: (
                <HistoryBlock
                  messages={restored}
                  labels={{
                    title: t("historyTitle"),
                    countLabel: t("historyCount", { count: restored.length }),
                    show: t("historyShow"),
                    showMore: t("historyMore"),
                    speakerAssistant: labels.assistantName,
                    speakerYou: labels.speakerYou,
                  }}
                />
              ),
            },
            ...prev,
          ]);
        }
      })
      .catch(() => {
        /* unavailable — honest session-only mode */
      });
    return () => {
      cancelled = true;
    };
    // labels/t are stable per locale; run once per surface mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const persistTurn = useCallback(
    (role: "user" | "assistant", text: string) => {
      const t = transcriptRef.current;
      if (!t.enabled || !text.trim()) return;
      appendAssistantTurn({
        conversationId: t.conversationId,
        role,
        text,
        language: locale,
      })
        .then((res) => {
          if (res.available) transcriptRef.current.conversationId = res.conversationId;
        })
        .catch(() => {
          /* degraded — nothing claimed */
        });
    },
    [locale],
  );

  const pushMessage = useCallback((message: ChatMessage) => {
    setItems((prev) => [...prev, { id: message.id, message }]);
  }, []);
  const pushEmbed = useCallback((embed: ReactNode) => {
    setItems((prev) => [...prev, { id: nid(), embed }]);
  }, []);
  const assistant = useCallback(
    (text: string, chips?: ChoiceChip[]) => {
      pushMessage({ id: nid(), role: "assistant", kind: "text", text, chips });
      persistTurn("assistant", text);
    },
    [pushMessage, persistTurn],
  );
  const user = useCallback(
    (text: string) => {
      pushMessage({ id: nid(), role: "user", kind: "text", text });
      persistTurn("user", text);
    },
    [pushMessage, persistTurn],
  );

  const withTyping = useCallback((fn: () => void) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      fn();
    }, 350);
  }, []);

  /** Contextual follow-up after the employer demand form: where the demand
   *  lives + describe another need — real next steps, not a generic menu. */
  const companyFollowup = useCallback(() => {
    assistant(labels.companyDemandNext, [
      { id: "link:/dashboard/company", label: labels.chipCompanyHub },
      { id: "f:company.create-demand", label: labels.chipNeedWorkers },
    ]);
  }, [assistant, labels.companyDemandNext, labels.chipCompanyHub, labels.chipNeedWorkers]);

  const openForm = useCallback(
    (actionId: string, onCloseOverride?: () => void) => {
      // ONE form renderer, BOTH sides (rebuild W4): worker specs and company
      // specs share InlineActionForm + the canonical dispatcher.
      const spec = getWorkerForm(actionId) ?? getCompanyForm(actionId);
      if (spec) {
        const isEmployer =
          actionId.startsWith("company.") || actionId.startsWith("agency.");
        pushEmbed(
          <InlineActionForm
            spec={spec}
            locale={locale}
            // Closing a form shows the contextual next step, never a generic
            // menu: worker forms re-read the REAL profile state; the employer
            // demand form offers the real demand follow-ups. A caller with a
            // flow of its own (the search dialog, P0.5) hands in the next
            // step explicitly.
            onClose={
              onCloseOverride ??
              (isEmployer
                ? companyFollowup
                : () => startProfileSummaryRef.current("profile"))
            }
          />,
        );
      }
    },
    [locale, pushEmbed, companyFollowup],
  );
  /** Late-bound ref so openForm (declared earlier) can call the summary
   *  (declared later) without a dependency cycle. */
  const startProfileSummaryRef = useRef<
    (v: ProfileSummaryVariant, opts?: { quiet?: boolean }) => void
  >(() => {});

  /** Contextual follow-ups after a search: change the criteria or review the
   *  profile — the actions that actually alter the NEXT search result. */
  const searchChips: ChoiceChip[] = useMemo(
    () => [
      { id: "f:worker.save-preferences", label: labels.chipPrefs },
      { id: "profile", label: labels.chipProfile },
    ],
    [labels.chipPrefs, labels.chipProfile],
  );

  /**
   * THE AI WORKSPACE (W4). A stated goal runs a real workflow: the canonical
   * read happens server-side, the answer arrives with its explanation, and an
   * "open this" outcome writes World State instead of navigating.
   *
   * Every result renders through the EXISTING message + chip mechanisms — the
   * assistant grew new abilities, not a new UI.
   */
  const runWorkflow = useCallback(
    (workflow: () => Promise<WorkflowResult>) => {
      setTyping(true);
      workflow()
        .then((res) => {
          setTyping(false);
          // The WHY is part of the answer, never a footnote the caller may
          // forget: the contract makes it required and this renders it.
          const why = res.explanation.why;
          const unsupported = res.explanation.unsupported ?? [];
          const tail = [
            why,
            ...unsupported.map((d) => tAi("unsupportedDimension", { dimension: tAi(`dimension.${d}` as never) })),
          ].filter(Boolean);

          if (res.kind === "matches") {
            const applied = res.appliedFilters
              .map((f) => `${f.label}: ${f.matchedText}`)
              .join(" · ");
            if (applied) assistant(applied);
            if (res.result.kind === "matches") {
              pushMessage({
                id: nid(),
                role: "assistant",
                kind: "employer-match",
                intro: res.result.intro,
                matches: res.result.matches,
                locale,
                interestLabels: res.result.interestLabels,
              });
              assistant(tail.join("\n"));
            } else {
              assistant([res.result.message, ...tail].join("\n"), searchChips);
            }
            return;
          }

          if (res.kind === "open-entity") {
            // The AI changes World State. It does not change the page.
            worldRef.current?.openEntity(res.ref);
            assistant([res.text, ...tail].join("\n"));
            return;
          }

          assistant(
            [res.text, ...tail].join("\n"),
            res.kind === "answer" && res.chips
              ? res.chips.map((c) => ({ id: c.id, label: c.label }))
              : undefined,
          );
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.fallback, starterChips);
        });
    },
    [assistant, pushMessage, locale, searchChips, starterChips, labels.fallback, tAi],
  );

  /** The REAL search request (employer/opportunity read) — its own typing
   *  lifecycle (async). Reached only once the criteria dialog is satisfied. */
  const doFindWork = useCallback(() => {
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
          // Empty/blocked: the useful next steps are the ones that change the
          // outcome — criteria and profile — not the four-item menu.
          assistant(res.message, searchChips);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.fallback, starterChips);
      });
  }, [pushMessage, assistant, searchChips, starterChips, labels.fallback, locale]);

  /**
   * "Ieškau darbo" starts a DIALOGUE, not a verdict (owner audit P0.5). The
   * old flow searched immediately and greeted the person with "nothing found"
   * before they had said a single criterion. Now: read the REAL persisted
   * criteria first; if the important ones are missing, say what is already
   * known, ask for the rest with the canonical work-card form (location,
   * availability, salary), and only run the search once the person answers.
   * A person whose criteria are already complete goes straight to results.
   */
  const startFindWork = useCallback(() => {
    setTyping(true);
    loadCriteriaSummaryForChat()
      .then((res) => {
        if (
          res.kind === "criteria" &&
          (res.lines.length === 0 || res.missing.length > 0)
        ) {
          setTyping(false);
          const known = res.lines.map((l) => `${l.label}: ${l.value}`);
          const missingBlock =
            res.missingIntro && res.missing.length > 0
              ? [res.missingIntro, ...res.missing.map((m) => `— ${m}`)]
              : [];
          assistant(
            [labels.searchAskCriteria, ...known, ...missingBlock].join("\n"),
          );
          // The dialog's answer form; when it closes, the search actually runs.
          openForm("worker.save-work-card", doFindWork);
          return;
        }
        // Criteria complete (or the read degraded) → the real search now.
        doFindWork();
      })
      .catch(() => doFindWork());
  }, [assistant, labels.searchAskCriteria, openForm, doFindWork]);

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
    (variant: ProfileSummaryVariant, opts?: { quiet?: boolean }) => {
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
              // Counts and copy come from the server; the card renders them.
              stepsDone: res.stepsDone,
              stepsTotal: res.stepsTotal,
              progressLabel: tSummary("progress", {
                done: res.stepsDone,
                total: res.stepsTotal,
              }),
              progressAriaLabel: tSummary("progressAria", {
                done: res.stepsDone,
                total: res.stepsTotal,
              }),
              doneWord: tSummary("doneWord"),
              missingWord: tSummary("missingWord"),
              lastActivity: res.lastActivity,
              // Owner cap (§D): at most THREE follow-ups, the recommended
              // one first — never the full five-action catalogue. No client
              // sorting: the server's own ordering picked `recommendedId`,
              // and this only moves that one chip to the front.
              chips:
                res.missing.length > 0
                  ? [
                      ...profileChips
                        .filter((c) => c.id === recommendedId)
                        .map((c) => ({ ...c, recommended: true })),
                      ...profileChips.filter((c) => c.id !== recommendedId),
                    ].slice(0, 3)
                  : starterChips,
            });
          } else if (!opts?.quiet) {
            assistant(res.message, starterChips);
          }
        })
        .catch(() => {
          setTyping(false);
          if (!opts?.quiet) assistant(labels.fallback, starterChips);
        });
    },
    [pushMessage, assistant, starterChips, profileChips, labels.fallback, tSummary],
  );
  startProfileSummaryRef.current = startProfileSummary;

  /**
   * State-aware opening (owner ruling 2026-07-29, W2): the first paint must
   * not be an empty greeting when the product already KNOWS this user
   * (doctrine §18). One server action composes the OPENING BRIEF from the
   * canonical reads — new matching opportunities, calendar conflicts, work
   * done but not logged, the first missing profile step — as at most three
   * short lines with at most three contextual chips. Nothing relevant →
   * `none`, and the greeting alone stands with its small starter row.
   * Signed-out visitors and the design preview keep the plain greeting.
   */
  const openedWithStateRef = useRef(false);
  useEffect(() => {
    if (script || openedWithStateRef.current) return;
    if (!auth?.profile) return; // signed-out: nothing real to show
    // Employer identity opens with the employer starters — the worker
    // reads would be the wrong audience (rebuild W4).
    if (identity !== "person") return;
    openedWithStateRef.current = true;
    loadOpeningBrief()
      .then((brief) => {
        if (brief.kind !== "brief") return; // honest: nothing to report
        pushMessage({
          id: nid(),
          role: "assistant",
          kind: "text",
          text: brief.lines.join("\n"),
          chips: brief.chips,
        });
      })
      .catch(() => {
        /* the greeting stands on its own — never a fabricated brief */
      });
  }, [script, auth?.profile, identity, pushMessage]);

  /**
   * "Kokie kriterijai pas mane nurodyti?" — a REAL readback of the worker's
   * persisted search criteria (the same canonical columns matching consumes).
   * Never a generic fallback: set criteria are listed, important unset ones
   * are named, and the follow-up chip is the existing preferences form.
   */
  const startCriteria = useCallback(() => {
    setTyping(true);
    loadCriteriaSummaryForChat()
      .then((res) => {
        setTyping(false);
        if (res.kind === "criteria") {
          const lines = res.lines.map((l) => `${l.label}: ${l.value}`);
          const missingBlock =
            res.missingIntro && res.missing.length > 0
              ? `\n${res.missingIntro}\n${res.missing.map((m) => `— ${m}`).join("\n")}`
              : "";
          assistant(
            [res.intro, ...lines].join("\n") + missingBlock,
            [
              { id: "f:worker.save-preferences", label: labels.chipPrefs },
              { id: "jobs", label: labels.chipJobs },
            ],
          );
        } else {
          assistant(res.message, starterChips);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.fallback, starterChips);
      });
  }, [assistant, starterChips, labels.fallback, labels.chipPrefs, labels.chipJobs]);

  /**
   * THE PLAYER CARD IN THE CONVERSATION (owner audit §5.1). "Parodyk mano
   * kortelę" renders the ONE canonical `WorkerPlayerCard` — the exact
   * component and the exact server-derived data the journal identity block
   * uses — as an embedded turn. It also runs right after a work log lands,
   * so the person SEES their card grow the moment their record changed.
   */
  const startPlayerCard = useCallback(
    (opts?: { intro?: string }) => {
      setTyping(true);
      loadPlayerCardForChat()
        .then((res) => {
          setTyping(false);
          if (res.kind === "card") {
            if (opts?.intro) assistant(opts.intro);
            pushEmbed(
              <div className="max-w-2xl" data-testid="chat-player-card">
                <WorkerPlayerCard
                  card={res.card}
                  labels={res.labels}
                  thermometer={res.thermometer}
                  avatarUrl={res.avatarUrl}
                />
              </div>,
            );
          } else {
            assistant(res.message, starterChips);
          }
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.fallback, starterChips);
        });
    },
    [assistant, pushEmbed, starterChips, labels.fallback],
  );
  /** Late-bound so earlier flows (work-log onClose) can show the card. */
  const startPlayerCardRef = useRef(startPlayerCard);
  startPlayerCardRef.current = startPlayerCard;

  /**
   * MESSAGES IN THE CONVERSATION (owner audit §8.1). The chat reads the real
   * inbox (same RLS-scoped reads the messages page uses), shows only the
   * threads that genuinely await this person, and offers a reply that is
   * SENT ONLY AFTER an explicit confirmation of the exact text.
   */
  const startMessages = useCallback(() => {
    setTyping(true);
    loadMessagesForChat()
      .then((res) => {
        setTyping(false);
        if (res.kind === "threads") {
          assistant(res.intro);
          pushEmbed(<ChatMessageReply threads={res.threads} locale={locale} />);
        } else {
          assistant(res.message, [
            { id: "link:/dashboard/communication", label: labels.navMessages },
          ]);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.messagesHint, [
          { id: "link:/dashboard/communication", label: labels.navMessages },
        ]);
      });
  }, [assistant, pushEmbed, locale, labels.navMessages, labels.messagesHint]);

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
          // After a work log lands, the person SEES their card change
          // (owner audit §5.1 "matoma po darbo įrašo atnaujinimo"): the
          // canonical Player Card re-renders with the just-strengthened
          // record — the real payoff of logging work, not a generic menu.
          onClose={() => startPlayerCardRef.current({ intro: labels.playerCardAfterLog })}
        />,
      );
    },
    [assistant, pushEmbed, locale, workLogLabels, labels.clarifyWorkLog, labels.playerCardAfterLog],
  );

  /**
   * The ONE work-context readback (Context Intelligence, rebuild phase 3):
   * the canonical calendar projection PLUS the deterministic context — real
   * conflicts, overdue deadlines, and at most two rule-based next-step
   * suggestions rendered through the EXISTING chip mechanisms. The full
   * calendar stays one tap away; the chat never grows a second calendar view.
   */
  const startAgenda = useCallback(() => {
    setTyping(true);
    loadContextBrief(locale)
      .then((res) => {
        setTyping(false);
        if (res.kind === "summary") {
          const chips: ChoiceChip[] = res.suggestions.map((s) =>
            s.kind === "overdue-tasks"
              ? { id: "link:/dashboard/tasks", label: labels.chipTasks }
              : s.kind === "log-today"
                ? { id: "logwork", label: labels.chipLogWork }
                : {
                    id: `link:/dashboard/planning?view=day&date=${s.day}`,
                    label: labels.navCalendar,
                  },
          );
          assistant(
            `${res.text}\n\n${labels.calendarHint}`,
            chips.length > 0 ? chips : undefined,
          );
        } else {
          assistant(labels.calendarHint);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.calendarHint);
      });
  }, [assistant, locale, labels.calendarHint, labels.chipTasks, labels.chipLogWork, labels.navCalendar]);

  const handleChip = useCallback(
    (chip: ChoiceChip) => {
      switch (chip.id) {
        case "logwork":
          user(labels.userLogWork);
          // Opens the SAME deterministic work-log flow the typed sentence
          // reaches; an empty draft asks the one concrete clarify question.
          withTyping(() => startWorkLog(""));
          break;
        case "agenda":
          user(labels.userAgenda);
          // The same canonical Time Engine readback the typed intent reaches.
          startAgenda();
          break;
        case "cv":
          user(labels.userCv);
          // CV import ends with the refreshed REAL profile state, so the user
          // sees what the import actually changed.
          withTyping(() => pushEmbed(<WorkerCvFlow onClose={() => startProfileSummaryRef.current("profile")} />));
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
              // No offers: the contextual next step is a search, not a menu.
              assistant(labels.offersEmpty, [
                { id: "jobs", label: labels.chipJobs },
                { id: "profile", label: labels.chipProfile },
              ]);
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
          } else if (chip.id.startsWith("link:")) {
            // Contextual navigation to a REAL canonical surface (rebuild W4)
            // — the chat routes to the one existing screen, it never grows a
            // duplicate view of it.
            router.push(chip.id.slice(5) as "/dashboard");
          }
      }
    },
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips, startFindWork, startProfileSummary, startWorkLog, startAgenda, router],
  );

  const handleSend = useCallback(
    (text: string) => {
      user(text);
      const { intent } = classifyIntent(text);

      /**
       * AI-workspace goals (W4). Each one is a real workflow over canonical
       * reads; "find-work" now goes through it too, because the sentence may
       * carry World State ("…in Germany") that the plain search would drop on
       * the floor.
       */
      const WORKFLOWS: Partial<Record<typeof intent, () => Promise<WorkflowResult>>> = {
        "find-work": () => runFindWork(text),
        "skill-gap": () => runSkillGap(),
        "journal-recent": () => runRecentJournal(),
        figures: () => runFigures(),
        "open-project": () => runOpenProject(text),
        "find-workers": () => runFindWorkers(),
        context: () => runContextReadback(),
      };
      const workflow = WORKFLOWS[intent];
      if (workflow) {
        runWorkflow(workflow);
        return;
      }
      // These run a real async server read with their own typing cue.
      if (intent === "profile" || intent === "next-action" || intent === "resume") {
        startProfileSummary(
          intent === "profile" ? "profile" : intent === "next-action" ? "next" : "resume",
        );
        return;
      }
      if (intent === "criteria") {
        startCriteria();
        return;
      }
      if (intent === "player-card") {
        // The canonical card, rendered IN the conversation (§5.1).
        startPlayerCard();
        return;
      }
      if (intent === "calendar-view") {
        // Real agenda readback from the canonical Time Engine (async, own
        // typing cue) — no longer a bare navigation hint.
        startAgenda();
        return;
      }
      withTyping(() => {
        switch (intent) {
          case "cv":
            handleChip({ id: "cv", label: "" });
            break;
          case "need-workers":
            // Employer demand (rebuild W4): the canonical intake as an inline
            // form — for the employer identity only; a worker typing about
            // workers gets the honest fallback, never a wrong-audience form.
            if (identity === "company") {
              openForm("company.create-demand");
            } else {
              assistant(labels.fallback, starterChips);
            }
            break;
          case "offers":
            handleChip({ id: "offers", label: "" });
            break;
          case "log-work":
            startWorkLog(text);
            break;
          // Honest blocked/hint answers explain themselves; repeating the same
          // four-item menu under every one of them taught users to ignore the
          // chips entirely. The menu stays where it is a menu: the greeting
          // and the not-understood fallback.
          case "reminder":
            // No scheduler exists — never a fake reminder (honest degradation).
            assistant(labels.reminderBlocked);
            break;
          case "translate":
            // No real translation engine — never a fake translation.
            assistant(labels.translateBlocked);
            break;
          case "messages-view":
            // §8.1: the chat SHOWS the waiting threads, drafts a reply and
            // sends it after confirmation — the full inbox stays one tap away.
            startMessages();
            break;
          case "write-employer":
            assistant(labels.writeEmployerHint);
            break;
          default:
            assistant(labels.fallback, starterChips);
        }
      });
    },
    [user, withTyping, handleChip, assistant, labels, starterChips, startFindWork, startWorkLog, startProfileSummary, startCriteria, startAgenda, startPlayerCard, startMessages, openForm, identity],
  );

  const nav = {
    chat: labels.navChat,
    journal: labels.navJournal,
    messages: labels.navMessages,
    calendar: labels.navCalendar,
    profile: labels.navProfile,
    advanced: labels.advanced,
  };

  /** OPENING state (owner audit §4.1) — mirrors the thread's own predicate:
   *  only the assistant's opening turns are on screen. It decides WHERE the
   *  composer lives: centred inside the composition vs the sticky bottom. */
  const opening =
    !typing &&
    items.length <= 3 &&
    items.every((it) => "message" in it && it.message.role === "assistant");

  /**
   * The Context Panel acts by asking the conversation to do what it already
   * does (W3). It never owns an action: a chip id from the panel enters the
   * SAME `handleChip` a chip in the thread enters, so there is one dispatcher
   * and one set of flows no matter which part of the workspace was touched.
   */
  const handlePanelChip = useCallback(
    (chipId: string) => handleChip({ id: chipId, label: "" }),
    [handleChip],
  );

  /**
   * THE RESULT (unified premium product v1). `?result=` is the workspace's
   * result state: it survives reload, it is shareable, and it changes the query
   * string only — the conversation is never remounted and no page transition
   * happens, so this is emphatically not the navigation the panel forbids.
   *
   * `openFullScreen` is the honest fallback for a result that cannot yet render
   * inline. It keeps every existing route reachable, which is what makes this
   * work purely additive (NO REGRESSION).
   */
  const {
    result,
    geography,
    geoToken,
    projectId,
    closeResult,
    selectGeography,
    selectProject,
    clearGeography,
    clearProject,
  } = useResultParam();
  const resultContext: ResultContext = auth0?.activeOrgName
    ? "organization"
    : "personal";
  const openFullScreen = useCallback(
    // The locale-aware router already in this component — the fallback route
    // is a REAL screen the person keeps, not a dead end.
    (route: string) => router.push(route),
    [router],
  );

  /**
   * GOAL 3 — the depth inside the market result, assembled here because this is
   * where the URL already lives. The panel receives it as opaque props and
   * learns nothing about geography or projects, which is what keeps its "no
   * per-type branch" guard true.
   */
  const resultNavigation = useMemo(
    () => ({
      geography,
      geoToken,
      projectId,
      // Null means "no organization is active" — the panel renders its own
      // localized word for that rather than this layer inventing one.
      workspace: auth0?.activeOrgName ?? null,
      onSelectGeography: selectGeography,
      onSelectProject: selectProject,
      onBackToMarket: clearGeography,
      onBackToProjects: clearProject,
    }),
    [
      geography,
      geoToken,
      projectId,
      auth0?.activeOrgName,
      selectGeography,
      selectProject,
      clearGeography,
      clearProject,
    ],
  );

  /** The drill-down puts rows the person has to compare in the panel, which
   *  22rem cannot hold honestly. Depth 0 (the map) keeps the narrow column. */
  const panelWide = result !== null && geography !== null;

  return (
    /**
     * ONE WORKSPACE (W3). The conversation and the Context Panel share one
     * World State: the panel follows the selection, the conversation performs
     * the actions, and the person never leaves this page. The map joins the
     * same state in W6 — that is why the state lives here rather than inside
     * either part.
     */
    <WorldStateProvider avatarId={auth0?.user?.id ?? null}>
      {/* Publishes open/close into `worldRef` so the send handler — which sits
          above this provider — can let the AI change World State (W4). */}
      <AiWorkspaceBridge bind={worldRef} />
      <div className={`flex flex-col bg-ink-900 ${mobile ? "h-full" : "h-[100dvh]"}`} data-testid="conversation-chat">
        <ConversationHeader title={labels.headerTitle} nav={nav} mobile={mobile} />
        {/* Column on phones (panel docks under the composer, collapsed until
            something is selected), row from `lg` (panel is the right column
            and is always visible). Same component, one mount. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col">
            <ConversationThread
              items={items}
              typing={typing}
              handlers={{
                onChip: handleChip,
                onConfirm: () => {},
                onCancel: () => {},
                speakers: { assistant: labels.assistantName, user: labels.speakerYou },
              }}
              // While the conversation is opening the composer renders inside
              // the centred composition (owner audit §4.1); afterwards the
              // thread ignores this prop and the sticky bar below takes over.
              composer={
                <Composer
                  variant="inline"
                  placeholder={labels.composerPlaceholder}
                  attachLabel={labels.attach}
                  sendLabel={labels.send}
                  onSend={handleSend}
                  onAttach={() => handleChip({ id: "cv", label: "" })}
                />
              }
            />
            {opening ? null : (
              <Composer
                placeholder={labels.composerPlaceholder}
                attachLabel={labels.attach}
                sendLabel={labels.send}
                onSend={handleSend}
                onAttach={() => handleChip({ id: "cv", label: "" })}
              />
            )}
          </div>
          <ContextPanel
            locale={locale}
            onChip={handlePanelChip}
            // THE RESULT (unified premium product v1). The conversation owns
            // the `?result=` deep link and hands the panel a validated kind —
            // the panel itself stays free of the routing its guard forbids.
            result={result}
            resultContext={resultContext}
            resultNavigation={resultNavigation}
            wide={panelWide}
            onCloseResult={closeResult}
            onOpenFull={openFullScreen}
          />
        </div>
      </div>
    </WorldStateProvider>
  );
}
