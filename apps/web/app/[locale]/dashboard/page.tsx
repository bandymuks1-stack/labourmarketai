import { redirect } from "next/navigation";

import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { type Role } from "@/lib/auth/actions";
import { listMyBookings } from "@/lib/booking/booking-actions";
import {
  ConversationChat,
  type PersonalIntroPayload,
} from "@/components/app/conversation/chat/conversation-chat";
import {
  resolveChatLabels,
  resolveWorkLogLabels,
} from "@/components/app/conversation/chat/labels";
import type {
  BookingActionLabels,
  BookingOffer,
} from "@/components/app/conversation/worker-booking-action";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import type { ActiveLocale } from "@/lib/i18n/config";
import { loadPersonalWorkspaceIntro } from "@/lib/workspace/personal-workspace-intro-server";
import { resolvePersonalWorkspaceLabels } from "@/lib/workspace/personal-workspace-labels";
import { baseIdentityForRole } from "@/lib/config/roles";
import { listMyEngagements } from "@/lib/invitations/network";
import {
  loadCompanyStarterContext,
  loadPersonStarterFacts,
  personStarterContext,
  type WorkspaceStarterContext,
} from "@/lib/conversation/starter-signals";
import {
  capabilityPhraseKeys,
  deriveStarters,
  personHasUsableProfile,
} from "@/lib/conversation/starters";
import { listMyPins } from "@/lib/workspace/pins";
import { Link } from "@/lib/i18n/navigation";
import { WorkspaceChip } from "@/components/app/conversation/chat/workspace-chip";
import {
  getWorkspaceContext,
  readSessionWorkspacePointer,
} from "@/lib/company/active-organization";
import {
  classifyDurablePointer,
  decideDashboardRole,
  type DurablePointerKind,
} from "@/lib/auth/dashboard-role-decision";
import { TodayScreen } from "@/components/app/today/today-screen";
import { conversationOpeningContext } from "@/lib/today/today-route";
import { AccessRefusalNotice } from "@/components/app/access-refusal-notice";
import {
  accessNoticeMessageKey,
  accessNoticeOffersSetup,
  parseAccessNotice,
} from "@/lib/auth/access-notice";

/**
 * Dashboard root — the ONE authenticated home: the conversation, for EVERY
 * identity (owner decision 0017, 2026-09-22). What differs per person is the
 * OPENING CONTEXT the conversation composes above its greeting, decided by
 * ONE pure predicate (`lib/today/today-route.ts`):
 *
 *   ŠIANDIEN (worker, personal space) — the worker's "now"
 *   (`docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md` §2 composition):
 *   name · profession · today's state, ONE next action, today's recorded
 *   work, open items, one growth sentence, one opportunity sentence, the
 *   contextual workspaces as text links. It stands INSIDE the conversation's
 *   opening composition, with the composer right under it, and REPLACES the
 *   opening intro card for the worker (owner direction 2026-09-13: no welcome
 *   card). It is not a page and not a second home — the 2026-09-13 root
 *   split (ŠIANDIEN page · PAKLAUSK `?ask=1` tab) is retired.
 *
 *   THE WORKSPACE COMPOSITION — for every other identity and for a worker
 *   acting inside an organization: the opening brief, the "Mano erdvė"
 *   block and the starters they already had. Every existing deep link
 *   (`?result=`, `?say=`, `?intent=`, …) opens the same chat it always did.
 *   The former card control room (`/dashboard/advanced`) was DELETED by W3
 *   Package 4 — nothing here brings a card wall back.
 *
 * The wide module navbar is NOT hidden with an overlay: the layout's
 * `<DashboardChrome>` renders NO wide chrome on `/dashboard` (its DOM is
 * absent, not painted over). The chat fills the viewport and supplies the one
 * top bar. Deterministic (LLM off).
 */
