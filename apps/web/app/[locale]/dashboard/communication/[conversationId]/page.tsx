import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { AdminJoinConversation } from "@/components/app/admin-join-conversation";
import { CommunicationComposer } from "@/components/app/communication-composer";
import { MarkReadOnMount } from "@/components/app/mark-read-on-mount";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { createClient } from "@/lib/supabase/server";
import { resolveViewerText } from "@/lib/communication/translation";

type MessageRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("communication");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(
      `/${locale}/auth/login?next=/${locale}/dashboard/communication/${conversationId}`,
    );

  // RLS scopes both reads — a non-participant sees zero rows / zero
  // messages, which we treat as 404.
  const convRes = await asAny(supabase)
    .from("conversations")
    .select("id, subject, kind, created_by, updated_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convRes.data) notFound();
  const conversation = convRes.data;

  // Table is `conversation_messages`, NOT `messages` — see 0021's header
  // for why (legacy public.messages chain pre-exists in prod).
  const messagesRes = await asAny(supabase)
    .from("conversation_messages")
    // select("*") instead of an explicit column list so the optional
    // original_language column (DRAFT migration 20260610190000) is picked up
    // automatically once applied, with no error while it is absent.
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  const messages: MessageRow[] = (messagesRes.data ?? []) as MessageRow[];

  // v2 — surface the admin-only "Join thread" affordance when the
  // viewer is admin but not yet a participant. Admins arriving from
  // /admin/support need a one-click way to become a participant so
  // sendMessage stops being RLS-blocked.
  const [{ data: profile }, { data: rolesRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("active_role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
  ]);
  const viewerIsAdmin = deriveIsAdmin({
    activeRole: profile?.active_role ?? null,
    profileRoles: rolesRows ?? [],
  });
  const { data: viewerParticipantRow } = await asAny(supabase)
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id)
    .maybeSingle();
  const viewerIsParticipant = !!viewerParticipantRow;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard/communication"
            className="font-mono text-[10px] uppercase tracking-label text-text-secondary hover:text-brand-blue"
          >
            ← {t("backToList")}
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
            {conversation.subject ?? t("unnamedThread")}
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t(`kind.${conversation.kind}`)}
          </span>
        </div>
      </header>

      {/* MarkReadOnMount stamps the participant's last_read_at when the
          page first mounts — honest "I opened this thread" signal, not a
          fake "delivered" indicator. */}
      <MarkReadOnMount conversationId={conversationId} locale={locale} />

      <AdminJoinConversation
        conversationId={conversationId}
        locale={locale}
        isAdmin={viewerIsAdmin}
        isParticipant={viewerIsParticipant}
      />

      {messages.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("noMessages")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((m) => {
            const isMine = m.author_id === user.id;
            return (
              <li
                key={m.id}
                data-testid={`message-${m.id}`}
                className={`card-border flex flex-col gap-1 p-3 ${
                  isMine ? "border-brand-blue/40 bg-brand-blue/5" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {isMine ? t("byYou") : t("byOther")}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted">
                    {new Date(m.created_at).toLocaleString(locale)}
                  </span>
                </div>
                {(() => {
                  // §2 stub: ALWAYS the original text (never fake-translated);
                  // a language badge appears when the author's language is
                  // known and differs from the viewer's locale.
                  const vt = resolveViewerText({
                    body: m.body,
                    originalLanguage:
                      (m as { original_language?: string | null })
                        .original_language ?? null,
                    viewerLocale: locale,
                  });
                  return (
                    <>
                      {vt.languageBadge ? (
                        <span
                          className="self-start rounded-sm border border-ink-500 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-text-muted"
                          data-testid={`message-lang-${m.id}`}
                        >
                          {t("originalLanguage", { lang: vt.languageBadge.toUpperCase() })}
                        </span>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                        {vt.text}
                      </p>
                    </>
                  );
                })()}
              </li>
            );
          })}
        </ol>
      )}

      <CommunicationComposer
        conversationId={conversationId}
        locale={locale}
      />
    </div>
  );
}
