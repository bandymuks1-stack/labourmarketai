import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  ConversationHeader,
  ConversationBottomNav,
  type ConversationNavLabels,
} from "@/components/app/conversation/chat/conversation-header";

/**
 * Simple-mode shell for the specialized panel routes reachable from the
 * conversation's 5-item nav — human message threads (`/communication`), the
 * calendar (`/planning`) and profile/avatar (`/profile`). They render inside the
 * SAME simple-mode header + bottom nav the conversation uses, NOT the wide module
 * navbar: simple mode never inherits the Advanced chrome. The header is
 * route-aware, so the active tab reflects which panel is open.
 *
 * The full module dashboard (Advanced) lives in the sibling `(full)` group with
 * its own chrome; the conversation home lives at the tree root. All three sit
 * under the thin `dashboard/layout.tsx` that owns auth + the AuthProvider.
 */
export default async function DashboardPanelsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("conversation.chat");
  const nav: ConversationNavLabels = {
    chat: t("navChat"),
    messages: t("navMessages"),
    calendar: t("navCalendar"),
    profile: t("navProfile"),
    advanced: t("advanced"),
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-900">
      <ConversationHeader title={t("headerTitle")} nav={nav} />
      {/* Same container + padding the full chrome used, so the panel pages
        render identically inside simple mode — only the surrounding navbar
        changes. Bottom clearance keeps CTAs off the fixed mobile bottom nav. */}
      <main className="relative z-10 mx-auto w-full max-w-container flex-1 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
        {children}
      </main>
      <ConversationBottomNav nav={nav} />
    </div>
  );
}
