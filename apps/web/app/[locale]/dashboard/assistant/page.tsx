import { redirect } from "next/navigation";

/**
 * `/dashboard/assistant` is superseded by the conversation-first `/dashboard`
 * root. Kept as a redirect alias so any existing links / bookmarks resolve to
 * the canonical home — it is no longer a separate product surface.
 */
export default async function AssistantAliasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
