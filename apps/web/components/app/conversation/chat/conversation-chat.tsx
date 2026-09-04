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
import { MySpaceRow } from "./my-space-row";
import { pinAction, reorderPinsAction, unpinAction } from "@/lib/workspace/pins-actions";
import {
  PIN_CAP,
  isPinnableRef,
  recordPinUsage,
  shouldAskToPin,
  type PinUsage,
  type WorkspacePin,
} from "@/lib/workspace/pins-model";
import { pinRefForSentence } from "@/lib/workspace/pin-usage-from-intent";
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
import { getWorkerForm, type WorkerFormSpec } from "@/lib/conversation/worker-forms";
import {
  agencyProposeCandidateForm,
  educationAssignLearnerForm,
  educationCreateCohortForm,
  getCompanyForm,
} from "@/lib/conversation/company-forms";
import { loadEducationWorkspaceForChat } from "@/lib/conversation/education-workspace";
import { loadAgencyBridgeForChat } from "@/lib/conversation/agency-workspace";
import { loadClientOffersForChat } from "@/lib/conversation/client-offers";
import { loadDocumentFormOptionsForChat } from "@/lib/conversation/documents-form";
import { guessDocumentType } from "@/lib/conversation/document-type-guess";
import { workerAddDocumentForm } from "@/lib/conversation/worker-forms";
import { parseEndDate } from "@/lib/structuring/time-window";
import type { AgencyChatRosterWorker } from "@/lib/conversation/agency-workspace-contract";
import { STARTER_CAP, personStarters, type StarterChipSpec } from "@/lib/conversation/starters";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { baseIdentityForRole } from "@/lib/config/roles";
import { useRouter } from "@/lib/i18n/navigation";
import {
  classifyIntent,
  fold,
  isExplicitJournalRequest,
} from "@/lib/conversation/intent-router";
import {
  dispatchIntent,
  type IntentHandlers,
} from "@/lib/conversation/intent-registry";
import type { WorkspaceInfo } from "@/lib/company/organization-switch";
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
  runDocumentsReadiness,
  runLearningCompass,
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

/**
 * An e-mail address the person already typed in the sentence ("pakviesk
 * klientą jonas@imone.lt"). Chat-first rule: never ask for a fact the sentence
 * already carries — it pre-fills the ONE field and the person only confirms.
 * Shape gate only; the canonical validators stay authoritative server-side.
 */
/** Which of the institution's commands a "programmes" sentence asks for —
 *  create / cohort / assign, else a plain list. Folded, five locales. */
function educationModeFromText(text: string): "list" | "create" | "cohort" | "assign" {
  const q = (text ?? "").toLowerCase();
  if (/priskir|assign|zuweis|toewijz|назнач|zapisz/.test(q)) return "assign";
  const creates = /sukur|kurti|prid[eė]|nauj|create|new|add|erstell|anleg|maak|nieuw|создать|создай|нов/.test(q);
  if (creates && /grup|kohort|cohort|groep|gruppe|групп|поток|когорт/.test(q)) return "cohort";
  if (creates) return "create";
  return "list";
}

function extractEmail(sentence: string): string | null {
  const m = sentence.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
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
  /** M10 — education-shaped starters for a training-provider workspace. Both
   *  chips lead to REAL existing surfaces (the network invite panel with the
   *  learner relationship; the company hub's capabilities card) — never a
   *  control that looks like a feature and is then refused. */
  chipEduInviteLearner: string;
  chipEduCapabilities: string;
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
  lmcHint: string;
  chipLmc: string;
  adminRouteHint: string;
  adminApprovalsChip: string;
  adminRequestsChip: string;
  timesheetsChip: string;
  /** §9 chat-first coverage — the chips for the domains that existed but had
   *  no sentence that could reach them. All six share `adminRouteHint`: the
   *  answer is the same shape ("here is where that is handled"), and one hint
   *  with six chips is one contract, not six near-identical strings. */
  timesheetImportChip: string;
  workHoursChip: string;
  absencesChip: string;
  documentsChip: string;
  marketMapChip: string;
  activityChip: string;
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
  // Agency / student / institution vocabulary (real recruiter pilot, 2026-09-04).
  fallbackCompany: string;
  fallbackAgency: string;
  fallbackEducation: string;
  agencyInviteClientAsk: string;
  agencyInviteClientPrefilled: string;
  agencyInviteClientDone: string;
  agencyInviteCandidateAsk: string;
  agencyInviteCandidateDone: string;
  // My Space (owner contract 2026-09-04 §4C).
  mySpaceTitle: string;
  chipManagePins: string;
  pinAsk: string;
  chipPinYes: string;
  chipPinNo: string;
  pinDone: string;
  pinCap: string;
  pinUnavailable: string;
  pinsManageIntro: string;
  pinsNone: string;
  unpinPrefix: string;
  unpinDone: string;
  projectCreateIntro: string;
  projectCreatedNext: string;
  clientOffersIntro: string;
  clientOffersNone: string;
  chipOfferAccept: string;
  chipOfferDecline: string;
  offerAccepted: string;
  offerDeclined: string;
  offerDecisionFailed: string;
  documentAddIntro: string;
  documentAddDone: string;
  documentAddUnavailable: string;
  cvExportHint: string;
  chipCvSheet: string;
  pinFirstPrefix: string;
  reorderDone: string;
  // Education by sentence (owner contract 2026-09-04 §15).
  eduInviteAsk: string;
  eduInviteDone: string;
  eduInviteCreatedNoEmail: string;
  eduProgrammesIntro: string;
  eduProgrammesNone: string;
  eduProgrammeLine: string;
  eduProgrammeCreated: string;
  eduCohortPick: string;
  eduCohortCreated: string;
  eduAssignNoCohort: string;
  eduAssignNoLearners: string;
  eduAssignDone: string;
  eduNotInstitution: string;
  eduUnavailable: string;
  eduNext: string;
  chipCreateProgramme: string;
  chipCreateCohort: string;
  chipAssignLearner: string;
  agencyInviteCandidateExists: string;
  agencyNotAgencyWorkspace: string;
  agencySwitchHint: string;
  agencyClientDemandIntro: string;
  agencyClientDemandNone: string;
  agencyProposalsIntro: string;
  agencyProposalsNone: string;
  agencyProposeAsk: string;
  agencyProposeDone: string;
  agencyRosterEmpty: string;
  agencyUnavailable: string;
  agencyNext: string;
  chipInviteClient: string;
  chipInviteCandidate: string;
  chipClientDemand: string;
  chipProposalStatus: string;
  chipProposeFor: string;
  userClientDemand: string;
  userProposalStatus: string;
  learningCompassHint: string;
  chipLearningCompass: string;
  inviteStudentHint: string;
  chipInviteStudent: string;
  programmesHint: string;
  chipProgrammes: string;
};


let uid = 0;
const nid = () => `m${uid++}`;

/** My Space usage counters — a per-viewer convenience in the browser (never a
 *  fact about the person; a cleared browser just resets the ask). */
const PIN_USAGE_KEY = "lm.myspace.usage.v1";
const PIN_ASKED_KEY = "lm.myspace.asked.v1";

