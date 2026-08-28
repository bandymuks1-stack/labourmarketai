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
import {
  classifyIntent,
  isExplicitJournalRequest,
} from "@/lib/conversation/intent-router";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { VOICE_TRANSCRIPT_DRAFT_KEY } from "@/lib/voice/constants";
import { findWorkForChat } from "@/lib/conversation/find-work";
import { loadContextBrief } from "@/lib/conversation/agenda-summary";
import { loadMessagesForChat } from "@/lib/conversation/messages-chat";
import { loadEmployerDemandsForChat } from "@/lib/conversation/employer-workspace";
import { loadEngagementsForResult } from "@/lib/engagements/engagements-result";
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
import {
  structureValueStatement,
  type ValueStatement,
} from "@/lib/structuring/value-statement";
import { applyCorrection } from "@/lib/structuring/apply-correction";
import { discoverChannels } from "@/lib/value-channels/discovery";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import {
  loadEmployerOpeningBrief,
  loadOpeningBrief,
} from "@/lib/conversation/opening-brief";
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
  userFindWork: string;
  // Orchestrator intent responses (deterministic; honest where a real
  // mechanism does not yet exist).
  clarifyWorkLog: string;
  calendarHint: string;
  /** Messages projection opener (owner audit §4.4). */
  messagesHint: string;
  reminderBlocked: string;
  translateBlocked: string;
  /** Routing to the administration areas — see the router's
   *  `admin-approvals` / `admin-requests` rules. */
  /** §2 bridge: shown to somebody who HOLDS the company role while
   *  standing in their personal workspace. */
  employerBridgeHint: string;
  /** §33 service need: somebody to DO a job, not to fill one. */
  serviceNeedHint: string;
  chipServiceRequests: string;
  /** §2: the dual-role reading of "kas susidomėjo?" — asked, never guessed. */
  interestInboxAmbiguous: string;
  chipInterestOnMyNeeds: string;
  chipMyOwnInterest: string;
  createOrganizationHint: string;
  chipCreateOrganization: string;
  adminRouteHint: string;
  adminApprovalsChip: string;
  adminRequestsChip: string;
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

  // ── §7.1 — work relationships in the conversation ─────────────────────────
  /** The contextual chip. NOT a starter: the greeting is capped at three
   *  (owner ruling §D) and both identities have already spent theirs. */
  chipEngagements: string;
  /** The person's own turn when they ask who they work with. */
  userEngagements: string;
  /** The chat EXPLAINS, the panel SHOWS AND ACTS — one line above the list. */
  engagementsOpened: string;
  /** No engagement recorded. Said plainly; never conflated with the two below. */
  engagementsNone: string;
  /** Not acting for a company right now — a different fact from "none", fixed
   *  by a different act (switch workspace, not end anything). */
  engagementsNoCompany: string;
  /** The read failed, or the source is not available here. NEVER rendered as
   *  "you work with nobody" — that would be a claim about the person's work. */
  engagementsUnavailable: string;
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
  countryLabels,
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
  /** Localized country names, resolved server-side. The demand prefill needs a
   *  WORD for the location field — the ISO code is an internal value (§23). */
  countryLabels?: Record<string, string>;
}) {
  const auth0 = useAuthOptional();
  const router = useRouter();
  /** The active base identity decides which WORK the greeting offers
   *  (rebuild W4): an employer gets employer starters, a worker gets worker
   *  starters — same window, same dispatcher, no second entry point. */
  const identity = auth0?.activeRole
    ? (baseIdentityForRole(auth0.activeRole) ?? "person")
    : "person";

  /**
   * §2 — THE PERSON IS ONE. `identity` above is the ACTIVE workspace, not who
   * the person is: production has five profiles that hold the company role
   * while sitting in `worker`, exactly as many as are currently in `company`.
   * Half the employer-capable people on the platform were therefore telling a
   * chat that plays dumb about hiring.
   *
   * `roles` is the HELD catalogue (`profile_roles`, is_active) — the same set
   * `requireRoleOrRedirect` checks — so holding `company` means the company
   * hub will genuinely open. No role is switched on their behalf: the chip is
   * the confirmation, and a person without the role still gets the honest
   * fallback because for them the surface really is closed.
   */
  const canActAsEmployer = Boolean(auth0?.roles?.includes("company"));

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
  /** V9 value-intent: slug → localized work-type label for honest readbacks
   *  and demand-form prefill (the ONE taxonomy label map, not a new list). */
  const workTypeLabels = useMemo(() => buildWorkTypeLabelMap(locale), [locale]);
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
    (
      actionId: string,
      onCloseOverride?: () => void,
      continueLabel?: string,
      initialValues?: Record<string, string | boolean>,
    ) => {
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
            // V9 value-intent: what the person already SAID pre-fills the
            // fields — visible, editable, still reviewed before any write.
            initialValues={initialValues}
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
            // Beta audit W-J1: when the caller's next step is a real action
            // (not "add another row"), the button says so.
            continueLabel={continueLabel}
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
          // Beta audit W-J1: that continuation was real but hid behind a button
          // labelled "Add another", so the sentence above ("fill this in and
          // I'll search right away") ended at a dead card and the search never
          // ran. The button now carries the name of what it does.
          openForm("worker.save-work-card", doFindWork, labels.userFindWork);
          return;
        }
        // Criteria complete (or the read degraded) → the real search now.
        doFindWork();
      })
      .catch(() => doFindWork());
  }, [assistant, labels.searchAskCriteria, labels.userFindWork, openForm, doFindWork]);

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
    // V8 GAP 1: the employer no longer opens to silence. Each identity gets
    // its OWN brief over its OWN reads — the worker ladder for a person, the
    // manager's morning ladder (reviews, absence decisions, absent-today,
    // unread) for an organization. Same caps, same honesty: a failed read
    // contributes nothing and `none` leaves the greeting standing alone.
    openedWithStateRef.current = true;
    (identity === "person" ? loadOpeningBrief() : loadEmployerOpeningBrief())
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
   * WORK RELATIONSHIPS IN THE CONVERSATION (§7.1).
   *
   * The door `end_company_worker_engagement_v1` never had. The RPC has been
   * applied in production since 20260723120000 with ZERO client callers — a
   * real capability nobody could reach — and this is the entry that closes it.
   *
   * The SAME split every result follows: the chat EXPLAINS, the panel SHOWS
   * AND ACTS. The chat never ends anything and never offers a confirmation;
   * the confirmation belongs to one real row inside the panel.
   *
   * ONE ENTRY, BOTH SIDES. Which slice is meaningful is decided by the active
   * identity — an employer is asking about their roster, a person about their
   * own work — and it is decided SERVER-side by `loadEngagementsForResult`.
   * The chat only picks which sentence is true, and the three ways there can
   * be nothing to show stay three different sentences because they are three
   * different truths.
   */
  const startEngagements = useCallback(() => {
    setTyping(true);
    loadEngagementsForResult(identity === "company" ? "organization" : "personal")
      .then((res) => {
        setTyping(false);
        if (res.kind === "needs-migration") {
          // The source is not available here. NOT "you work with nobody".
          assistant(labels.engagementsUnavailable);
          openResultRef.current("engagements");
          return;
        }
        if (res.kind === "blocked") {
          assistant(
            identity === "company"
              ? labels.engagementsNoCompany
              : labels.engagementsUnavailable,
          );
          openResultRef.current("engagements");
          return;
        }
        if (res.kind === "empty") {
          assistant(labels.engagementsNone);
          openResultRef.current("engagements");
          return;
        }
        assistant(labels.engagementsOpened);
        openResultRef.current("engagements");
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.engagementsUnavailable);
      });
  }, [
    assistant,
    identity,
    labels.engagementsNone,
    labels.engagementsNoCompany,
    labels.engagementsOpened,
    labels.engagementsUnavailable,
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
          //
          // §7.1: no project does NOT mean no engaged people — the two are
          // unrelated rows (an engagement has no project at all). This is the
          // one honest adjacency where the relationships chip belongs, and it
          // is how an employer reaches the result by clicking rather than by
          // typing. The greeting's three-starter cap (§D) is untouched.
          assistant(labels.projectsNone, [
            { id: "engagements", label: labels.chipEngagements },
          ]);
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
    labels.chipEngagements,
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
    (text: string, opts?: { photoFirst?: boolean; explicit?: boolean }) => {
      const draft = extractWorkLog(text, todayIso());
      // A photo-led log is a deliberate request to attach evidence, so the
      // flow opens even with nothing parsed — the short text stays required
      // inside it. A TYPED sentence with no signal still gets the one clarify
      // question rather than a form nobody asked for.
      //
      // `explicit` is the same escape hatch for a sentence that ASKED for the
      // journal ("Užpildyk darbo žurnalą") or for the log-work chip / the
      // journal page's hand-off. Those are decisions, not vague mentions: the
      // clarify question answered them with "which day and how long did you
      // work?", and asking again returned the identical sentence — the loop a
      // real tester reported, which made the journal unfillable because chat
      // is its ONLY intake (owner audit §6.1). Opening the flow asks for the
      // same facts in fields that can actually be submitted. Same flow, same
      // `createJournalEntry` — no second intake path.
      if (!draft.hasSignal && !opts?.photoFirst && !opts?.explicit) {
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
  /**
   * Journal → chat hand-off (real-user acceptance). The Work Journal page has
   * no composer by design (chat-first intake, owner audit §6.1), so its
   * "record work" CTA navigates here. Landing on the GENERIC greeting is what
   * the tester described as being thrown back to the first page: they pressed
   * the journal's own fill button and arrived somewhere that said nothing
   * about the journal. `?intent=log-work` makes the hand-off land IN the
   * work-log flow, so the navigation reads as continuing one task instead of
   * losing it.
   *
   * Consumed once per mount, then stripped from the URL so a later Back /
   * refresh does not silently re-open the flow over the user's conversation.
   */
  const logWorkIntentConsumedRef = useRef(false);
  useEffect(() => {
    if (logWorkIntentConsumedRef.current) return;
    if (!auth?.profile || identity !== "person") return;
    let wanted = false;
    try {
      wanted =
        new URLSearchParams(window.location.search).get("intent") ===
        "log-work";
    } catch {
      wanted = false;
    }
    if (!wanted) return;
    logWorkIntentConsumedRef.current = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("intent");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL cleanup is cosmetic — never block the flow on it. */
    }
    startWorkLog("", { explicit: true });
  }, [auth?.profile, identity, startWorkLog]);

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
          // reaches. Pressing "log my work" IS the explicit request, so the
          // flow opens with an empty draft and collects the day/duration in
          // its own fields — answering a deliberate tap with a question the
          // user then had to retype was the dead end the tester hit.
          withTyping(() => startWorkLog("", { explicit: true }));
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
              //
              // §7.1: no new OFFER does not mean no current WORK — they are
              // different rows entirely. This is the worker-side adjacency
              // where the relationships chip belongs, and it is how a worker
              // reaches the result by clicking rather than by typing.
              assistant(labels.offersEmpty, [
                { id: "jobs", label: labels.chipJobs },
                { id: "engagements", label: labels.chipEngagements },
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
        case "engagements":
          user(labels.userEngagements);
          // §7.1 — the real work relationships, then the panel. Both
          // identities enter here; the SERVER picks the slice.
          startEngagements();
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
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips, startFindWork, startProfileSummary, startWorkLog, startAgenda, startEmployerCandidates, startProjects, startEngagements, runAssignWorker, router],
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

  /** V9 value-intent: the honest one-line readback of what was understood —
   *  only facts the structurer actually read, joined plainly. */
  const valueSummary = useCallback(
    (v: ValueStatement): string => {
      const parts: string[] = [];
      if (v.subjectLabel) parts.push(v.subjectLabel);
      else if (v.workType) parts.push(workTypeLabels[v.workType] ?? v.workType);
      if (v.subject === "goods" && v.quantity) parts.push(v.quantity.raw);
      if (v.headcount !== null) {
        parts.push(t("valueIntent.people", { count: v.headcount }));
      }
      if (v.window) {
        if (v.window.kind === "days_count") {
          parts.push(t("valueIntent.daysCount", { count: v.window.days ?? 0 }));
        } else {
          const base = t(
            `valueIntent.window.${v.window.kind}` as Parameters<typeof t>[0],
          );
          parts.push(
            v.window.days
              ? `${base} (${t("valueIntent.daysCount", { count: v.window.days })})`
              : base,
          );
        }
      }
      if (v.country) parts.push(v.country);
      return parts.join(" · ");
    },
    [t, workTypeLabels],
  );

  /** V9: demand-form prefill from the read statement — initial values only,
   *  every field stays visible/editable and the review step still gates. */
  const demandPrefill = useCallback(
    (v: ValueStatement, original: string): Record<string, string | boolean> => {
      const out: Record<string, string | boolean> = { description: original };
      const roleLabel = v.workType ? workTypeLabels[v.workType] : undefined;
      if (roleLabel) out.role = roleLabel;
      // The structurer already read the country out of the sentence; without
      // this the form asked for a location the person had just given. The NAME
      // goes in, never the ISO code — the field is something they are about to
      // read and edit.
      const countryLabel = v.country ? countryLabels?.[v.country] : undefined;
      if (countryLabel) out.location = countryLabel;
      if (v.headcount !== null) out.teamSize = String(v.headcount);
      if (v.window) {
        out.urgency = v.window.kind === "next_month" ? "flexible" : "this_week";
      }
      return out;
    },
    [workTypeLabels, countryLabels],
  );

  /** V10 §36: the LAST value interpretation, held for explicit corrections.
   *  Component state ONLY — nothing from this pair is ever persisted, so a
   *  correction can never create a duplicate inquiry. */
  const lastValueRef = useRef<{ statement: ValueStatement; text: string } | null>(
    null,
  );

  /**
   * V10: render a value statement through channel DISCOVERY — the honest
   * readback ("as you state it"), only-missing questions, and the real
   * next step the registry verdict allows. Shared by the offer-value intent
   * and the correction path, so both render identically.
   */
  const renderValueStatement = useCallback(
    (v: ValueStatement, text: string) => {
      const summary = valueSummary(v);
      const understood = summary
        ? t("valueIntent.understood", { summary })
        : null;
      const questions = v.missing
        .filter(
          (m): m is "location" | "window" | "quantity" | "headcount" =>
            m === "location" ||
            m === "window" ||
            m === "quantity" ||
            m === "headcount",
        )
        .map((m) => t(`valueIntent.ask.${m}` as Parameters<typeof t>[0]));

      const discovery = discoverChannels(v, text);
      // RESTRICTED categories: every channel refused — a clear refusal, no
      // alternatives, and no stored interpretation to "correct" into a route.
      const restricted =
        discovery.options.length > 0 &&
        discovery.options.every(
          (o) =>
            o.verdict.kind === "UNSUPPORTED" &&
            o.verdict.reasonKey === "restricted_category",
        );
      if (restricted) {
        lastValueRef.current = null;
        assistant(t("valueIntent.unsupported"));
        return;
      }
      lastValueRef.current = { statement: v, text };

      if (v.subject === "goods") {
        const marketplace = discovery.options.find(
          (o) => o.channelId === "internal_marketplace_listings",
        );
        const verdict = marketplace?.verdict;
        if (verdict?.kind === "CAN_ROUTE") {
          // A real next step on the existing work-bounded listings board.
          assistant(
            [
              understood,
              verdict.listingKind === "rental"
                ? t("valueIntent.goodsListableRental")
                : t("valueIntent.goodsListable"),
              ...questions,
            ]
              .filter((l): l is string => Boolean(l))
              .join("\n"),
            [
              {
                id: "link:/dashboard/listings",
                label: t("valueIntent.chipListings"),
              },
            ],
          );
          return;
        }
        if (verdict?.kind === "LEGAL_CHECK_REQUIRED") {
          // Food/produce: name plainly WHAT would have to be checked, then
          // the channel truth — no approved produce channel, nothing saved.
          assistant(
            [
              understood,
              t("valueIntent.legalCheckFood"),
              t("valueIntent.goodsChannelGated"),
            ]
              .filter((l): l is string => Boolean(l))
              .join("\n"),
          );
          return;
        }
        if (
          verdict?.kind === "CHANNEL_RESTRICTED" &&
          verdict.reasonKey === "category_not_supported"
        ) {
          assistant(
            [understood, t("valueIntent.goodsCategoryUnsupported")]
              .filter((l): l is string => Boolean(l))
              .join("\n"),
          );
          return;
        }
        // NEEDS_MORE_INFORMATION → the unclear branch below asks for it.
      }

      if (v.subject === "service") {
        assistant(
          [understood, t("valueIntent.serviceNext"), ...questions]
            .filter((l): l is string => Boolean(l))
            .join("\n"),
          [
            {
              id: "link:/dashboard/services",
              label: t("valueIntent.chipServices"),
            },
          ],
        );
        return;
      }

      if (v.subject === "work_capacity" && identity === "person") {
        // Real next steps: the existing work-card form persists the
        // availability fields; find-work runs the existing search over
        // the open inquiries the person can see now.
        assistant(
          [understood, t("valueIntent.capacityNext"), ...questions]
            .filter((l): l is string => Boolean(l))
            .join("\n"),
          [
            { id: "f:worker.save-work-card", label: labels.chipCard },
            { id: "jobs", label: labels.chipJobs },
          ],
        );
        return;
      }

      if (
        (v.subject === "workforce" || v.axis === "seek") &&
        identity === "company"
      ) {
        if (understood) assistant(understood);
        openForm(
          "company.create-demand",
          undefined,
          undefined,
          demandPrefill(v, text),
        );
        return;
      }

      /**
       * §2, fourth instance. The statement was READ as a workforce need —
       * `v.subject === "workforce"` is the structurer's own verdict — and then
       * a person who holds the company role but is standing in their personal
       * space was told "I am not sure whether you are offering something or
       * looking for something". The product understood them and then said it
       * did not.
       *
       * Same correction as #1278 and the same two labels: say what was read,
       * then hand them the door. Nothing is switched on their behalf and a
       * person with no company role still falls through to the honest
       * ambiguity question below, because for them the reading really is
       * unclear.
       */
      if (
        (v.subject === "workforce" || v.axis === "seek") &&
        canActAsEmployer
      ) {
        if (understood) assistant(understood);
        assistant(labels.employerBridgeHint, [
          {
            id: "link:/dashboard/company#demand-intake",
            label: labels.chipNeedWorkers,
          },
        ]);
        return;
      }

      // Ambiguous — say what WAS read, ask what would disambiguate.
      assistant(
        [understood, t("valueIntent.unclear"), ...questions]
          .filter((l): l is string => Boolean(l))
          .join("\n"),
        starterChips,
      );
    },
    [
      assistant,
      t,
      valueSummary,
      demandPrefill,
      identity,
      canActAsEmployer,
      labels.chipCard,
      labels.chipJobs,
      labels.employerBridgeHint,
      labels.chipNeedWorkers,
      openForm,
      starterChips,
    ],
  );

  const handleSend = useCallback(
    (text: string) => {
      user(text);

      // V10 §36: an explicit correction ("Ne 30, o 300 kg") of the LAST
      // interpretation replaces exactly the corrected fact and re-renders
      // the SAME statement — state only, nothing dispatched or persisted.
      // A bare restatement is NOT a correction and falls through to full
      // structuring below.
      const last = lastValueRef.current;
      if (last) {
        const corrected = applyCorrection(
          last.statement,
          text,
          new Date().toISOString().slice(0, 10),
        );
        if (corrected) {
          const changes = corrected.changes
            .map((c) =>
              c.previous
                ? t("valueIntent.changeInsteadOf", {
                    next: c.next,
                    previous: c.previous,
                  })
                : c.next,
            )
            .join("; ");
          withTyping(() => {
            // The OLD value is named as replaced — never silently swapped.
            assistant(t("valueIntent.corrected", { changes }));
            renderValueStatement(corrected.statement, last.text);
          });
          return;
        }
      }

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
        // "Kokias galimybes man gali pasiūlyti?" — the product's own central
        // noun, which used to score 0 and land on the generic fallback. It is
        // the SAME question as "rask man darbą", so it runs the SAME engine:
        // one matching pipeline, one result surface, no second stack.
        opportunities: () => runFindWork(text),
        // "Kas susidomėjo mano poreikiu?" — routed by IDENTITY, because the
        // sentence means two different real things. For the employer it is
        // "which of my demands, and who is on them" (the demand list whose
        // chips run scouting in-panel). For the worker it is their own board,
        // where "Mano susidomėjimai" carries the company's answer. Neither
        // branch invents a candidate the reader is not allowed to see.
        // A person who can act as an employer but is standing in their
        // personal space used to fall to the worker arm and get a JOB SEARCH —
        // an answer to neither reading of the question. That case is handled
        // outside this map, because the honest answer there is to ASK rather
        // than to guess (see the `interest-inbox` branch below).
        ...(identity === "company" || !canActAsEmployer
          ? {
              "interest-inbox": () =>
                identity === "company" ? runFindWorkers() : runFindWork(text),
            }
          : {}),
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
      if (intent === "engagements") {
        // §7.1 — the real work relationships, in the panel. Saying "end my
        // engagement" opens the LIST, never a confirmation: the confirmation
        // belongs to one real row and is minted there.
        startEngagements();
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
            // V9: what the sentence already SAID pre-fills the form (visible,
            // editable, still reviewed — nothing submitted on their behalf).
            if (identity === "company") {
              openForm(
                "company.create-demand",
                undefined,
                undefined,
                demandPrefill(structureValueStatement(text), text),
              );
            } else if (canActAsEmployer) {
              // They ARE an employer, just not in that workspace right now.
              // Say so and hand them the door rather than pretending not to
              // understand a sentence the product understood perfectly.
              assistant(labels.employerBridgeHint, [
                {
                  id: "link:/dashboard/company#demand-intake",
                  label: labels.chipNeedWorkers,
                },
              ]);
            } else {
              assistant(labels.fallback, starterChips);
            }
            break;
          case "interest-inbox":
            // Only reached by a person who HOLDS the company role while
            // standing in their personal space — the map above answers
            // everybody else.
            //
            // "Kas susidomėjo?" genuinely means two different things for this
            // person: who raised a hand on THEIR demand, and what came of the
            // interest THEY expressed. The patterns lean employer ("interested
            // in MY need") but "susidomėjimai" is the worker's own word, so
            // picking one silently would be wrong half the time — and the old
            // behaviour picked a third thing, a job search, which was right
            // neither time. Both readings are real surfaces, so it offers both.
            // BOTH readings answer INSIDE the workspace (W8). The first
            // version of this used `link:` chips to scouting and the board,
            // which `w8-employer-chat-workspace` refuses by name: the
            // employer's second step must not navigate out of the chat-first
            // workspace, and that decision predates this change. These are the
            // existing in-chat results — the same ones the starter chips run —
            // carrying labels that name the two readings.
            assistant(labels.interestInboxAmbiguous, [
              { id: "candidates", label: labels.chipInterestOnMyNeeds },
              { id: "jobs", label: labels.chipMyOwnInterest },
            ]);
            break;
          case "need-service":
            // §33 — "reikia, kad kas nors sutaisytų stogą" is a request for a
            // JOB TO BE DONE, not for somebody to fill a job. Before this it
            // classified `unknown`, and "ieškau, kas galėtų nuvalyti langus"
            // classified `find-work` — handing somebody who wants to HIRE a
            // window cleaner a job search, the opposite direction.
            //
            // Routes to the surface that already exists for exactly this (a
            // buyer discovering active offerings and requesting one) rather
            // than growing a second intake inside the chat. Not identity
            // gated: needing a service is not a workspace role.
            assistant(labels.serviceNeedHint, [
              {
                id: "link:/dashboard/service-requests",
                label: labels.chipServiceRequests,
              },
            ]);
            break;
          case "offer-value":
            // V9/V10: read the statement, run channel DISCOVERY, render the
            // honest options (renderValueStatement — shared with the
            // correction path so both render identically).
            renderValueStatement(structureValueStatement(text), text);
            break;
          case "offers":
            handleChip({ id: "offers", label: "" });
            break;
          case "log-work":
            // A sentence that NAMES the journal is a request, not a vague
            // mention: open the flow instead of answering with the clarify
            // question the user cannot escape by rephrasing.
            startWorkLog(text, { explicit: isExplicitJournalRequest(text) });
            break;
          // Honest blocked/hint answers explain themselves; repeating the same
          // four-item menu under every one of them taught users to ignore the
          // chips entirely. The menu stays where it is a menu: the greeting
          // and the not-understood fallback.
          case "company-overview":
            // "Kas vyksta mano įmonėje?" — the same link-chip move as the
            // admin areas: route to the ONE canonical company screen rather
            // than grow a second company view inside the chat.
            //
            // Identity-gated exactly like `need-workers`: a person in their
            // personal space has no company hub to open, and sending them to
            // an empty one would be the dead end this pass exists to remove.
            if (identity === "company" || canActAsEmployer) {
              // Same §2 correction: a company owner asking what is happening
              // in their company gets their company, not a shrug, whichever
              // workspace they happen to be standing in.
              assistant(labels.adminRouteHint, [
                { id: "link:/dashboard/company", label: labels.chipCompanyHub },
              ]);
            } else {
              assistant(labels.fallback, starterChips);
            }
            break;
          case "create-organization":
            // "Sukurk įmonės profilį" — START an organization. Before this the
            // sentence scored on the `profile` rule (the word `profil` is in
            // it) and opened the person's PERSONAL profile form: somebody
            // asking to create a company was handed a form about themselves.
            //
            // Routes to the ONE canonical setup surface — the same
            // `link:` move as the admin areas and the company hub — rather
            // than growing a second organization intake inside the chat. The
            // verification ladder, the ownership rules and the persistence all
            // stay where they already live (`/dashboard/start/company`).
            //
            // NOT identity-gated: starting an organization is precisely what a
            // person WITHOUT one does, so gating it on already having one
            // would close the only door it opens. Somebody who already acts as
            // an employer is offered their existing workspace alongside it —
            // creating a second company is legitimate, but landing on a blank
            // form when they meant "my company" is the dead end this pass
            // exists to remove.
            assistant(
              labels.createOrganizationHint,
              canActAsEmployer
                ? [
                    {
                      id: "link:/dashboard/start/company?new=1",
                      label: labels.chipCreateOrganization,
                    },
                    { id: "link:/dashboard/company", label: labels.chipCompanyHub },
                  ]
                : [
                    {
                      id: "link:/dashboard/start/company?new=1",
                      label: labels.chipCreateOrganization,
                    },
                  ],
            );
            break;
          case "admin-approvals":
            // "Ką turiu patvirtinti?" — the approvals area, which no longer
            // unrolls under every visit to /dashboard/network. A `link:` chip
            // is the sanctioned move here: it routes to the ONE canonical
            // screen and never grows a second view of it.
            assistant(labels.adminRouteHint, [
              {
                id: "link:/dashboard/network?area=approvals",
                label: labels.adminApprovalsChip,
              },
            ]);
            break;
          case "admin-requests":
            // "Noriu pateikti atostogų prašymą" — the filing half of the same
            // engine (leave, trip, expense), same routing rule.
            assistant(labels.adminRouteHint, [
              {
                id: "link:/dashboard/network?area=requests",
                label: labels.adminRequestsChip,
              },
            ]);
            break;
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
    [user, withTyping, handleChip, assistant, labels, starterChips, startFindWork, startWorkLog, startProfileSummary, startCriteria, startAgenda, startPlayerCard, startMessages, startExperiences, startEngagements, openForm, identity, t, demandPrefill, renderValueStatement],
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