export default async function DashboardHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await getSessionProfile();
  // WHICH ROLE OPENS THIS SCREEN (W6 honesty, 2026-09-06). The old null-to-
  // worker fallback swallowed a FAILED profile read: a company owner whose row read timed
  // out was greeted in the personal space as a person, and nothing said so.
  // The pure decision trusts the row when it was read, falls back to the
  // person's OWN durable workspace pointer (membership-validated) when it
  // was not, and otherwise NAMES the failure — the real workspace chooser
  // plus retry — never a silently chosen workspace.
  let pointer: DurablePointerKind = null;
  if (session.profileRead === "failed") {
    const [stored, ws] = await Promise.all([
      readSessionWorkspacePointer(),
      getWorkspaceContext(null),
    ]);
    pointer = classifyDurablePointer(
      stored,
      ws.workspaces.filter((w) => w.kind === "organization").map((w) => w.id),
    );
  }
  const decision = decideDashboardRole({
    profileRead: session.profileRead,
    activeRole: session.profile?.active_role ?? null,
    pointer,
  });
  if (decision.kind === "read-failed") {
    const tRead = await getTranslations("workspace.readFailed");
    return (
      <section
        data-testid="dashboard-profile-read-failed"
        role="status"
        className="mx-auto flex min-h-[60dvh] w-full max-w-content flex-col items-center justify-center gap-4 px-4 py-16 text-center"
      >
        <p className="text-sm text-text-primary">{tRead("body")}</p>
        <p className="text-xs text-text-secondary">{tRead("choose")}</p>
        <WorkspaceChip />
        <Link
          href="/dashboard"
          className="text-sm font-medium text-brand-blue underline-offset-4 hover:underline"
        >
          {tRead("retry")}
        </Link>
      </section>
    );
  }
  const activeRole: Role = decision.role;

  // WHICH opening context the ONE conversation composes — from the identity
  // the role decision produced and the workspace the chip resolves
  // (request-cached; the layout already ran it). A worker in their personal
  // space opens with ŠIANDIEN above the greeting; everyone else with the
  // workspace composition.
  const identity = baseIdentityForRole(activeRole) ?? "person";
  const rootWorkspace = await getWorkspaceContext(identity);
  const workerToday =
    conversationOpeningContext({
      activeRole,
      activeWorkspaceId: rootWorkspace.activeWorkspaceId,
    }) === "today";

  // "Mano erdvė" (S2) — resolved on the server from the readers this request
  // already runs (session profile, workspace context, worker activity, the
  // canonical player card). It decides ONLY whether the personal block is
  // shown and what it says; its copy is resolved in the same payload
  // (label-bag idiom), so no new message namespace reaches the client bundle.
  //
  // DELIBERATELY NOT AWAITED (#1011). The worker-side readiness reads behind
  // this payload (worker activity + the player-card model) are the slowest
  // thing on the page — awaiting them here pushed the ENTIRE worker surface
  // past the shell flush into the route's loading.tsx Suspense boundary, so a
  // worker saw the skeleton for the full read (and, in a tab that has not yet
  // painted a frame, React's batched reveal never runs at all — the page hung
  // on the skeleton). The promise streams to the client and resolves inside
  // the chat's own invisible Suspense boundary (SpineStream pattern): the
  // conversation surface reaches the shell for every identity, and the intro
  // block appears the moment it is known.
  //
  // For the worker in their personal space the block is hidden with its
  // reason named: ŠIANDIEN's header is where their space is introduced (IA
  // §4: the intro card is REPLACED, not shown twice).
  const personalIntroPayload: Promise<PersonalIntroPayload> = workerToday
    ? Promise.resolve({ intro: { kind: "hidden", reason: "replaced-by-today" }, labels: null })
    : loadPersonalIntroPayload();
  // STARTERS ARE SUGGESTIONS, NOT A ROLE MENU (owner contract 2026-09-04
  // §5–§6, ARCHITECTURE §5.5). The company greeting used to branch on ONE
  // flag (education | agency | employer) and show that role's three chips —
  // the real recruiter's workspace, an agency that also holds needs, a roster
  // and projects, opened as "Agency Mode". Now the server resolves the ACTIVE
  // workspace's capabilities and the few facts that decide each track's next
  // real step, and the pure resolver returns a small MIX. For a person, one
  // RLS-scoped read answers whether an ACTIVE learner link exists, so the
  // opening can acknowledge the real learning context. Every read degrades to
  // the plain greeting — nothing is fabricated.
  // KNOWN-STATE-FIRST (owner P0 §3, 2026-09-06): the person's suggestions
  // are derived from what the product already holds about them, so an
  // account with real skills, history or journal entries is no longer told
  // its first step is to upload a CV. Read in the SAME parallel batch as the
  // rest — three bounded head-counts, each degrading to "unknown".
  const [{ offers, labels: bookingLabels }, learnerLink, starterContext, personFacts] =
    await Promise.all([
      loadBookingOffers(activeRole),
      identity === "person" ? loadActiveLearnerLink() : null,
      identity === "company"
        ? loadCompanyStarterContext()
        : Promise.resolve<WorkspaceStarterContext | null>(null),
      identity === "person" ? loadPersonStarterFacts() : null,
    ]);
  const workspace: WorkspaceStarterContext =
    starterContext ??
    personStarterContext(Boolean(learnerLink), personFacts ?? undefined);
  const { agencyWorkspace, educationWorkspace } = workspace;
  const starters = deriveStarters(workspace.signals);
  // MY SPACE (owner contract 2026-09-04 §4C): the person's own pins for
  // THIS workspace, under RLS. Unavailable (migration unapplied / read
  // failed) → `null` → no row, no ask.
  // The pins read and the three translation bundles below are independent
  // of each other — one batch, not four consecutive awaits (measured: the
  // same reads, issued together).
  const [pinsRead, tChat, tWorkLog, tCountryNames] = await Promise.all([
    listMyPins(identity === "company" ? workspace.organizationId : null),
    getTranslations("conversation.chat"),
    getTranslations("conversation.worklog"),
    getTranslations("labourMarket"),
  ]);
  const pins = pinsRead.kind === "ok" ? pinsRead.pins : null;
  const labels = resolveChatLabels(tChat);
  const workLogLabels = resolveWorkLogLabels(tWorkLog);

  // WHY THE PERSON IS HERE, when they did not choose to be.
  //
  // A role gate sends someone to this home carrying `?notice=needs_<role>_role`
  // — and until 2026-09-22 nothing read it, so the refusal landed as a silent
  // teleport. Resolved on the SERVER: the chat receives a finished element,
  // so no message namespace is added to the client bundle and the internal
  // token never travels to the browser. An unknown `?notice=` yields null and
  // renders nothing, rather than echoing whatever was typed into the URL.
  const noticeParam = (await searchParams).notice;
  const refusedRole = parseAccessNotice(
    typeof noticeParam === "string" ? noticeParam : null,
  );
  const tAccess = refusedRole ? await getTranslations("workspace") : null;
  const accessNotice =
    refusedRole && tAccess ? (
      <AccessRefusalNotice
        reason={refusedRole}
        labels={{
          body: tAccess(accessNoticeMessageKey(refusedRole)),
          setupCta: accessNoticeOffersSetup(refusedRole)
            ? tAccess("accessNotice.setupCta")
            : null,
        }}
      />
    ) : null;

  /**
   * Localized country names for the demand prefill.
   *
   * The structurer already reads the country out of "…Nyderlanduose", but the
   * intake form then asked for the location anyway, because `demandPrefill`
   * had no way to turn `NL` into a word. The code itself must never reach the
   * field — that is an internal value in a box the person is about to read
   * (§23) — so the NAME is resolved here, where the catalogue lives.
   *
   * `labourMarket.countryNames` is the same node the company page uses; this
   * adds no second source.
   */
  const countryLabels = Object.fromEntries(
    MARKET_COUNTRIES.map((c) => [c, tCountryNames(`countryNames.${c}`)]),
  ) as Record<string, string>;

  // The learner's institution is named ONCE, by the opening brief
  // (`briefLearner`, lib/conversation/opening-brief.ts). Measured on
  // production 2026-09-06: this page ALSO composed its own intro line (the
  // `{institution}` greeting key) from the same engagement, so the learner's
  // first screen said "Mokotės su X" twice. The engagement read above still
  // decides the person's starters. (`tChat` is the bundle batched above.)
  // The not-understood answer and the opening line describe the world the
  // person stands in, composed from the capability tracks the workspace
  // genuinely holds — an agency that is also an employer hears BOTH. Phrases
  // are joined here, on the server, so the composed sentence is one
  // localized string (no client-side grammar).
  const phraseKeys = capabilityPhraseKeys(workspace.signals);
  const capabilityList = phraseKeys.map((k) => tChat(k)).join(", ");
  const contextFallback =
    identity === "company" && phraseKeys.length > 0
      ? tChat("fallbackComposed", { list: capabilityList })
      : null;
  const workspaceContextLine =
    identity === "company" && workspace.organizationName && phraseKeys.length > 0
      ? tChat("workspaceIntro", { company: workspace.organizationName, list: capabilityList })
      : null;

  // No overlay: the thin dashboard layout renders no chrome, so the chat simply
  // fills the viewport (its root is h-[100dvh]). The wide navbar lives only in
  // the (full) group and is never mounted here.
  return (
    <>
      {/* W14 — `dashboard_viewed` had NO emitter. The action registry declares
          `telemetryEvent: E.dashboardViewed` on two entries, but that field is
          never read by anything, so the event was never sent: the activation
          funnel's first step measured nothing. This is the emitter, on the one
          workspace root (`/dashboard/advanced` was deleted by W3 Package 4). */}
      <TelemetryView
        event={FUNNEL_EVENTS.dashboardViewed}
        metadata={{ surface: "dashboard_root" }}
      />
      <ConversationChat
        locale={locale as ActiveLocale}
        /* Why this home is the screen they got, when a link asked for a space
           they do not hold. Inside the chat rather than above it: the chat is
           `h-[100dvh]` and owns the viewport, so a sibling banner would push
           the composer off the bottom on a phone. */
        accessNotice={accessNotice}
        labels={labels}
        workLogLabels={workLogLabels}
        bookingOffers={offers}
        bookingLabels={bookingLabels}
        personalIntroPayload={personalIntroPayload}
        // ŠIANDIEN — server-rendered, streamed section by section inside the
        // chat's own opening composition (the worker's "now" above the
        // greeting and the composer). One home, one conversation.
        openingContext={workerToday ? <TodayScreen locale={locale as ActiveLocale} /> : null}
        countryLabels={countryLabels}
        educationWorkspace={educationWorkspace}
        agencyWorkspace={agencyWorkspace}
        starters={starters}
        personHasProfileData={
          personFacts ? personHasUsableProfile(personFacts) : null
        }
        contextFallback={contextFallback}
        workspaceContextLine={workspaceContextLine}
        pins={pins}
      />
    </>
  );
}