/** A stated start day in the person's own language ("5 October"); UTC day. */
function formatDay(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00.000Z`),
    );
  } catch {
    return iso;
  }
}

/** Whole UTC days from today until `iso` (negative when it passed). */
function daysUntil(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(`${iso}T00:00:00.000Z`).getTime() - today) / 86_400_000);
}

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
  agencyWorkspace = false,
  learnerContextLine = null,
  starters = null,
  contextFallback = null,
  workspaceContextLine = null,
  pins = null,
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
  /** M10 — SERVER-resolved: the active organization holds the education
   *  capability and not the employer one (`isEducationFirstWorkspace` over the
   *  canonical `organization_roles` read). Since 2026-09-04 the starters are
   *  derived on the server from the same reading (`starters` below); the flag
   *  stays on the contract for the page and the design preview. */
  educationWorkspace?: boolean;
  /** Real recruiter pilot (2026-09-04) — SERVER-resolved: the active
   *  organization's company is a staffing agency (`company_type`). Decides
   *  the agency starters, the agency fallback and which sentence handlers
   *  may open the agency bridge; still the company identity, never a third
   *  base identity (an agency is a company TYPE). */
  agencyWorkspace?: boolean;
  /** M10 — SERVER-resolved sentence for a person with an ACTIVE learner link
   *  (`engagement_contexts` relationship `student`), already localized with
   *  the institution's real name. `null` = no link or the read degraded —
   *  nothing is rendered, never a fabricated learning context. */
  learnerContextLine?: string | null;
  /** STARTERS ARE SUGGESTIONS (owner contract 2026-09-04 §6) — SERVER-derived
   *  from the workspace's held capabilities + the facts that decide each
   *  track's next real step (`lib/conversation/starters.ts`). At most three,
   *  a MIX across capabilities, never one role's fixed menu. `null` (design
   *  preview / script) falls back to the identity default. Labels resolve
   *  from the ONE chat label bag; ids are the existing `handleChip`
   *  vocabulary. */
  starters?: readonly StarterChipSpec[] | null;
  /** The not-understood answer, composed on the server from the same
   *  capability tracks ("I can help with needs, candidates, projects,
   *  clients…"). `null` = the identity's plain fallback. */
  contextFallback?: string | null;
  /** The "on whose behalf" line for a company workspace, with the real
   *  organization name and its capabilities — the active context stated in
   *  the column the person reads (CHAT_FIRST_DASHBOARD CF-4), never only in
   *  the header chip. `null` = nothing rendered. */
  workspaceContextLine?: string | null;
  /** MY SPACE (owner contract 2026-09-04 §4C) — the person's own pinned
   *  references for THIS workspace, read on the server under RLS. `null` =
   *  the store is unavailable (migration unapplied / read failed): no row,
   *  no ask — never an invented empty desktop. */
  pins?: readonly WorkspacePin[] | null;
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

  /**
   * The greeting row: signal-derived suggestions from the server (a mix across
   * the capabilities the workspace holds — see `lib/conversation/starters.ts`),
   * or the identity default when the page did not resolve any (design
   * preview). OWNER RULING 2026-07-29 (§D): at most THREE meaningful starts;
   * everything else is contextual. OWNER CONTRACT 2026-09-04 (§5–§6): the row
   * suggests, it never bounds — the router understands every sentence
   * regardless of which chips are shown, and being an agency or a school
   * never erases what else the company does.
   */
  const starterChips: ChoiceChip[] = useMemo(
    () =>
      (starters ?? personStarters({ learnerLinked: false }))
        .slice(0, STARTER_CAP)
        .map((s) => ({ id: s.id, label: labels[s.labelKey] })),
    [labels, starters],
  );

  /**
   * THE NOT-UNDERSTOOD ANSWER FOLLOWS THE WORKSPACE (real recruiter pilot,
   * 2026-09-04). The first real recruiter, in the agency workspace, typed a
   * valid agency sentence and read "I can help with your CV, profile and job
   * offers" above employer chips — worker copy for a company context. A
   * fallback is the product's description of itself; it must describe the
   * capabilities of the context the person is standing in, never another
   * actor's — and ALL of them (owner contract 2026-09-04 §5): the server
   * composes the sentence from the capability tracks the workspace holds, so
   * an agency that also employs hears both. The plain company / worker copy
   * stands only when nothing was resolved.
   */
  const fallbackText =
    contextFallback ??
    (identity === "company" ? labels.fallbackCompany : labels.fallback);
  /** Coarse role for the chat-execution funnel — the EXISTING telemetry
   *  vocabulary; agency = the company identity in an agency workspace. */
  const roleContextNow: "worker" | "company" | "agency" =
    identity === "company" ? (agencyWorkspace ? "agency" : "company") : "worker";

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
    const opening: ThreadItem[] = [
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
    // M10 — a linked learner's opening acknowledges their REAL learning
    // context (server-resolved, real institution name — never invented). A
    // plain assistant turn under the greeting, carrying the same starters:
    // chip rows render only on the newest message, so the row simply moves
    // down one turn — same mechanics as the opening brief.
    if (learnerContextLine && identity === "person") {
      opening.push({
        id: nid(),
        message: {
          id: nid(),
          role: "assistant",
          kind: "text",
          text: learnerContextLine,
          chips: starterChips,
        } as ChatMessage,
      });
    }
    // ACTIVE CONTEXT = "on whose behalf am I acting?" (owner contract
    // 2026-09-04 §5; CF-4). A company workspace opens by naming the real
    // organization and what the product can do for it here — stated in the
    // column the person reads, with the same starter row moved under it.
    if (workspaceContextLine && identity === "company") {
      opening.push({
        id: nid(),
        message: {
          id: nid(),
          role: "assistant",
          kind: "text",
          text: workspaceContextLine,
          chips: starterChips,
        } as ChatMessage,
      });
    }
    return opening;
  }, [script, greetingText, labels.assistantName, starterChips, learnerContextLine, workspaceContextLine, identity]);

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
  /** The moment the thread last asked a QUESTION (a message with chips). On a
   *  phone the bottom sheet yields to it when it is still showing the same
   *  thing — prod walk 2026-09-04: "Kas turėtų jame dirbti?" and its chips
   *  sat under the open project sheet and could not be tapped. */
  const [chipsPostedAt, setChipsPostedAt] = useState<number | null>(null);
  const assistant = useCallback(
    (text: string, chips?: ChoiceChip[]) => {
      pushMessage({ id: nid(), role: "assistant", kind: "text", text, chips });
      persistTurn("assistant", text);
      if (chips && chips.length > 0) setChipsPostedAt(Date.now());
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
      // A registered action id, or a spec BUILT for this turn (the agency
      // candidate offer lists the roster the adapter just read — same
      // InlineActionForm, same dispatcher, same confirmation).
      actionOrSpec: string | WorkerFormSpec,
      onCloseOverride?: () => void,
      continueLabel?: string,
      initialValues?: Record<string, string | boolean>,
      onDone?: (res: { ok: true; data?: Record<string, unknown> }) => void,
    ) => {
      // ONE form renderer, BOTH sides (rebuild W4): worker specs and company
      // specs share InlineActionForm + the canonical dispatcher.
      const spec =
        typeof actionOrSpec === "string"
          ? (getWorkerForm(actionOrSpec) ?? getCompanyForm(actionOrSpec))
          : actionOrSpec;
      if (spec) {
        const actionId = spec.actionId;
        const isEmployer =
          actionId.startsWith("company.") || actionId.startsWith("agency.");
        pushEmbed(
          <InlineActionForm
            spec={spec}
            locale={locale}
            // V9 value-intent: what the person already SAID pre-fills the
            // fields — visible, editable, still reviewed before any write.
            initialValues={initialValues}
            onDone={onDone}
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
          assistant(fallbackText, starterChips);
        });
    },
    [assistant, pushMessage, locale, searchChips, starterChips, fallbackText, tAi],
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
        assistant(fallbackText, starterChips);
      });
  }, [assistant, searchChips, starterChips, fallbackText]);

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
          if (!opts?.quiet) assistant(fallbackText, starterChips);
        });
    },
    [pushMessage, assistant, starterChips, profileChips, fallbackText, tSummary],
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
        assistant(fallbackText, starterChips);
      });
  }, [assistant, starterChips, fallbackText, labels.chipPrefs, labels.chipJobs]);

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
   * CONTEXT SWITCHING BY SENTENCE (chat-first audit 2026-08-30, gap G1).
   *
   * ONE ACTIVE CONTEXT is the state every other answer resolves against, and
   * until this it was the only piece of product state the chat could not
   * touch: "Perjunk į Nonstop Group" fell to the generic fallback while the
   * header dropdown did exactly that. The switch itself stays the ONE
   * existing, server-validated path (`auth.switchWorkspace` → the same
   * membership-checked pointer the header uses) — the chat adds language on
   * top, never a second switching mechanism.
   *
   * Honesty: `switchWorkspace` now reports whether the server accepted the
   * switch, so the done-message is only said when it is true. An ambiguous or
   * unmatched sentence ASKS with one chip per real workspace — it never
   * guesses, and the chip carries only the workspace id the server
   * re-validates.
   */
  const performContextSwitch = useCallback(
    (workspace: WorkspaceInfo) => {
      const displayName =
        workspace.kind === "personal" ? t("switchContextPersonal") : workspace.name;
      if (auth?.activeWorkspaceId === workspace.id) {
        assistant(t("switchContextAlready", { name: displayName }));
        return;
      }
      setTyping(true);
      (auth
        ? auth.switchWorkspace(workspace.id)
        : Promise.resolve(false)
      )
        .then((accepted) => {
          setTyping(false);
          assistant(
            accepted
              ? t("switchContextDone", { name: displayName })
              : t("switchContextFailed"),
          );
        })
        .catch(() => {
          setTyping(false);
          assistant(t("switchContextFailed"));
        });
    },
    [assistant, auth, t],
  );

  const startSwitchContext = useCallback(
    (text: string) => {
      const workspaces = auth?.workspaces ?? [];
      if (!auth || workspaces.length === 0 || auth.workspacePointerAvailable === false) {
        // The pointer is honestly unavailable (owner-gated migration) or the
        // list did not resolve — say so, never a silent no-op.
        withTyping(() => assistant(t("switchContextUnavailable")));
        return;
      }
      const folded = fold(text);
      // "asmenin…" / "personal" / "личн…" / "persoonlijk…" / "persönlich…"
      // (folded: persönlich → personlich) — the personal space by name.
      const wantsPersonal = ["asmenin", "personal", "личн", "persoonlijk", "personlich"].some(
        (hint) => folded.includes(hint),
      );
      const organizations = workspaces.filter(
        (w) => w.kind === "organization" && w.name.trim() !== "",
      );
      let target: WorkspaceInfo | undefined = wantsPersonal
        ? workspaces.find((w) => w.kind === "personal")
        : undefined;
      if (!target && !wantsPersonal) {
        // Full-name inclusion first; then a single ≥4-char name token. Real
        // entity names only (§6 of the train: no "Workspace 1" labels) — and
        // anything short/ambiguous falls through to the explicit question.
        const byFullName = organizations.filter((w) => {
          const name = fold(w.name).trim();
          return name.length >= 3 && folded.includes(name);
        });
        if (byFullName.length === 1) {
          target = byFullName[0];
        } else if (byFullName.length === 0) {
          const byToken = organizations.filter((w) =>
            fold(w.name)
              .split(/\s+/)
              .some((token) => token.length >= 4 && folded.includes(token)),
          );
          if (byToken.length === 1) target = byToken[0];
        }
      }
      if (!target) {
        assistant(
          t("switchContextPick"),
          workspaces.map((w) => ({
            id: `ws:${w.id}`,
            label: w.kind === "personal" ? t("switchContextPersonal") : w.name,
          })),
        );
        return;
      }
      performContextSwitch(target);
    },
    [assistant, auth, performContextSwitch, t, withTyping],
  );

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

  /** The CLIENT's decision on an agency's offer (owner contract §15): the
   *  SAME token-confirmed dispatch as every important write, over the SAME
   *  canonical action the scouting page's buttons call. The readback names
   *  the real consequence (accept → a booking proposed to the worker). */
  const runOfferDecision = useCallback(
    (offerId: string, decision: "accepted" | "declined") => {
      setTyping(true);
      const input = { offerId, decision };
      prepareConfirmationAction("company.respond-offer", input)
        .then((prep) => {
          if (!prep.ok) {
            setTyping(false);
            assistant(labels.offerDecisionFailed);
            return;
          }
          return dispatchWorkerAction("company.respond-offer", input, {
            locale,
            confirmationToken: prep.token,
          }).then((res) => {
            setTyping(false);
            assistant(
              res.ok ? (decision === "accepted" ? labels.offerAccepted : labels.offerDeclined) : labels.offerDecisionFailed,
              [{ id: "candidates", label: labels.chipCandidates }],
            );
          });
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.offerDecisionFailed);
        });
    },
    [assistant, locale, labels.offerAccepted, labels.offerDeclined, labels.offerDecisionFailed, labels.chipCandidates],
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
  /**
   * THE AGENCY BRIDGE, OPERATED FROM THE CONVERSATION (real recruiter pilot,
   * 2026-09-04).
   *
   * NATURAL LANGUAGE → INTENT (router) → ACTIVE CONTEXT (identity +
   * agencyWorkspace, both server-resolved) → ALREADY-KNOWN DATA (the sentence's
   * e-mail, the roster, the shared requests) → ONE MISSING QUESTION (the
   * inline form) → AUTHORIZATION (dispatcher role gate + `owns_company` in
   * SQL) → CANONICAL EXECUTOR → REAL ROW → READBACK IN WORDS → NEXT CHIPS.
   *
   * Nothing here writes: the writes are the registered actions
   * (`agency.invite-client`, `company.invite-worker`,
   * `agency.propose-candidate`) behind the ONE dispatcher; the reads are the
   * agency bridge adapter over the same canonical reads the company page
   * renders. The workspace stays one chip away, never a mandatory stop.
   */
  const agencyRosterRef = useRef<readonly AgencyChatRosterWorker[]>([]);
  const agencyChips: ChoiceChip[] = useMemo(
    () => [
      { id: "f:agency.invite-client", label: labels.chipInviteClient },
      { id: "agency:demand", label: labels.chipClientDemand },
      { id: "agency:progress", label: labels.chipProposalStatus },
    ],
    [labels.chipInviteClient, labels.chipClientDemand, labels.chipProposalStatus],
  );
  const agencyFollowup = useCallback(() => {
    assistant(labels.agencyNext, agencyChips);
  }, [assistant, labels.agencyNext, agencyChips]);
  /** "You can do that as your company" — the person holds the company role
   *  but stands in the personal space: offer the real workspaces (the SAME
   *  membership-validated switch the `ws:` chips already run). */
  const workspaceChips: ChoiceChip[] = useMemo(
    () =>
      (auth?.workspaces ?? [])
        .filter((w) => w.kind === "organization")
        .slice(0, 3)
        .map((w) => ({ id: `ws:${w.id}`, label: w.name })),
    [auth?.workspaces],
  );

  const openProposeForm = useCallback(
    (shareId: string) => {
      const roster = agencyRosterRef.current;
      if (roster.length === 0) {
        assistant(labels.agencyRosterEmpty, [
          { id: "f:company.invite-worker", label: labels.chipInviteCandidate },
        ]);
        return;
      }
      trackFunnel(FUNNEL_EVENTS.chatMissingDataAsked, {
        surface: "chat",
        step: "agency.propose-candidate",
        role_context: "agency",
      });
      openForm(
        agencyProposeCandidateForm(shareId, roster),
        agencyFollowup,
        labels.chipProposalStatus,
        undefined,
        () => assistant(labels.agencyProposeDone),
      );
    },
    [assistant, labels.agencyRosterEmpty, labels.chipInviteCandidate, labels.chipProposalStatus, labels.agencyProposeDone, openForm, agencyFollowup],
  );

  const startAgencyBridge = useCallback(
    (mode: "demand" | "progress" | "propose") => {
      setTyping(true);
      loadAgencyBridgeForChat()
        .then((res) => {
          setTyping(false);
          if (res.kind === "not-agency") {
            assistant(labels.agencyNotAgencyWorkspace, [
              { id: "link:/dashboard/company", label: labels.chipCompanyHub },
            ]);
            return;
          }
          if (res.kind !== "ok") {
            assistant(labels.agencyUnavailable, [
              { id: "link:/dashboard/company", label: labels.chipCompanyHub },
            ]);
            return;
          }
          agencyRosterRef.current = res.roster;
          if (mode === "progress") {
            if (res.progress.length === 0) {
              assistant(labels.agencyProposalsNone, [
                { id: "agency:demand", label: labels.chipClientDemand },
                { id: "f:agency.invite-client", label: labels.chipInviteClient },
              ]);
              return;
            }
            const lines = res.progress.map(
              (p) =>
                `• ${p.title} — ${p.workerLabel} · ${p.stageLabel}${p.decisionLabel ? ` · ${p.decisionLabel}` : ""}`,
            );
            assistant([labels.agencyProposalsIntro, ...lines].join("\n"), [
              { id: "agency:demand", label: labels.chipClientDemand },
              { id: "link:/dashboard/company", label: labels.chipCompanyHub },
            ]);
            return;
          }
          if (res.shared.length === 0) {
            assistant(labels.agencyClientDemandNone, [
              { id: "f:agency.invite-client", label: labels.chipInviteClient },
              { id: "agency:progress", label: labels.chipProposalStatus },
            ]);
            return;
          }
          if (mode === "propose" && res.shared.length === 1) {
            openProposeForm(res.shared[0].shareId);
            return;
          }
          const lines = res.shared.map((r) => `• ${r.title}`);
          assistant(
            [mode === "propose" ? labels.agencyProposeAsk : labels.agencyClientDemandIntro, ...lines].join("\n"),
            res.shared.slice(0, 3).map((r) => ({
              id: `agency-propose:${r.shareId}`,
              label: `${labels.chipProposeFor}: ${r.title}`,
            })),
          );
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.agencyUnavailable, [
            { id: "link:/dashboard/company", label: labels.chipCompanyHub },
          ]);
        });
    },
    [assistant, labels, openProposeForm],
  );

  /** Identity gate shared by the agency reads: the company identity asks the
   *  adapter (which answers "not an agency" honestly); an employer-capable
   *  person in the personal space is offered the real switch; everyone else
   *  gets the context-aware fallback. */
  const runAgencyRead = useCallback(
    (mode: "demand" | "progress" | "propose") => {
      if (identity === "company") {
        startAgencyBridge(mode);
      } else if (canActAsEmployer && workspaceChips.length > 0) {
        withTyping(() => assistant(labels.agencySwitchHint, workspaceChips));
      } else {
        withTyping(() => assistant(fallbackText, starterChips));
      }
    },
    [identity, canActAsEmployer, workspaceChips, startAgencyBridge, withTyping, assistant, labels.agencySwitchHint, fallbackText, starterChips],
  );

  /** "Noriu pakviesti klientą" / "pakviesk darbuotoją": the ONE missing fact
   *  is the e-mail — asked once, or pre-filled when the sentence carried it;
   *  the inline form is the confirmation; the readback names the REAL state. */
  /** F2 — "sukurk projektą Roterdame": the SITE as a project object, by
   *  sentence. Company identity only (a person in their personal space gets
   *  the workspace hint, never a wrong-audience form); the city the sentence
   *  named pre-fills the form — visible, editable, still confirmed. */
  const startCreateProject = useCallback(
    (sentence: string) => {
      if (identity !== "company") {
        if (canActAsEmployer && workspaceChips.length > 0) {
          assistant(labels.agencySwitchHint, workspaceChips);
        } else {
          assistant(fallbackText, starterChips);
        }
        return;
      }
      const city = structureValueStatement(sentence).city ?? "";
      assistant(labels.projectCreateIntro);
      openForm(
        "company.create-project",
        undefined,
        undefined,
        city ? { city } : undefined,
        // PROJECT AFTER CREATION (owner contract §11 seed): the new project
        // opens in the panel — its real (empty) roster and the assignment
        // controls — so people are assigned right where the project was
        // just named. Same panel the "projects" chip opens; no id → the list.
        (res) => {
          const id = typeof res.data?.projectId === "string" ? res.data.projectId : null;
          assistant(labels.projectCreatedNext);
          if (id) selectProjectRef.current(id);
          else handleChipRef.current({ id: "projects", label: "" });
        },
      );
    },
    [identity, canActAsEmployer, workspaceChips, assistant, labels.agencySwitchHint, labels.projectCreateIntro, labels.projectCreatedNext, fallbackText, starterChips, openForm],
  );

  /** "Kokius kandidatus pasiūlė agentūra?" — the offers on the company's OWN
   *  demands, from the SAME reads the scouting page renders; each open offer
   *  carries its accept / decline chip. An agency workspace asking this
   *  means its own proposals — routed there, never guessed. */
  const startClientOffers = useCallback(() => {
    if (identity !== "company") {
      if (canActAsEmployer && workspaceChips.length > 0) assistant(labels.agencySwitchHint, workspaceChips);
      else assistant(fallbackText, starterChips);
      return;
    }
    if (agencyWorkspace) {
      handleChipRef.current({ id: "agency:progress", label: "" });
      return;
    }
    setTyping(true);
    loadClientOffersForChat()
      .then((res) => {
        setTyping(false);
        if (res.kind !== "ok") {
          assistant(labels.agencyUnavailable, [{ id: "candidates", label: labels.chipCandidates }]);
          return;
        }
        if (res.offers.length === 0) {
          assistant(labels.clientOffersNone, [{ id: "candidates", label: labels.chipCandidates }]);
          return;
        }
        const lines = res.offers.map((o) => `• ${o.demandTitle} — ${o.agencyName}${o.note ? ` · ${o.note}` : ""}`);
        assistant(
          [labels.clientOffersIntro, ...lines].join("\n"),
          res.offers.slice(0, 3).flatMap((o) => [
            { id: `offer-accept:${o.offerId}`, label: `${labels.chipOfferAccept}: ${o.demandTitle}` },
            { id: `offer-decline:${o.offerId}`, label: `${labels.chipOfferDecline}: ${o.demandTitle}` },
          ]),
        );
      })
      .catch(() => {
        setTyping(false);
        assistant(labels.agencyUnavailable, [{ id: "candidates", label: labels.chipCandidates }]);
      });
  }, [identity, canActAsEmployer, workspaceChips, agencyWorkspace, assistant, labels, fallbackText, starterChips]);

  /** "Turiu naują A1 iki 2027-03" — a document RECORDED by sentence (owner
   *  contract §12/§14). The form is built from the canonical catalogues per
   *  turn; what the sentence said (type, valid-until) pre-fills it — visible,
   *  editable, confirmed. After the save the readiness answer re-runs, so the
   *  person sees the gap close (or not). Person identity only. */
  const startAddDocument = useCallback(
    (sentence: string) => {
      if (identity !== "person") {
        assistant(labels.adminRouteHint, [{ id: "link:/dashboard/documents", label: labels.documentsChip }]);
        return;
      }
      setTyping(true);
      loadDocumentFormOptionsForChat()
        .then((opts) => {
          setTyping(false);
          if (opts.types.length === 0) {
            assistant(labels.documentAddUnavailable, [{ id: "documents-centre", label: labels.documentsChip }]);
            return;
          }
          const typeSlug = guessDocumentType(sentence);
          const validUntil = parseEndDate(sentence, todayIso(), null);
          const prefill: Record<string, string> = {};
          if (typeSlug && opts.types.some((o) => o.value === typeSlug)) prefill.typeSlug = typeSlug;
          if (validUntil) prefill.validUntil = validUntil;
          assistant(labels.documentAddIntro);
          openForm(
            workerAddDocumentForm(opts.types, opts.countries),
            undefined,
            undefined,
            Object.keys(prefill).length > 0 ? prefill : undefined,
            () => {
              assistant(labels.documentAddDone);
              runWorkflow(() => runDocumentsReadiness());
            },
          );
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.documentAddUnavailable, [{ id: "documents-centre", label: labels.documentsChip }]);
        });
    },
    [identity, assistant, labels.adminRouteHint, labels.documentsChip, labels.documentAddUnavailable, labels.documentAddIntro, labels.documentAddDone, openForm, runWorkflow],
  );

  const startAgencyInvite = useCallback(
    (actionId: "agency.invite-client" | "company.invite-worker", sentence: string) => {
      const isClient = actionId === "agency.invite-client";
      if (identity !== "company") {
        if (canActAsEmployer && workspaceChips.length > 0) {
          assistant(labels.agencySwitchHint, workspaceChips);
        } else {
          assistant(fallbackText, starterChips);
        }
        return;
      }
      if (isClient && !agencyWorkspace) {
        assistant(labels.agencyNotAgencyWorkspace, [
          { id: "link:/dashboard/company", label: labels.chipCompanyHub },
        ]);
        return;
      }
      const email = extractEmail(sentence);
      if (email) {
        if (isClient) assistant(labels.agencyInviteClientPrefilled);
      } else {
        assistant(isClient ? labels.agencyInviteClientAsk : labels.agencyInviteCandidateAsk);
        trackFunnel(FUNNEL_EVENTS.chatMissingDataAsked, {
          surface: "chat",
          step: actionId,
          role_context: roleContextNow,
        });
      }
      openForm(
        actionId,
        agencyFollowup,
        isClient ? labels.chipClientDemand : labels.chipProposalStatus,
        email ? { email } : undefined,
        (res) => {
          if (isClient) {
            assistant(labels.agencyInviteClientDone);
          } else {
            assistant(
              res.data?.outcome === "invited"
                ? labels.agencyInviteCandidateDone
                : labels.agencyInviteCandidateExists,
            );
          }
        },
      );
    },
    [identity, canActAsEmployer, workspaceChips, agencyWorkspace, assistant, labels, fallbackText, starterChips, roleContextNow, openForm, agencyFollowup],
  );

  /**
   * EDUCATION, OPERATED FROM THE CONVERSATION (owner contract 2026-09-04 §15).
   * Same chain as the agency bridge: NATURAL LANGUAGE → INTENT → ACTIVE
   * CONTEXT (company identity; the RPCs re-check the training_provider
   * capability and manager authority) → ALREADY-KNOWN DATA (the sentence's
   * e-mail, the institution's programmes / cohorts / accepted learners) →
   * ONE MISSING QUESTION (the inline form) → CANONICAL EXECUTOR → REAL ROW →
   * READBACK IN WORDS → NEXT CHIPS. Nothing here writes.
   */
  const educationChips: ChoiceChip[] = useMemo(
    () => [
      { id: "edu:cohort", label: labels.chipCreateCohort },
      { id: "edu:assign", label: labels.chipAssignLearner },
      { id: "f:company.invite-learner", label: labels.chipInviteStudent },
    ],
    [labels.chipCreateCohort, labels.chipAssignLearner, labels.chipInviteStudent],
  );
  const educationFollowup = useCallback(() => {
    assistant(labels.eduNext, educationChips);
  }, [assistant, labels.eduNext, educationChips]);

  const startEducationInvite = useCallback(
    (sentence: string) => {
      if (identity !== "company") {
        if (canActAsEmployer && workspaceChips.length > 0) {
          assistant(labels.agencySwitchHint, workspaceChips);
        } else {
          assistant(fallbackText, starterChips);
        }
        return;
      }
      const email = extractEmail(sentence);
      if (!email) {
        assistant(labels.eduInviteAsk);
        trackFunnel(FUNNEL_EVENTS.chatMissingDataAsked, {
          surface: "chat",
          step: "company.invite-learner",
          role_context: roleContextNow,
        });
      }
      openForm(
        "company.invite-learner",
        educationFollowup,
        labels.chipProgrammes,
        email ? { email } : undefined,
        (res) =>
          assistant(
            res.data?.outcome === "sent" ? labels.eduInviteDone : labels.eduInviteCreatedNoEmail,
          ),
      );
    },
    [identity, canActAsEmployer, workspaceChips, assistant, labels, fallbackText, starterChips, roleContextNow, openForm, educationFollowup],
  );

  const runEducationProgrammes = useCallback(
    (mode: "list" | "create" | "cohort" | "assign", programId?: string) => {
      if (identity !== "company") {
        if (canActAsEmployer && workspaceChips.length > 0) {
          assistant(labels.agencySwitchHint, workspaceChips);
        } else {
          assistant(fallbackText, starterChips);
        }
        return;
      }
      if (mode === "create") {
        openForm(
          "company.create-programme",
          educationFollowup,
          labels.chipCreateCohort,
          undefined,
          () => assistant(labels.eduProgrammeCreated),
        );
        return;
      }
      if (mode === "cohort" && programId) {
        openForm(
          educationCreateCohortForm(programId),
          educationFollowup,
          labels.chipAssignLearner,
          undefined,
          () => assistant(labels.eduCohortCreated),
        );
        return;
      }
      setTyping(true);
      loadEducationWorkspaceForChat()
        .then((res) => {
          setTyping(false);
          if (res.kind === "no-company") {
            assistant(labels.engagementsNoCompany, workspaceChips);
            return;
          }
          if (res.kind === "not-institution") {
            assistant(labels.eduNotInstitution, [
              { id: "link:/dashboard/company", label: labels.chipEduCapabilities },
            ]);
            return;
          }
          if (res.kind !== "ok") {
            assistant(labels.eduUnavailable, [
              { id: "link:/dashboard/company#institution-programs-title", label: labels.chipProgrammes },
            ]);
            return;
          }
          if (mode === "cohort") {
            if (res.programmes.length === 0) {
              assistant(labels.eduProgrammesNone, [{ id: "edu:create", label: labels.chipCreateProgramme }]);
              return;
            }
            if (res.programmes.length === 1) {
              runEducationProgrammesRef.current("cohort", res.programmes[0].id);
              return;
            }
            trackFunnel(FUNNEL_EVENTS.chatMissingDataAsked, {
              surface: "chat",
              step: "company.create-cohort",
              role_context: roleContextNow,
            });
            assistant(
              labels.eduCohortPick,
              res.programmes.slice(0, 3).map((p) => ({ id: `edu-cohort:${p.id}`, label: p.name })),
            );
            return;
          }
          if (mode === "assign") {
            const cohorts = res.programmes.flatMap((p) =>
              p.cohorts.map((c) => ({ id: c.id, label: `${p.name} — ${c.name}` })),
            );
            if (cohorts.length === 0) {
              assistant(labels.eduAssignNoCohort, [{ id: "edu:cohort", label: labels.chipCreateCohort }]);
              return;
            }
            if (res.assignable.length === 0) {
              assistant(labels.eduAssignNoLearners, [
                { id: "f:company.invite-learner", label: labels.chipInviteStudent },
              ]);
              return;
            }
            openForm(
              educationAssignLearnerForm(cohorts, res.assignable),
              educationFollowup,
              labels.chipProgrammes,
              undefined,
              () => assistant(labels.eduAssignDone),
            );
            return;
          }
          if (res.programmes.length === 0) {
            assistant(labels.eduProgrammesNone, [
              { id: "edu:create", label: labels.chipCreateProgramme },
              { id: "f:company.invite-learner", label: labels.chipInviteStudent },
            ]);
            return;
          }
          const lines = res.programmes.map((p) =>
            labels.eduProgrammeLine
              .replace("{name}", p.name)
              .replace("{cohorts}", String(p.cohorts.length))
              .replace("{demand}", p.demandCount === null ? "—" : String(p.demandCount)),
          );
          assistant([labels.eduProgrammesIntro, ...lines].join("\n"), educationChips);
        })
        .catch(() => {
          setTyping(false);
          assistant(labels.eduUnavailable, [
            { id: "link:/dashboard/company#institution-programs-title", label: labels.chipProgrammes },
          ]);
        });
    },
    [identity, canActAsEmployer, workspaceChips, assistant, labels, fallbackText, starterChips, openForm, educationFollowup, educationChips, roleContextNow],
  );
  const runEducationProgrammesRef = useRef(runEducationProgrammes);
  runEducationProgrammesRef.current = runEducationProgrammes;

  /**
   * MY SPACE (owner contract 2026-09-04 §4C): PIN · UNPIN · the ASK after
   * repeated use. Pins are references the chat already resolves; the row
   * above the thread runs the same handlers the chips run. Usage is counted
   * in the browser (per viewer) and the product asks ONCE per reference when
   * it crosses the threshold — never silently fills the desktop.
   */
  const [pinned, setPinned] = useState<WorkspacePin[]>(() => (pins ?? []).slice(0, PIN_CAP));
  const pinsAvailable = pins !== null;
  const pendingPinLabelRef = useRef(new Map<string, string>());
  const pinLabelFor = useCallback(
    (ref: string): string => {
      const own = pinned.find((p) => p.ref === ref)?.label;
      if (own) return own;
      const pending = pendingPinLabelRef.current.get(ref);
      if (pending) return pending;
      const fromRow = starterChips.find((c) => c.id === ref)?.label;
      return fromRow ?? ref.replace(/^(f:|link:\/dashboard\/)/, "");
    },
    [pinned, starterChips],
  );
  const usageRef = useRef<{ usage: PinUsage; asked: Set<string> }>({ usage: {}, asked: new Set() });
  useEffect(() => {
    try {
      const u = localStorage.getItem(PIN_USAGE_KEY);
      const a = localStorage.getItem(PIN_ASKED_KEY);
      usageRef.current = { usage: u ? (JSON.parse(u) as PinUsage) : {}, asked: new Set(a ? (JSON.parse(a) as string[]) : []) };
    } catch {
      /* a browser without storage simply never asks */
    }
  }, []);
  const noteUsage = useCallback(
    (ref: string, label: string) => {
      if (!pinsAvailable || !isPinnableRef(ref)) return;
      const now = Date.now();
      const next = recordPinUsage(usageRef.current.usage, ref, now);
      usageRef.current = { ...usageRef.current, usage: next };
      try {
        localStorage.setItem(PIN_USAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (shouldAskToPin(next, ref, now, new Set(pinned.map((p) => p.ref)), usageRef.current.asked)) {
        usageRef.current.asked.add(ref);
        try {
          localStorage.setItem(PIN_ASKED_KEY, JSON.stringify([...usageRef.current.asked]));
        } catch {
          /* ignore */
        }
        pendingPinLabelRef.current.set(ref, label);
        assistant(labels.pinAsk, [
          { id: `pin:${ref}`, label: labels.chipPinYes },
          { id: `pin-no:${ref}`, label: labels.chipPinNo },
        ]);
      }
    },
    [pinsAvailable, pinned, assistant, labels.pinAsk, labels.chipPinYes, labels.chipPinNo],
  );
  /** The label the ask shows for a reference reached by SENTENCE (no chip
   *  was clicked, so no chip label is at hand): the same chip wording the
   *  starters use, falling back to the pin label resolver. */
  const sentencePinLabel = useCallback(
    (ref: string): string => {
      const named: Readonly<Record<string, string | undefined>> = {
        logwork: labels.chipLogWork,
        jobs: labels.chipJobs,
        profile: labels.chipProfile,
        candidates: labels.chipCandidates,
        engagements: labels.chipEngagements,
        "agency:demand": labels.chipClientDemand,
        "agency:progress": labels.chipProposalStatus,
        "f:company.create-demand": labels.chipNeedWorkers,
        "f:agency.invite-client": labels.chipInviteClient,
        "f:company.invite-worker": labels.chipInviteCandidate,
        "f:company.invite-learner": labels.chipInviteStudent,
        "compass-page": labels.chipLearningCompass,
      };
      return named[ref] ?? pinLabelFor(ref);
    },
    [labels, pinLabelFor],
  );
  const runPinChip = useCallback(
    (id: string): boolean => {
      if (id.startsWith("pin:")) {
        const ref = id.slice(4);
        const label = pinLabelFor(ref);
        void pinAction({ ref, label }).then((r) => {
          if (r.ok) {
            setPinned((prev) =>
              prev.some((p) => p.ref === ref) ? prev : [...prev, { ref, kind: "action", label, position: prev.length }],
            );
            assistant(labels.pinDone);
          } else if (r.code === "cap") {
            assistant(labels.pinCap.replace("{max}", String(PIN_CAP)));
          } else {
            assistant(labels.pinUnavailable);
          }
        });
        return true;
      }
      if (id.startsWith("pin-no:")) return true;
      // REORDER (§4C) as an ordinary-human gesture: "put this first". The
      // canonical reorder action receives the whole new order; the row
      // re-renders from the same list the server holds.
      if (id.startsWith("pin-first:")) {
        const ref = id.slice(10);
        const next = [...pinned.filter((p) => p.ref === ref), ...pinned.filter((p) => p.ref !== ref)];
        if (next.length === 0 || next[0]?.ref !== ref) return true;
        void reorderPinsAction({ refs: next.map((p) => p.ref) }).then((r) => {
          if (r.ok) {
            setPinned(next.map((p, i) => ({ ...p, position: i })));
            assistant(labels.reorderDone.replace("{label}", next[0]?.label ?? pinLabelFor(ref)));
          } else {
            assistant(labels.pinUnavailable);
          }
        });
        return true;
      }
      if (id.startsWith("unpin:")) {
        const ref = id.slice(6);
        void unpinAction({ ref }).then((r) => {
          if (r.ok) {
            setPinned((prev) => prev.filter((p) => p.ref !== ref));
            assistant(labels.unpinDone);
          } else {
            assistant(labels.pinUnavailable);
          }
        });
        return true;
      }
      if (id === "pins:manage") {
        if (pinned.length === 0) assistant(labels.pinsNone);
        else
          assistant(
            labels.pinsManageIntro,
            pinned.flatMap((p, i) => [
              ...(i > 0 ? [{ id: `pin-first:${p.ref}`, label: `${labels.pinFirstPrefix}: ${p.label ?? pinLabelFor(p.ref)}` }] : []),
              { id: `unpin:${p.ref}`, label: `${labels.unpinPrefix}: ${p.label ?? pinLabelFor(p.ref)}` },
            ]),
          );
        return true;
      }
      return false;
    },
    [pinned, pinLabelFor, assistant, labels],
  );

  const handleChipRef = useRef<(chip: ChoiceChip) => void>(() => {});

  const handleChip = useCallback(
    (chip: ChoiceChip) => {
      if (runPinChip(chip.id)) return;
      noteUsage(chip.id, chip.label);
      switch (chip.id) {
        case "agency-offers":
          // The attention chip ("N agentūros pasiūlymai laukia…") — the SAME
          // in-chat offers answer the sentence runs.
          startClientOffers();
          return;
        case "compass-page":
          // The compass answer names its next steps as chat actions; the
          // profile section that renders the full compass is one chip away
          // (route emitted by the chat, never by the workflow layer — W4).
          assistant(labels.learningCompassHint, [
            { id: "link:/dashboard/profile#learning-compass", label: labels.chipLearningCompass },
          ]);
          return;
        case "documents-centre":
          // The document-gap answer names the closing step; the centre (add,
          // renew, send for verification) is the ONE existing surface for it.
          // The workflow layer emits no route (W4 guard) — the chat does, as
          // it already does for every other route chip.
          assistant(labels.adminRouteHint, [
            { id: "link:/dashboard/documents", label: labels.documentsChip },
          ]);
          return;
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
        case "agency:demand":
          user(labels.userClientDemand);
          // The agency bridge read, answered IN the chat — the same rows the
          // company page's bridge section renders.
          runAgencyRead("demand");
          break;
        case "agency:progress":
          user(labels.userProposalStatus);
          runAgencyRead("progress");
          break;
        default:
          if (chip.id === "edu:create" || chip.id === "edu:cohort" || chip.id === "edu:assign") {
            runEducationProgrammes(chip.id.slice(4) as "create" | "cohort" | "assign");
            break;
          }
          if (chip.id.startsWith("edu-cohort:")) {
            runEducationProgrammes("cohort", chip.id.slice(11));
            break;
          }
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
          } else if (chip.id.startsWith("ws:")) {
            // Context-switch chip (gap G1) — carries ONLY the workspace id;
            // membership is re-validated server-side, the chip grants nothing.
            const target = (auth?.workspaces ?? []).find(
              (w) => w.id === chip.id.slice(3),
            );
            if (target) {
              user(chip.label);
              performContextSwitch(target);
            }
          } else if (chip.id.startsWith("offer-accept:") || chip.id.startsWith("offer-decline:")) {
            // The client's decision: the chip carries the offer id and nothing
            // else; the RPC re-checks the demand is theirs and the offer open.
            user(chip.label);
            runOfferDecision(
              chip.id.slice(chip.id.indexOf(":") + 1),
              chip.id.startsWith("offer-accept:") ? "accepted" : "declined",
            );
          } else if (chip.id.startsWith("agency-propose:")) {
            // The share-bound handoff: the chip carries the share id and
            // NOTHING else; the RPC re-verifies the share is active and the
            // worker is on THIS agency's roster before any row exists.
            user(chip.label);
            openProposeForm(chip.id.slice(15));
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
    [labels, user, assistant, withTyping, pushEmbed, openForm, bookingOffers, bookingLabels, locale, starterChips, runEducationProgrammes, runPinChip, noteUsage, startFindWork, startProfileSummary, startWorkLog, startAgenda, startEmployerCandidates, startProjects, startEngagements, runAssignWorker, router, auth, performContextSwitch, runAgencyRead, openProposeForm],
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
        } else if (v.window.kind === "from_date" && v.window.startIso) {
          parts.push(t("valueIntent.fromDate", { date: formatDay(v.window.startIso, locale) }));
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
      if (v.city) parts.push(v.city);
      else if (v.country) parts.push(v.country);
      return parts.join(" · ");
    },
    [t, workTypeLabels, locale],
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
      // The CITY the person named stays beside the market — "Rotterdam,
      // Nyderlandai", never just the country (owner contract 2026-09-04 §9).
      if (countryLabel) out.location = v.city ? `${v.city}, ${countryLabel}` : countryLabel;
      else if (v.city) out.location = v.city;
      // Derived facts ride the form state unrendered: the executor sets the
      // canonical columns from them (the label above is what the person reads).
      if (v.workType) out.workType = v.workType;
      if (v.country) out.country = v.country;
      if (v.headcount !== null) out.teamSize = String(v.headcount);
      if (v.window) {
        if (v.window.kind === "from_date" && v.window.startIso) {
          out.startDate = v.window.startIso;
          // The END, when stated as a date or a duration ("iki spalio 20",
          // "3 savaitėms") — never invented.
          if (v.window.endIso) out.endDate = v.window.endIso;
          out.urgency = daysUntil(v.window.startIso) <= 7 ? "this_week" : "flexible";
        } else {
          out.urgency = v.window.kind === "next_month" ? "flexible" : "this_week";
        }
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
      // Chat-first execution funnel: was the sentence understood at all? The
      // intent id and the coarse role only — never the sentence.
      trackFunnel(
        intent === "unknown"
          ? FUNNEL_EVENTS.chatIntentUnrecognized
          : FUNNEL_EVENTS.chatIntentRecognized,
        { surface: "chat", step: intent, role_context: roleContextNow },
      );

      // MY SPACE §4C — the typed sentence is a use of the SAME reference its
      // chip carries ("užrašyk darbą" three times = the log-work chip three
      // times). One counter, one ask, one key space: the ref goes through
      // `noteUsage` exactly like a chip click.
      {
        const sentenceRef = pinRefForSentence(intent, identity === "company" ? "company" : "person");
        if (sentenceRef) noteUsage(sentenceRef, sentencePinLabel(sentenceRef));
      }

      /**
       * G2: the sentence dispatch goes through THE declarative intent
       * registry (`lib/conversation/intent-registry.ts`). The table is the
       * enumerable contract — domain, read/write class, typing behavior —
       * and these are the component-bound handler implementations it names.
       * Exhaustive in BOTH directions at compile time: a new
       * `ConversationIntent` without a registry row, or a registry row
       * naming a handler missing here, refuses to build — never a silent
       * fallthrough to the generic fallback.
       */
      const handlers: IntentHandlers = {
        /**
         * AI-workspace goals (W4). Each one is a real workflow over canonical
         * reads; "find-work" goes through it too, because the sentence may
         * carry World State ("…in Germany") that the plain search would drop
         * on the floor. "Kokias galimybes man gali pasiūlyti?" is the SAME
         * question as "rask man darbą", so `opportunities` maps to the SAME
         * handler in the registry: one matching pipeline, one result surface,
         * no second stack.
         */
        findWork: () => runWorkflow(() => runFindWork(text)),
        skillGap: () => runWorkflow(() => runSkillGap()),
        recentJournal: () => runWorkflow(() => runRecentJournal()),
        figures: () => runWorkflow(() => runFigures()),
        openProject: () => runWorkflow(() => runOpenProject(text)),
        // G8: the typed sentence runs the SAME functions the `projects` and
        // `candidates` chips run — never a second engine for the same request.
        projectsList: () => startProjects(),
        employerCandidates: () => startEmployerCandidates(),
        findWorkers: () => runWorkflow(() => runFindWorkers()),
        contextReadback: () => runWorkflow(() => runContextReadback()),
        // "Kas susidomėjo mano poreikiu?" — routed by IDENTITY, because the
        // sentence means two different real things. For the employer it is
        // "which of my demands, and who is on them" (the demand list whose
        // chips run scouting in-panel). For the worker it is their own board,
        // where "Mano susidomėjimai" carries the company's answer. Neither
        // branch invents a candidate the reader is not allowed to see.
        // A person who can act as an employer but is standing in their
        // personal space used to get a JOB SEARCH — an answer to neither
        // reading of the question. The honest answer there is to ASK rather
        // than to guess: both readings answer INSIDE the workspace (W8) —
        // these are the existing in-chat results the starter chips run,
        // carrying labels that name the two readings, never `link:` routes
        // out of the chat-first workspace (`w8-employer-chat-workspace`
        // refuses those by name).
        interestInbox: () => {
          if (identity === "company" || !canActAsEmployer) {
            runWorkflow(() =>
              identity === "company" ? runFindWorkers() : runFindWork(text),
            );
            return;
          }
          withTyping(() =>
            assistant(labels.interestInboxAmbiguous, [
              { id: "candidates", label: labels.chipInterestOnMyNeeds },
              { id: "jobs", label: labels.chipMyOwnInterest },
            ]),
          );
        },
        // ONE ACTIVE CONTEXT by sentence (gap G1) — resolves the target
        // against the caller's real workspace list, asks when ambiguous.
        switchContext: () => startSwitchContext(text),
        // These run a real async server read with their own typing cue.
        profileSummary: () => startProfileSummary("profile"),
        nextActionSummary: () => startProfileSummary("next"),
        resumeSummary: () => startProfileSummary("resume"),
        criteria: () => startCriteria(),
        // The canonical card, rendered IN the conversation (§5.1).
        playerCard: () => startPlayerCard(),
        // §7.1 — the real work relationships, in the panel. Saying "end my
        // engagement" opens the LIST, never a confirmation: the confirmation
        // belongs to one real row and is minted there.
        engagements: () => startEngagements(),
        // W6 slice 3D — the real state of the person's experiences, plus one
        // chip per interaction they could actually describe. Never a form.
        experiences: () => startExperiences(),
        // Real agenda readback from the canonical Time Engine (async, own
        // typing cue) — no longer a bare navigation hint.
        agenda: () => startAgenda(),
        cvChip: () => handleChip({ id: "cv", label: "" }),
        offersChip: () => handleChip({ id: "offers", label: "" }),
        // A sentence that NAMES the journal is a request, not a vague
        // mention: open the flow instead of answering with the clarify
        // question the user cannot escape by rephrasing.
        logWork: () =>
          startWorkLog(text, { explicit: isExplicitJournalRequest(text) }),
        // Employer demand (rebuild W4): the canonical intake as an inline
        // form — for the employer identity only; a worker typing about
        // workers gets the honest fallback, never a wrong-audience form.
        // V9: what the sentence already SAID pre-fills the form (visible,
        // editable, still reviewed — nothing submitted on their behalf).
        needWorkers: () => {
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
            assistant(fallbackText, starterChips);
          }
        },
        // §33 — "reikia, kad kas nors sutaisytų stogą" is a request for a
        // JOB TO BE DONE, not for somebody to fill a job. Routes to the
        // surface that already exists for exactly this (a buyer discovering
        // active offerings and requesting one) rather than growing a second
        // intake inside the chat. Not identity gated: needing a service is
        // not a workspace role.
        needService: () =>
          assistant(labels.serviceNeedHint, [
            {
              id: "link:/dashboard/service-requests",
              label: labels.chipServiceRequests,
            },
          ]),
        // V9/V10: read the statement, run channel DISCOVERY, render the
        // honest options (renderValueStatement — shared with the
        // correction path so both render identically).
        offerValue: () =>
          renderValueStatement(structureValueStatement(text), text),
        // Honest blocked/hint answers explain themselves; repeating the same
        // four-item menu under every one of them taught users to ignore the
        // chips entirely. The menu stays where it is a menu: the greeting
        // and the not-understood fallback.
        //
        // "Kas vyksta mano įmonėje?" — the same link-chip move as the admin
        // areas: route to the ONE canonical company screen rather than grow
        // a second company view inside the chat. Identity-gated exactly like
        // `need-workers`: a person in their personal space has no company
        // hub to open — but a company owner asking what is happening in
        // their company gets their company, not a shrug, whichever workspace
        // they happen to be standing in.
        companyOverview: () => {
          if (identity === "company" || canActAsEmployer) {
            assistant(labels.adminRouteHint, [
              { id: "link:/dashboard/company", label: labels.chipCompanyHub },
            ]);
          } else {
            assistant(fallbackText, starterChips);
          }
        },
        // "Sukurk įmonės profilį" — START an organization. Routes to the ONE
        // canonical setup surface (`/dashboard/start/company`) — the
        // verification ladder, the ownership rules and the persistence all
        // stay where they already live. NOT identity-gated: starting an
        // organization is precisely what a person WITHOUT one does. Somebody
        // who already acts as an employer is offered their existing
        // workspace alongside it — creating a second company is legitimate,
        // but landing on a blank form when they meant "my company" is the
        // dead end this pass exists to remove.
        createOrganization: () =>
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
          ),
        // "Kiek turiu LMC?" — a `link:` chip to the ONE canonical surface,
        // not a second balance rendered in the thread: the figure comes from
        // `lmc_account_balances` under the caller's own RLS, and a number
        // repeated in two places is a number that will eventually disagree
        // with itself — on money, that is not a cosmetic problem. The anchor
        // matters as much as the route: dropping somebody at the top of a
        // settings page is not an answer to "how much do I have".
        lmc: () =>
          assistant(labels.lmcHint, [
            { id: "link:/dashboard/account#lmc", label: labels.chipLmc },
          ]),
        // "Ką turiu patvirtinti?" — the approvals area. A `link:` chip is
        // the sanctioned move here: it routes to the ONE canonical screen
        // and never grows a second view of it.
        adminApprovals: () =>
          assistant(labels.adminRouteHint, [
            {
              id: "link:/dashboard/network?area=approvals",
              label: labels.adminApprovalsChip,
            },
          ]),
        // "Noriu pateikti atostogų prašymą" — the filing half of the same
        // engine (leave, trip, expense), same routing rule.
        adminRequests: () =>
          assistant(labels.adminRouteHint, [
            {
              id: "link:/dashboard/network?area=requests",
              label: labels.adminRequestsChip,
            },
          ]),
        // "Parodyk mano tabelį" — the timesheet documents live under the
        // planning page's #timesheets anchor; same one-canonical-surface rule.
        timesheets: () =>
          assistant(labels.adminRouteHint, [
            {
              id: "link:/dashboard/planning#timesheets",
              label: labels.timesheetsChip,
            },
          ]),
        // ── §9 chat-first coverage ────────────────────────────────────────
        // Six domains the product already ships, each of which could only be
        // reached by KNOWING ITS URL until now. Every one answers the same
        // way the admin areas do: the honest route hint plus ONE chip
        // carrying a human label to the single canonical screen. No second
        // view of the domain grows inside the thread, and — because these are
        // route-class — no second write path either: the screen the chip
        // opens owns its own writes, with its own confirmations.
        //
        // "Įkelk tabelį" lands on the hours screen in its import mode: the
        // historical grid and today's quick entry produce the same canonical
        // allocations, so they are one surface, not two.
        timesheetImport: () =>
          assistant(labels.adminRouteHint, [
            {
              id: "link:/dashboard/hours?import=1",
              label: labels.timesheetImportChip,
            },
          ]),
        workHours: () =>
          assistant(labels.adminRouteHint, [
            { id: "link:/dashboard/hours", label: labels.workHoursChip },
          ]),
        absences: () =>
          assistant(labels.adminRouteHint, [
            { id: "link:/dashboard/absences", label: labels.absencesChip },
          ]),
        // Owner contract 2026-09-04 §12: a person's documents are ANSWERED
        // (have / expiring / missing for the countries they want to work in,
        // who can issue), never only routed. A company workspace keeps the
        // route to its own document centre (the org read is a different join).
        documents: () =>
          identity === "person"
            ? runWorkflow(() => runDocumentsReadiness())
            : assistant(labels.adminRouteHint, [
                { id: "link:/dashboard/documents", label: labels.documentsChip },
              ]),
        marketMap: () =>
          assistant(labels.adminRouteHint, [
            { id: "link:/dashboard/market-map", label: labels.marketMapChip },
          ]),
        activityCentre: () =>
          assistant(labels.adminRouteHint, [
            { id: "link:/dashboard/activity", label: labels.activityChip },
          ]),
        // No scheduler exists — never a fake reminder (honest degradation).
        // ── AGENCY (real recruiter pilot, 2026-09-04) ─────────────────────
        // "noriu pakviesti klientą" → the ONE missing question (e-mail) → the
        // canonical client invitation → readback. The candidate invite and
        // the proposal run the same way; the two reads answer in the chat.
        inviteClient: () => startAgencyInvite("agency.invite-client", text),
        inviteCandidate: () => startAgencyInvite("company.invite-worker", text),
        clientDemand: () => runAgencyRead("demand"),
        proposeCandidate: () => runAgencyRead("propose"),
        // "How are my proposals doing?" means two real things: the agency's
        // offers (company identity) or the worker's own booking offers
        // (person) — routed by the ACTIVE identity, never guessed.
        proposalStatus: () => {
          if (identity === "person" && !canActAsEmployer) {
            handleChip({ id: "offers", label: "" });
            return;
          }
          runAgencyRead("progress");
        },
        // ── STUDENT / INSTITUTION — the one chip to the canonical surface ──
        // Owner contract 2026-09-04 §15: the student's compass is ANSWERED
        // in the chat (becoming · evidence · fits · missing · next step) for a
        // person; a company workspace is handed the section.
        learningCompass: () =>
          identity === "person"
            ? runWorkflow(() => runLearningCompass())
            : assistant(labels.learningCompassHint, [
                { id: "link:/dashboard/profile#learning-compass", label: labels.chipLearningCompass },
              ]),
        // ── EDUCATION (owner contract 2026-09-04 §15) ─────────────────────
        // The institution's commands by SENTENCE over the ONE dispatcher:
        // "pakviesk studentą" → one question (e-mail) → canonical invitation
        // with the student relationship; "sukurk programą / grupę",
        // "priskirk studentą grupei" → the matching inline form built from
        // the institution's REAL programmes, cohorts and accepted learners;
        // "parodyk programas" → answered in the chat.
        inviteStudent: () => startEducationInvite(text),
        programmes: () => runEducationProgrammes(educationModeFromText(text)),
        createProject: () => startCreateProject(text),
        clientOffers: () => startClientOffers(),
        addDocument: () => startAddDocument(text),
        // "Parodyk / atsisiųsk mano CV" is the verified CV SHEET (print-to-PDF),
        // not the import flow the bare "cv" chip starts. One chip to the one
        // canonical output; a company identity has no own CV to show.
        cvExport: () =>
          identity === "person"
            ? assistant(labels.cvExportHint, [{ id: "link:/cv", label: labels.chipCvSheet }])
            : assistant(fallbackText, starterChips),
        reminderBlocked: () => assistant(labels.reminderBlocked),
        // No real translation engine — never a fake translation.
        translateBlocked: () => assistant(labels.translateBlocked),
        // §8.1: the chat SHOWS the waiting threads, drafts a reply and
        // sends it after confirmation — the full inbox stays one tap away.
        messages: () => startMessages(),
        writeEmployer: () => assistant(labels.writeEmployerHint),
      };
      dispatchIntent(intent, handlers, withTyping, () =>
        assistant(fallbackText, starterChips),
      );
    },
    [noteUsage, sentencePinLabel, startCreateProject, startClientOffers, startAddDocument, user, withTyping, handleChip, assistant, labels, starterChips, runWorkflow, startEducationInvite, runEducationProgrammes, startWorkLog, startProfileSummary, startCriteria, startAgenda, startPlayerCard, startMessages, startExperiences, startEngagements, startSwitchContext, startProjects, startEmployerCandidates, openForm, identity, t, demandPrefill, renderValueStatement, fallbackText, roleContextNow, canActAsEmployer, startAgencyInvite, runAgencyRead],
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
      <div
        role="main"
        className={`flex flex-col bg-ink-900 ${mobile ? "h-full" : "h-[100dvh]"}`}
        data-testid="conversation-chat"
      >
        <ConversationHeader title={labels.headerTitle} nav={nav} mobile={mobile} />
        <MySpaceRow
          pins={pinned.map((p) => ({ ref: p.ref, label: p.label ?? pinLabelFor(p.ref) }))}
          title={labels.mySpaceTitle}
          manageLabel={labels.chipManagePins}
          onPin={(ref) => handleChip({ id: ref, label: pinLabelFor(ref) })}
          onManage={() => handleChip({ id: "pins:manage", label: labels.chipManagePins })}
        />
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
            chipsPostedAt={chipsPostedAt}
            onCloseResult={closeResult}
            onOpenFull={openFullScreen}
          />
        </div>
      </div>
    </WorldStateProvider>
  );
}
