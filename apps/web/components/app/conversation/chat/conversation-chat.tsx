"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { VOICE_TRANSCRIPT_DRAFT_KEY } from "@/lib/voice/constants";
import { findWorkForChat } from "@/lib/conversation/find-work";
import { loadContextBrief } from "@/lib/conversation/agenda-summary";
import { loadMessagesForChat } from "@/lib/conversation/messages-chat";
import { loadEmployerDemandsForChat } from "@/lib/conversation/employer-workspace";
import {
  loadAssignableWorkersForProject,
  loadProjectsForResult,
} from "@/lib/projects/project-workspace";
import {
  dispatchWorkerAction,
  prepareConfirmationAction,
} from "@/lib/conversation/dispatch";
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
import { loadExperienceInvitationsAction } from "@/lib/trust/experience-entry-actions";
import type { ResultContext, ResultKind } from "@/lib/conversation/result-registry";
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
import { PersonalWorkspaceIntro } from "@/components/app/workspace/personal-workspace-intro";
import type { PersonalWorkspaceIntro as PersonalWorkspaceIntroModel } from "@/lib/workspace/personal-workspace-intro";
import type { PersonalWorkspaceLabels } from "@/lib/workspace/personal-workspace-labels";

/** The S2 payload the page streams to the chat without awaiting (#1011):
 *  the intro model plus its server-resolved label bag, as one promise. */
export type PersonalIntroPayload = {
  intro: PersonalWorkspaceIntroModel;
  labels: PersonalWorkspaceLabels | null;
};

/** Resolves the streamed S2 payload inside the intro slot's invisible
 *  Suspense boundary. A `hidden` model (or a missing label bag) renders
 *  nothing — the same honest outcomes the awaited props produced. */