/**
 * M10 — the person's ACTIVE learner link, as the linked institution's real
 * name (`engagement_contexts` relationship `student`, the row an accepted
 * learner invitation creates — institution↔learner link v1). Reuses the
 * network page's own RLS-scoped read; `null` on no link, an unnamed
 * institution, or any degraded read — the greeting then stands unchanged.
 */
async function loadActiveLearnerLink(): Promise<string | null> {
  try {
    const engagements = await listMyEngagements();
    const link = engagements.find((e) => e.relationshipSlug === "student");
    return link?.organizationName?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The S2 payload — the intro model plus its resolved copy, as ONE promise the
 * page hands to the chat without awaiting. `resolvePersonalWorkspaceLabels`
 * runs only when there is actually a block to render (same rule as before).
 */
async function loadPersonalIntroPayload(): Promise<PersonalIntroPayload> {
  const intro = await loadPersonalWorkspaceIntro();
  if (intro.kind === "hidden") return { intro, labels: null };
  // Three independent bundles — one batch, not three consecutive awaits.
  const [tWorkspace, tPillar, tChat] = await Promise.all([
    getTranslations("personalWorkspace"),
    getTranslations("playerCard.readinessSteps.pillar"),
    getTranslations("conversation.chat"),
  ]);
  return { intro, labels: resolvePersonalWorkspaceLabels(tWorkspace, tPillar, tChat) };
}

async function loadBookingOffers(
  activeRole: Role,
): Promise<{ offers: BookingOffer[]; labels: BookingActionLabels | null }> {
  if (activeRole !== "worker") return { offers: [], labels: null };
  let offers: BookingOffer[] = [];
  try {
    const res = await listMyBookings();
    if (res.kind === "ok") {
      offers = res.incoming
        .filter((b) => b.status === "proposed")
        .slice(0, 5)
        .map((b) => ({
          bookingId: b.id,
          title: b.roleText ?? "",
          subtitle:
            b.startDate || b.expectedEndDate
              ? [b.startDate, b.expectedEndDate].filter(Boolean).join(" — ")
              : null,
        }));
    }
  } catch {
    return { offers: [], labels: null };
  }
  if (offers.length === 0) return { offers: [], labels: null };
  const [tB, tC] = await Promise.all([
    getTranslations("bookings.actions"),
    getTranslations("conversation.booking"),
  ]);
  return {
    offers,
    labels: {
      offerFrom: tC("offerTitle"),
      period: "{start} — {end}",
      accept: tB("accept"),
      decline: tB("decline"),
      confirmAcceptTitle: tC("confirmAcceptTitle"),
      confirmAcceptBody: tC("confirmAcceptBody"),
      confirmAcceptDisclosure: tC("confirmAcceptDisclosure"),
      confirmDeclineTitle: tC("confirmDeclineTitle"),
      confirmCta: tC("confirmCta"),
      cancelCta: tC("cancelCta"),
      working: tC("working"),
      acceptedResult: tB("accepted"),
      declinedResult: tB("declined"),
      errorGeneric: tB("error"),
      errorStale: tC("errorStale"),
      errorConflict: tB("conflict"),
    },
  };
}
