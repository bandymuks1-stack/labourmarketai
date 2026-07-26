import { redirect } from "next/navigation";

/**
 * `/dashboard/assistant` is superseded by the conversation-first `/dashboard`
 * root. Kept as a redirect alias so any existing links / bookmarks resolve to
 * the canonical home — it is no longer a separate product surface.
 *
 * Merge note (main → this branch, 2026-07-25): #868 wired the canonical
 * marketplace matches into the OLD `ConversationShell` page that used to live
 * here. This branch replaced that page with the real chat window at
 * `/dashboard`, so the conversation's marketplace path moves there — see
 * `lib/conversation/find-work.ts` (canonical use case) and the shown-marker in
 * `components/app/conversation/chat/messages.tsx`. Exactly one conversation
 * marketplace path survives the merge.
 */
export default async function AssistantAliasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
