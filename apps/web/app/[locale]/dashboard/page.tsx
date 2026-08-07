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
import type { ActiveLocale } from "@/lib/i18n/config";
import { loadPersonalWorkspaceIntro } from "@/lib/workspace/personal-workspace-intro-server";
import { resolvePersonalWorkspaceLabels } from "@/lib/workspace/personal-workspace-labels";

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
  const { offers, labels: bookingLabels } = await loadBookingOffers(activeRole);
  const labels = resolveChatLabels(await getTranslations("conversation.chat"));
  const workLogLabels = resolveWorkLogLabels(
    await getTranslations("conversation.worklog"),
  );

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
      />
    </>
  );
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