function PersonalWorkspaceIntroStream({
  payload,
  onAction,
}: {
  payload: Promise<PersonalIntroPayload>;
  onAction: (id: string) => void;
}) {
  const { intro, labels } = use(payload);
  if (intro.kind === "hidden" || !labels) return null;
  return <PersonalWorkspaceIntro intro={intro} labels={labels} onAction={onAction} />;
}

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
  /** W3 row 1: what the chat SAYS when it opens the card in the panel. The
   *  thread reports the outcome; the panel shows the card. */
  playerCardOpened: string;
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
  /** W7 slice 2 — the paperclip's one-off "what is this file for?" turn, shown
   *  ONLY when no flow that owns files is open. */
  attachChoice: string;
  chipAttachPhoto: string;
  chipAttachCv: string;
  userAttachPhoto: string;
  // ── W6 slice 3D — the experience entry point ──────────────────────────────
  /** Eligible finished interactions exist; one chip follows per interaction. */
  experiencesEligible: string;
  /** Everything finished has already been described — an honest full stop. */
  experiencesAllSubmitted: string;
  /** Nothing finished yet. Said plainly, never dressed up as an invitation. */
  experiencesNothingYet: string;
  /** The domain is not available here (owner-gated migration) or the read
   *  failed — never rendered as "you have nothing to describe". */
  experiencesUnavailable: string;
  /** The chip verb. Always followed by the interaction it belongs to. */
  experienceLeave: string;

  // ── W8 — the employer's hiring stage, in the conversation ─────────────────
  /** The employer's own turn when they ask to see candidates. */
  userCandidates: string;
  /** The chat EXPLAINS, the panel SHOWS — one line above the demand chips. */
  candidatesOpened: string;
  /** No need described yet. Said plainly, followed by the ONE real next step. */
  candidatesNoDemands: string;
  /** Not acting for a company right now — a different fact from "no needs",
   *  fixed by a different act (switch workspace, not describe a need). */
  candidatesNoCompany: string;
  /** The read failed or the source is not available here. NEVER rendered as
   *  "you have no needs" — that would be a claim about the company's work. */
  candidatesUnavailable: string;

  // ── W11 — projects in the conversation ────────────────────────────────────
  /** The employer starter chip for their running work. */
  chipProjects: string;
  /** The employer's own turn when they ask about projects. */
  userProjects: string;
  /** The chat EXPLAINS, the panel SHOWS — one line above the project chips. */
  projectsOpened: string;
  /** No project yet. Said plainly; the panel offers the real screen. */
  projectsNone: string;
  /** Not acting for a company right now — a different fact from "no projects". */
  projectsNoCompany: string;
  /** The read failed. NEVER rendered as "you have no projects". */
  projectsUnavailable: string;
  /** Ask which person to put on the project. Followed by one chip per worker. */
  assignPickWorker: string;
  /** Nobody on the roster can be assigned — stated, with no fake control. */
  assignNoWorkers: string;
  /** The roster could not be read, or its source is not available here. */
  assignUnavailable: string;
  /** The assignment landed. Followed by the real project result. */
  assignDone: string;
  /** The assignment was refused by the server. The reason is the server's. */
  assignFailed: string;
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
  personalIntroPayload = null,
}: {
  labels: ChatLabels;
  workLogLabels: WorkLogLabels;
  locale: string;
  bookingOffers?: BookingOffer[];
  bookingLabels?: BookingActionLabels | null;
  script?: ChatMessage[];
  /** Force the phone layout — used by the mobile design preview frame. */
  mobile?: boolean;
  /** "Mano erdvė" (S2) — the server-resolved personal-space model plus its
   *  label bag, as a PROMISE the page starts but never awaits (#1011): the
   *  slow worker-readiness reads behind it must not hold the whole
   *  conversation surface out of the shell flush. It resolves inside an
   *  invisible Suspense boundary below (SpineStream pattern). `null`
   *  (the design preview) renders nothing at all; a resolved `hidden`
   *  model renders nothing either — exactly as before. */
  personalIntroPayload?: Promise<PersonalIntroPayload> | null;
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
            // W8: candidates are an ANSWER now, not a route. This chip used to
            // be `link:/dashboard/company/scouting` — the employer's second
            // step took them out of the workspace, which is exactly what a
            // chat-first product must not do. The full screen is still there,
            // one action away from every state of the result.
            { id: "candidates", label: labels.chipCandidates },
            // W11: the employer's third meaningful start is their running
            // work. The agenda stays reachable by typing — the owner cap is
            // THREE starters, so a fourth chip is not an option and projects
            // is the more employer-shaped of the two.
            { id: "projects", label: labels.chipProjects },
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

  /** Contextual follow-up after the employer demand form.
   *
   *  W8 puts the JOURNEY'S OWN next step first: a need has just been described,
   *  so the thing the employer actually wants is who can do it. That used to be
   *  unreachable from here — the only follow-ups were the company hub (a route
   *  out of the workspace) and "describe another need" — so the chat's employer
   *  path dead-ended at the intake form it had just closed. */
  const companyFollowup = useCallback(() => {
    assistant(labels.companyDemandNext, [
      { id: "candidates", label: labels.chipCandidates },
      { id: "link:/dashboard/company", label: labels.chipCompanyHub },
      { id: "f:company.create-demand", label: labels.chipNeedWorkers },
    ]);
  }, [
    assistant,
    labels.companyDemandNext,
    labels.chipCandidates,
    labels.chipCompanyHub,
    labels.chipNeedWorkers,
  ]);

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
              // Same rule as the chip path: the AI EXPLAINS, the panel SHOWS.
              // This branch used to push a second copy of the thread's job
              // cards, which is how one answer ended up with two renderers.
              assistant([res.result.intro, ...tail].filter(Boolean).join("\n"));
              openResultRef.current("opportunities");
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

  /**
   * Late-bound so the find-work flow (declared here) can open a result whose
   * hook lives further down, next to the URL state it writes. Same pattern as
   * `startProfileSummaryRef` — a ref, not a second copy of the hook.
   */
  const openResultRef = useRef<(kind: ResultKind) => void>(() => {});
  /** Late-bound for the same reason as `openResultRef`: the chip handler is
   *  declared above `useResultParam()`, and the experience handoff needs the
   *  ONE writer that sets result + interaction in a single push. */
  const selectInteractionRef = useRef<(token: string) => void>(() => {});
  /** W8 — same pattern for the employer handoff: one writer that sets result +
   *  demand in a single push, so the panel never opens at the wrong depth. */
  const selectDemandRef = useRef<(requestId: string) => void>(() => {});
  /** W11 — the project handoff: one writer that sets result + project in a
   *  single push, for the same reason. */
  const selectProjectRef = useRef<(projectId: string) => void>(() => {});

  /** The REAL search request (employer/opportunity read) — its own typing
   *  lifecycle (async). Reached only once the criteria dialog is satisfied. */
  const doFindWork = useCallback(() => {
    setTyping(true);
    findWorkForChat()
      .then((res) => {
        setTyping(false);
        if (res.kind === "matches") {
          // THE ANSWER OPENS THE PANEL. The thread used to draw its own job
          // cards here — a second renderer and a second place to act on the
          // same rows. The chat now EXPLAINS the answer in one sentence and
          // opens the one surface that shows it, which is also the surface
          // that reports what it actually rendered.
          assistant(res.intro);
          openResultRef.current("opportunities");
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
  }, [assistant, searchChips, starterChips, labels.fallback]);

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
   * THE PLAYER CARD OPENS IN THE PANEL (W3 row 1).
   *
   * "Parodyk mano kortelę" used to push the canonical `WorkerPlayerCard` into
   * the THREAD as an embedded turn. That gave one capability two renderers —
   * and worse, a thread copy is frozen at the moment it was pushed, so asking
   * twice left two versions of the same person on screen, each claiming to be
   * current. The chat now EXPLAINS and opens the one surface that SHOWS,
   * exactly as row 5 did for job matches.
   *
   * It still runs right after a work log lands, so the person sees their card
   * grow the moment their record changed — the card is simply in the panel.
   */
  const startPlayerCard = useCallback(
    (opts?: { intro?: string }) => {
      assistant(opts?.intro ?? labels.playerCardOpened);
      openResultRef.current("player-card");
    },
    [assistant, labels.playerCardOpened],
  );
  /** Late-bound so earlier flows (work-log onClose) can show the card. */
  const startPlayerCardRef = useRef(startPlayerCard);
  startPlayerCardRef.current = startPlayerCard;

  /**
   * THE EXPERIENCE ENTRY POINT (W6 slice 3D).
   *
   * This is the ONLY way a person reaches the experience submit form, and it
   * is deliberately not a button. `ExperienceSubmitForm` needs a real finished
   * interaction as its context — an interaction kind, an id, both parties and
   * a resolved subject — and a generic "leave a review" control anywhere would
   * force the SERVER to accept a subject the client picked. So the chat asks
   * the server which of the person's REAL interactions could ground an
   * experience, and offers one chip per interaction.
   *
   * THE ANSWER IS ALWAYS THE REAL STATE, and the three states are three
   * different sentences because they mean different things:
   *   - eligible interactions exist → one chip each, each carrying its own
   *     `kind:uuid` token;
   *   - everything finished is already described → said plainly, no chips;
   *   - nothing is finished yet → said plainly, no chips.
   * There is never a chip that opens an empty form, and never a prompt to
   * describe someone the person has not actually worked with.
   *
   * The panel still SHOWS and the chat EXPLAINS — same split as the player
   * card and the calendar. The chip pushes the depth into the URL, so the form
   * survives a reload and Back returns to the list.
   */
  const startExperiences = useCallback(() => {
    setTyping(true);
    loadExperienceInvitationsAction()
      .then((res) => {
        setTyping(false);
        if (res.state !== "list") {
          // Unavailable / not authenticated / read failure are NOT rendered as
          // "you have nothing to describe" — that would be a claim about the
          // person's work, made because a table was missing.
          assistant(labels.experiencesUnavailable);
          openResultRef.current("experiences");
          return;
        }
        const eligible = res.invitations.filter((i) => i.state === "eligible");
        const submitted = res.invitations.filter((i) => i.state === "already_submitted");
        if (eligible.length > 0) {
          const chips: ChoiceChip[] = eligible.slice(0, 4).map((i) => ({
            // The token IS the chip: there is no chip that means "leave an
            // experience" in general.
            id: `xp:${i.kind}:${i.interactionId}`,
            label: i.contextLabel
              ? `${labels.experienceLeave}: ${i.contextLabel}`
              : labels.experienceLeave,
          }));
          assistant(labels.experiencesEligible, chips);
        } else if (submitted.length > 0) {
          assistant(labels.experiencesAllSubmitted);
        } else {
          assistant(labels.experiencesNothingYet);
        }
        openResultRef.current("experiences");
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.experiencesUnavailable);
      });
  }, [
    assistant,
    labels.experiencesUnavailable,
    labels.experiencesEligible,
    labels.experiencesAllSubmitted,
    labels.experiencesNothingYet,
    labels.experienceLeave,
  ]);

  /**
   * THE EMPLOYER'S HIRING STAGE (W8).
   *
   * The employer half of this workspace stopped at the intake form: nine of
   * the ten employer executors were wired server-side with no client caller,
   * and the only "candidates" affordance was a link OUT of the conversation.
   * This is the entry point that closes it, and it follows the SAME split every
   * other result follows — the chat EXPLAINS, the panel SHOWS AND ACTS.
   *
   * THE ANSWER IS ALWAYS THE REAL STATE, and the states are different sentences
   * because they are different truths:
   *   - one demand      → open it directly; asking someone to pick from a list
   *                       of one is a step that answers nothing;
   *   - several demands → one chip per REAL demand, each carrying its own id;
   *   - no demands      → said plainly, with the one act that changes it;
   *   - no company      → said plainly, and it is NOT "you have no needs";
   *   - read failed     → its own sentence, never rendered as emptiness.
   *
   * A chip is a request to look, never a permission: the id travels to
   * `runScouting`, which re-derives the company context and re-verifies the row
   * belongs to the caller before ranking anybody.
   */
  const startEmployerCandidates = useCallback(() => {
    setTyping(true);
    loadEmployerDemandsForChat()
      .then((res) => {
        setTyping(false);
        if (res.kind === "no-company-context") {
          assistant(labels.candidatesNoCompany);
          return;
        }
        if (res.kind === "blocked") {
          assistant(labels.candidatesUnavailable);
          return;
        }
        if (res.kind === "empty") {
          // The ONE act that changes this state — not a generic menu.
          assistant(labels.candidatesNoDemands, [
            { id: "f:company.create-demand", label: labels.chipNeedWorkers },
          ]);
          return;
        }
        if (res.demands.length === 1) {
          assistant(labels.candidatesOpened);
          selectDemandRef.current(res.demands[0].requestId);
          return;
        }
        assistant(
          labels.candidatesOpened,
          // Owner cap (§D): at most three. The rest stay in the panel's own
          // demand list, which this same call opens.
          res.demands.slice(0, 3).map((d) => ({
            id: `demand:${d.requestId}`,
            label: d.title,
          })),
        );
        openResultRef.current("candidates");
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.candidatesUnavailable);
      });
  }, [
    assistant,
    labels.candidatesNoCompany,
    labels.candidatesUnavailable,
    labels.candidatesNoDemands,
    labels.candidatesOpened,
    labels.chipNeedWorkers,
  ]);

  /**
   * PROJECTS IN THE CONVERSATION (W11).
   *
   * The same split every result follows — the chat EXPLAINS, the panel SHOWS
   * AND ACTS. One project opens directly; several offer one chip each; the
   * three ways there can be nothing to show stay three different sentences.
   */
  const startProjects = useCallback(() => {
    setTyping(true);
    loadProjectsForResult()
      .then((res) => {
        setTyping(false);
        if (res.kind === "no-company-context") {
          assistant(labels.projectsNoCompany);
          return;
        }
        if (res.kind === "blocked") {
          assistant(labels.projectsUnavailable);
          return;
        }
        if (res.kind === "empty") {
          // The panel carries the real screen where a project is created; the
          // chat does not grow a second creation path.
          assistant(labels.projectsNone);
          openResultRef.current("project");
          return;
        }
        if (res.projects.length === 1) {
          assistant(labels.projectsOpened);
          selectProjectRef.current(res.projects[0].projectId);
          return;
        }
        assistant(
          labels.projectsOpened,
          res.projects.slice(0, 3).map((p) => ({
            id: `project:${p.projectId}`,
            label: p.title,
          })),
        );
        openResultRef.current("project");
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.projectsUnavailable);
      });
  }, [
    assistant,
    labels.projectsNoCompany,
    labels.projectsUnavailable,
    labels.projectsNone,
    labels.projectsOpened,
  ]);

  /**
   * ASSIGNING SOMEONE TO A PROJECT (W11) — the activation of
   * `company.assign-worker`, the last employer executor that had no client
   * caller.
   *
   * The panel asks; this flow answers. It offers ONE CHIP PER REAL PERSON the
   * server would actually accept — `loadAssignableWorkersForProject` reads the
   * same population the RPC's second gate (`caller_manages_worker`) allows — so
   * there is never a control that looks like it works and is then refused.
   *
   * The chip carries `projectId:workerProfileId` and NOTHING else. It is a
   * request, not a permission: the dispatcher re-checks the role, the schema
   * and a fresh confirmation token, and the RPC re-checks BOTH gates plus the
   * completed-project rule before a row moves.
   */
  const startAssignWorker = useCallback(
    (projectId: string) => {
      setTyping(true);
      loadAssignableWorkersForProject()
        .then((res) => {
          setTyping(false);
          if (res.kind === "workers") {
            assistant(
              labels.assignPickWorker,
              res.workers.slice(0, 4).map((w) => ({
                id: `assign:${projectId}:${w.profileId}`,
                label: w.name,
              })),
            );
            return;
          }
          // "Nobody is assignable", "you are not acting for a company" and
          // "the roster could not be read" stay three different answers.
          assistant(
            res.kind === "empty"
              ? labels.assignNoWorkers
              : res.kind === "no-company-context"
                ? labels.projectsNoCompany
                : labels.assignUnavailable,
          );
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.assignUnavailable);
        });
    },
    [
      assistant,
      labels.assignPickWorker,
      labels.assignNoWorkers,
      labels.assignUnavailable,
      labels.projectsNoCompany,
    ],
  );

  /**
   * The assignment itself. `company.assign-worker` is a STRONG-tier action
   * (it binds a person to a project), so a fresh one-time confirmation token is
   * minted immediately before dispatch and the dispatcher refuses the write
   * without it. The outcome shown is the SERVER's — a refusal is never dressed
   * up as a success, and the panel is re-opened on the project so the person
   * sees the roster that actually resulted.
   */
  const runAssignWorker = useCallback(
    (projectId: string, workerProfileId: string) => {
      setTyping(true);
      const input = { projectId, workerProfileId };
      prepareConfirmationAction("company.assign-worker", input)
        .then((prep) => {
          if (!prep.ok) {
            setTyping(false);
            assistant(labels.assignFailed);
            return;
          }
          return dispatchWorkerAction("company.assign-worker", input, {
            locale,
            confirmationToken: prep.token,
          }).then((res) => {
            setTyping(false);
            assistant(res.ok ? labels.assignDone : labels.assignFailed);
            // Re-open the project either way: after a success it shows the new
            // roster, and after a refusal it shows the state that refused.
            selectProjectRef.current(projectId);
          });
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.assignFailed);
        });
    },
    [assistant, locale, labels.assignDone, labels.assignFailed],
  );

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

  /**
   * What a file the person attaches would be FOR, based on what the
   * conversation is currently doing. Set when a flow that owns files opens —
   * never guessed from a file name (a photo called `cv.jpg` is still a photo).
   * `null` = we genuinely do not know, and the paperclip asks instead of
   * choosing for them.
   */
  const attachContextRef = useRef<"worklog" | "cv" | null>(null);

  /** Work-log from a natural sentence → real journal save (deterministic). */
  const startWorkLog = useCallback(
    (text: string, opts?: { photoFirst?: boolean }) => {
      const draft = extractWorkLog(text, todayIso());
      // A photo-led log is a deliberate request to attach evidence, so the
      // flow opens even with nothing parsed — the short text stays required
      // inside it. A TYPED sentence with no signal still gets the one clarify
      // question rather than a form nobody asked for.
      if (!draft.hasSignal && !opts?.photoFirst) {
        // Data unclear → ask ONE concrete question (brief §3).
        assistant(labels.clarifyWorkLog);
        return;
      }
      attachContextRef.current = "worklog";
      pushEmbed(
        <WorkerWorkLogFlow
          draft={draft}
          locale={locale}
          labels={workLogLabels}
          photoFirst={opts?.photoFirst ?? false}
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
   * Voice hand-off (W5 slice 2). The voice surface stores the worker-REVIEWED
   * transcript under a read-once sessionStorage key. Chat-first intake means
   * the CHAT consumes it: the transcript appears as the worker's own visible
   * turn, then the SAME deterministic work-log flow runs on it (preview +
   * explicit confirm + createJournalEntry — no second write path). An unclear
   * transcript gets the one clarify question and the text stays on screen.
   */
  const voiceDraftConsumedRef = useRef(false);
  useEffect(() => {
    if (voiceDraftConsumedRef.current) return;
    if (!auth?.profile || identity !== "person") return;
    let draft: string | null = null;
    try {
      draft = window.sessionStorage.getItem(VOICE_TRANSCRIPT_DRAFT_KEY);
      if (draft !== null) {
        window.sessionStorage.removeItem(VOICE_TRANSCRIPT_DRAFT_KEY);
      }
    } catch {
      draft = null;
    }
    const text = (draft ?? "").trim();
    if (!text) return;
    voiceDraftConsumedRef.current = true;
    user(text);
    startWorkLog(text);
  }, [auth?.profile, identity, user, startWorkLog]);

  /**
   * The ONE work-context readback (Context Intelligence, rebuild phase 3):
   * the canonical calendar projection PLUS the deterministic context — real
   * conflicts, overdue deadlines, and at most two rule-based next-step
   * suggestions rendered through the EXISTING chip mechanisms. The full
   * calendar stays one tap away; the chat never grows a second calendar view.
   *
   * W3 calendar slice: the chat EXPLAINS (the sentence) and the panel SHOWS —
   * the same `?result=` mechanism rows 1 and 5 use, reading the same
   * projection. One calculation, two presentations, zero new routes.
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
          // The panel holds the CURRENT visual plan while the thread keeps
          // the sentence — same split as the player card (row 1).
          openResultRef.current("calendar");
        } else {
          assistant(labels.calendarHint);
        }
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.calendarHint);
      });
  }, [assistant, locale, labels.calendarHint, labels.chipTasks, labels.chipLogWork, labels.navCalendar]);

  /** Late-bound self-reference so one chip case can reuse another's behaviour
   *  without a second copy of it (same pattern as `startProfileSummaryRef`). */
  const handleChipRef = useRef<(chip: ChoiceChip) => void>(() => {});

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
          attachContextRef.current = "cv";
          // CV import ends with the refreshed REAL profile state, so the user
          // sees what the import actually changed.
          withTyping(() => pushEmbed(<WorkerCvFlow onClose={() => startProfileSummaryRef.current("profile")} />));
          break;
        // The two answers to "what is this file for?" — reached only from the
        // attach choice below, so they are a one-off pair, not a standing CTA
        // row under every message.
        case "attach:photo":
          user(labels.userAttachPhoto);
          withTyping(() => startWorkLog("", { photoFirst: true }));
          break;
        case "attach:cv":
          handleChipRef.current({ id: "cv", label: "" });
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
        case "candidates":
          user(labels.userCandidates);
          // W8 — the employer's real demands, then the panel. Never a route.
          startEmployerCandidates();
          break;
        case "projects":
          user(labels.userProjects);
          // W11 — the employer's real projects, then the panel.
          startProjects();
          break;
        default:
          if (chip.id.startsWith("assign:")) {
            // W11 — `assign:<projectId>:<workerProfileId>`. Both ids are
            // real rows the server re-verifies; the chip grants nothing.
            const [pid, wid] = chip.id.slice(7).split(":");
            if (pid && wid) runAssignWorker(pid, wid);
          } else if (chip.id.startsWith("project:")) {
            // W11 — the project-bound handoff, same shape as `demand:`.
            selectProjectRef.current(chip.id.slice(8));
          } else if (chip.id.startsWith("demand:")) {
            // W8 — the demand-bound handoff. The chip carries an id and
            // NOTHING else; it opens the candidates result at that demand's
            // depth, where the SERVER re-derives the company context and
            // re-verifies ownership before ranking anybody.
            selectDemandRef.current(chip.id.slice(7));
          } else if (chip.id.startsWith("xp:")) {
            // W6 slice 3D — the interaction-bound handoff. The chip carries a
            // `kind:uuid` token and NOTHING else; it opens the result at the
            // submit depth, where the SERVER re-derives participation,
            // completion, the subject and duplicate state before any form
            // exists. A chip is a request to look, never a permission.
            selectInteractionRef.current(chip.id.slice(3));
          } else if (chip.id.startsWith("f:")) {
            openForm(chip.id.slice(2));
          } else if (chip.id.startsWith("link:")) {
            // Contextual navigation to a REAL canonical surface (rebuild W4)
            // — the chat routes to the one existing screen, it never grows a
            // duplicate view of it.
            router.push(chip.id.slice(5) as "/dashboard");
          }
      }
    },
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips, startFindWork, startProfileSummary, startWorkLog, startAgenda, startEmployerCandidates, startProjects, runAssignWorker, router],
  );
  handleChipRef.current = handleChip;

  /**
   * THE PAPERCLIP, INTENT-AWARE (W7 slice 2).
   *
   * It used to send every file into the CV importer, whatever the conversation
   * was about — so a worker mid-work-log who tapped it to attach a site photo
   * got a CV parser. The context now decides, and the context is the ACTIVE
   * FLOW, never the file's name:
   *
   *   work-log open  → the work photo path (evidence for that entry)
   *   CV open        → CV import, exactly as before
   *   neither        → ask, once, with the two real answers
   *
   * The unknown case is a single message with two chips — not a permanent CTA
   * row, which is the button wall the owner ruling removed.
   */
  const handleAttach = useCallback(() => {
    const context = attachContextRef.current;
    if (context === "worklog") {
      user(labels.userAttachPhoto);
      withTyping(() => startWorkLog("", { photoFirst: true }));
      return;
    }
    if (context === "cv") {
      handleChipRef.current({ id: "cv", label: "" });
      return;
    }
    assistant(labels.attachChoice, [
      { id: "attach:photo", label: labels.chipAttachPhoto },
      { id: "attach:cv", label: labels.chipAttachCv },
    ]);
  }, [
    user,
    assistant,
    withTyping,
    startWorkLog,
    labels.userAttachPhoto,
    labels.attachChoice,
    labels.chipAttachPhoto,
    labels.chipAttachCv,
  ]);

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
      if (intent === "experiences") {
        // W6 slice 3D — the real state of the person's experiences, plus one
        // chip per interaction they could actually describe. Never a form.
        startExperiences();
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
    [user, withTyping, handleChip, assistant, labels, starterChips, startFindWork, startWorkLog, startProfileSummary, startCriteria, startAgenda, startPlayerCard, startMessages, startExperiences, openForm, identity],
  );

  const nav = {
    chat: labels.navChat,
    journal: labels.navJournal,
    messages: labels.navMessages,
    calendar: labels.navCalendar,
    profile: labels.navProfile,
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
    interactionToken,
    demandId,
    openResult,
    closeResult,
    selectGeography,
    selectProject,
    selectInteraction,
    selectDemand,
    openProjectResult,
    clearGeography,
    clearProject,
    clearInteraction,
    clearDemand,
  } = useResultParam();
  // Bind the late-bound opener: the find-work flow above calls this to put its
  // answer in the panel instead of drawing a second card list in the thread.
  openResultRef.current = openResult;
  selectInteractionRef.current = selectInteraction;
  selectDemandRef.current = selectDemand;
  selectProjectRef.current = openProjectResult;
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
      // W6 slice 3D — the experiences result's depth travels the same way: an
      // opaque validated token in, a "step back up" callback out. The panel
      // still learns nothing about interactions, bookings or engagements.
      interactionToken,
      // W8 — the candidates result's depth travels the same way: a validated
      // id in, a "step back up" callback out. The panel still learns nothing
      // about demands, matching or shortlists.
      demandId,
      // Null means "no organization is active" — the panel renders its own
      // localized word for that rather than this layer inventing one.
      workspace: auth0?.activeOrgName ?? null,
      onSelectGeography: selectGeography,
      onSelectProject: selectProject,
      onBackToMarket: clearGeography,
      onBackToProjects: clearProject,
      onBackToExperiences: clearInteraction,
      onSelectDemand: selectDemand,
      onBackToDemands: clearDemand,
      // W11 — the panel asks the CONVERSATION to assign; it never acts itself.
      onAssignWorker: startAssignWorker,
    }),
    [
      geography,
      geoToken,
      projectId,
      interactionToken,
      demandId,
      auth0?.activeOrgName,
      selectGeography,
      selectProject,
      selectDemand,
      clearGeography,
      clearProject,
      clearInteraction,
      clearDemand,
      startAssignWorker,
    ],
  );

  /** The drill-down puts rows the person has to compare in the panel, which
   *  22rem cannot hold honestly. Depth 0 (the map) keeps the narrow column.
   *
   *  W3 row 1 adds the player card for the same reason and by the same
   *  mechanism — the SAME panel takes more of the desktop column, never a
   *  second surface. The card carries two side-by-side charts (evidence over
   *  time, evidence per skill); at 22rem their axis labels wrapped to one word
   *  per line, which is a chart the reader cannot actually read.
   *
   *  W8 adds the candidates result at DEMAND depth for exactly the first
   *  reason: an employer comparing people reads a match status, a coverage
   *  figure, a pipeline stage and three controls per row. At 22rem that stack
   *  wraps into an unreadable column, and the decision it exists to support
   *  is a comparison. The demand LIST is a list of titles and keeps the
   *  narrow column. */
  const panelWide =
    result !== null &&
    (geography !== null ||
      result === "player-card" ||
      (result === "candidates" && demandId !== null));

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
              /* "Mano erdvė" (S2). It sits INSIDE the opening composition, so
                 the workspace still opens as a conversation: the block, the
                 greeting and the composer are one centred first screen, and
                 the first real turn scrolls it out of the way. Its actions go
                 through the SAME dispatcher every chip uses — one set of
                 flows, no second action system. */
              intro={
                personalIntroPayload && !script ? (
                  /* Invisible boundary (#1011): the intro's slow readiness
                     reads stream in AFTER the shell — the opening composition
                     renders immediately and the block appears when known,
                     exactly like the layout's SpineStream. */
                  <Suspense fallback={null}>
                    <PersonalWorkspaceIntroStream
                      payload={personalIntroPayload}
                      onAction={handlePanelChip}
                    />
                  </Suspense>
                ) : undefined
              }
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
                  onAttach={handleAttach}
                />
              }
            />
            {opening ? null : (
              <Composer
                placeholder={labels.composerPlaceholder}
                attachLabel={labels.attach}
                sendLabel={labels.send}
                onSend={handleSend}
                onAttach={handleAttach}
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
