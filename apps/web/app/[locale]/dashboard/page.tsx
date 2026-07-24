import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { type Role } from "@/lib/auth/actions";
import { listMyBookings } from "@/lib/booking/booking-actions";
import {
  ConversationChat,
  type ChatLabels,
} from "@/components/app/conversation/chat/conversation-chat";
import type { BookingActionLabels } from "@/components/app/conversation/worker-booking-action";
import type { BookingOffer } from "@/components/app/conversation/conversation-shell";
import type { ActiveLocale } from "@/lib/i18n/config";

/**
 * Dashboard root — the CONVERSATION-FIRST home. For the ordinary user the whole
 * screen is one chat (greeting → starter chips → dialogue with inline CV /
 * profile / booking flows). The card control room now lives at
 * `/dashboard/advanced` (Advanced mode). Rendered as a full-viewport surface so
 * the ordinary worker never sees the wide module navbar; Advanced mode is the
 * one escape hatch in the chat header. Deterministic (LLM off).
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
  const t = await getTranslations("conversation.chat");
  const labels = resolveChatLabels(t);

  // Full-viewport overlay: the ordinary user's dashboard IS the conversation,
  // so it covers the shared dashboard chrome (which stays for Advanced mode).
  return (
    <div className="fixed inset-0 z-[60]">
      <ConversationChat
        locale={locale as ActiveLocale}
        labels={labels}
        bookingOffers={offers}
        bookingLabels={bookingLabels}
      />
    </div>
  );
}

function resolveChatLabels(t: Awaited<ReturnType<typeof getTranslations>>): ChatLabels {
  const keys = [
    "headerTitle", "advanced", "composerPlaceholder", "send", "attach", "greeting",
    "chipCv", "chipJobs", "chipProfile", "chipOffers", "profileQuestion", "chipLang",
    "chipExp", "chipEdu", "chipCard", "chipPrefs", "jobsAnswer", "offersEmpty",
    "fallback", "userCv", "userProfile", "userOffers", "userJobs",
  ] as const;
  const out = {} as Record<(typeof keys)[number], string>;
  for (const k of keys) out[k] = t(k);
  return out as ChatLabels;
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
