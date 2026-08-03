import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { type Role } from "@/lib/auth/actions";
import { listMyBookings } from "@/lib/booking/booking-actions";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { PersonalWorkspaceIntro } from "@/components/app/my-space/personal-workspace-intro";
import { ConversationChat } from "@/components/app/conversation/chat/conversation-chat";
import {
  resolveChatLabels,
  resolveWorkLogLabels,
} from "@/components/app/conversation/chat/labels";
import type {
  BookingActionLabels,
  BookingOffer,
} from "@/components/app/conversation/worker-booking-action";
import type { ActiveLocale } from "@/lib/i18n/config";

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

  const { offers, labels: bookingLabels } = await loadBookingOffers(activeRole);
  const labels = resolveChatLabels(await getTranslations("conversation.chat"));
  const workLogLabels = resolveWorkLogLabels(
    await getTranslations("conversation.worklog"),
  );

  // "Mano erdvė" (visual S2) — the PERSONAL state of this same workspace. It is
  // a slot, not a screen: no route, no nav entry, and the thread drops it the
  // moment the conversation stops opening.
  //
  // Two conditions, both real and both required:
  //   1. the active workspace is PERSONAL — inside an organization this space
  //      is not the subject, and the org composition is deliberately out of
  //      scope here (S2.4, blocked behind PR #858);
  //   2. the person is acting as a WORKER — a company/agency/customer identity
  //      has no worker profile to be ready, so worker-only copy would be a
  //      claim about something that does not exist.
  // `getActiveOrganizationContext` is `cache()`-wrapped and the dashboard
  // layout already resolved the workspace for this same request, so this adds
  // no round trip.
  const { activeOrganizationId } = await getActiveOrganizationContext();
  const isPersonalWorkspace = activeOrganizationId === null;
  const showPersonalSpace = isPersonalWorkspace && activeRole === "worker";

  // No overlay: the thin dashboard layout renders no chrome, so the chat simply
  // fills the viewport (its root is h-[100dvh]). The wide navbar lives only in
  // the (full) group and is never mounted here.
  return (
    <ConversationChat
      locale={locale as ActiveLocale}
      labels={labels}
      workLogLabels={workLogLabels}
      bookingOffers={offers}
      bookingLabels={bookingLabels}
      // RSC-passed slot elements carry an explicit key (repo precedent, PR
      // #951): Flight-deserialized elements can't be marked as static
      // children, so the key keeps this safe if the thread ever renders the
      // slot beside a sibling.
      intro={
        showPersonalSpace ? <PersonalWorkspaceIntro key="personal-workspace-intro" /> : undefined
      }
    />
  );
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
