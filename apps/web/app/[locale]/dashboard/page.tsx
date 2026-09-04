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
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { isEducationFirstWorkspace } from "@/lib/conversation/education-home";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { listMyEngagements } from "@/lib/invitations/network";

/**
 * Dashboard root — the CONVERSATION-FIRST home. For the ordinary user the whole
 * screen is one chat (greeting → starter chips → dialogue with inline CV /
 * profile / booking flows). The former card control room (`/dashboard/advanced`)
 * was DELETED by W3 Package 4 — this chat is the one workspace root.
 *
 * The wide module navbar is NOT hidden with an overlay any more: the layout's
 * `<DashboardChrome>` renders NO wide chrome on `/dashboard` (its DOM is absent,
 * not painted over), so the chat fills the viewport and supplies its own
 * simple-mode header + bottom nav (the 5-item nav). Deterministic (LLM off).
 */
export default async function DashboardHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await getSessionProfile();
  const activeRole = (session.profile?.active_role as Role | null) ?? "worker";

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
  const personalIntroPayload: Promise<PersonalIntroPayload> =
    loadPersonalIntroPayload();
  // M10 — HOME IDENTITY ADAPTATION, within the two-base-identity model.
  // Which starters the company greeting offers depends on what the active
  // organization DECLARED it does (canonical `organization_roles` read, legacy
  // column fallback — the same layer the invite panel and the company hub
  // read). For a person, one RLS-scoped read answers whether an ACTIVE
  // learner link exists, so the opening can acknowledge the real learning
  // context. Both reads run in parallel with the booking read below; every
  // failure degrades to the plain greeting — nothing is fabricated.
  const identity = baseIdentityForRole(activeRole) ?? "person";
  const [{ offers, labels: bookingLabels }, educationWorkspace, learnerLink, agencyWorkspace] =
    await Promise.all([
      loadBookingOffers(activeRole),
      identity === "company" ? loadEducationWorkspaceFlag() : false,
      identity === "person" ? loadActiveLearnerLink() : null,
      identity === "company" ? loadAgencyWorkspaceFlag() : false,
    ]);
  const labels = resolveChatLabels(await getTranslations("conversation.chat"));
  const workLogLabels = resolveWorkLogLabels(
    await getTranslations("conversation.worklog"),
  );

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
  const tCountryNames = await getTranslations("labourMarket");
  const countryLabels = Object.fromEntries(
    MARKET_COUNTRIES.map((c) => [c, tCountryNames(`countryNames.${c}`)]),
  ) as Record<string, string>;

  // M10 — the learner line is resolved HERE because it carries a placeholder
  // (`{institution}`), same rule as `greetingNamed`: the raw placeholder must
  // never reach the screen. Rendered only with the institution's REAL name.
  const tChat = await getTranslations("conversation.chat");
  const learnerContextLine =
    identity === "person" && learnerLink
      ? tChat("learnerGreetingContext", { institution: learnerLink })
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
        labels={labels}
        workLogLabels={workLogLabels}
        bookingOffers={offers}
        bookingLabels={bookingLabels}
        personalIntroPayload={personalIntroPayload}
        countryLabels={countryLabels}
        educationWorkspace={educationWorkspace}
        agencyWorkspace={agencyWorkspace}
        learnerContextLine={learnerContextLine}
      />
    </>
  );
}

/**
 * M10 — is the ACTIVE organization an education-first workspace?
 *
 * `getActiveOrganizationContext` is request-cached (the layout already runs
 * it), so the only new IO is the one `organization_roles` read the invite
 * panel and the company hub already perform per organization. Declared rows
 * win; the legacy column is the fallback (`organizationCapabilities`
 * semantics). Any failure reads as `false` — the plain employer greeting,
 * never an invented capability.
 */
/**
 * Real recruiter pilot (2026-09-04) — is the ACTIVE workspace a staffing
 * agency? Same resolver the company page uses (membership-validated employer
 * context → creator-or-governing-member company read → `company_type`).
 * Decides which starters and which fallback the company greeting offers; the
 * two-base-identity model is untouched (an agency is a company TYPE). Any
 * failure reads as `false` — the plain employer greeting, never an invented
 * agency.
 */
async function loadAgencyWorkspaceFlag(): Promise<boolean> {
  try {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind !== "ok") return false;
    const company = await getOwnedCompanyById(ctx.companyId);
    return company.kind === "ok" && company.row?.companyType === "staffing_agency";
  } catch {
    return false;
  }
}

async function loadEducationWorkspaceFlag(): Promise<boolean> {
  try {
    const orgContext = await getActiveOrganizationContext();
    if (!orgContext.activeOrganizationId) return false;
    const roleSlugs = await readOrganizationCapabilities(
      orgContext.activeOrganizationId,
    );
    return isEducationFirstWorkspace({
      roleSlugs,
      legacyType: orgContext.activeOrganization?.organizationType ?? null,
    });
  } catch {
    return false;
  }
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
  const labels =
    intro.kind === "hidden"
      ? null
      : resolvePersonalWorkspaceLabels(
          await getTranslations("personalWorkspace"),
          await getTranslations("playerCard.readinessSteps.pillar"),
          await getTranslations("conversation.chat"),
        );
  return { intro, labels };
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
  const tB = await getTranslations("bookings.actions");
  const tC = await getTranslations("conversation.booking");
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
