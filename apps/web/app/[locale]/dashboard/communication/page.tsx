import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Communication v1 — thread list page.
 *
 * Visible only to authenticated users (the /dashboard tree is gated by
 * the dashboard layout). RLS scopes the visible rows: a user sees only
 * conversations they participate in, plus ones they created.
 *
 * v1 is read-only at this level (no "start new conversation" composer
 * in the UI yet — the action exists but the launcher will land in a
 * follow-up). The page intentionally shows an honest empty state when
 * no conversations exist.
 */
type ConversationRow = {
  id: string;
  subject: string | null;
  kind: "direct" | "support" | "team";
  created_by: string | null;
  updated_at: string;
};

type ParticipantRow = {
  conversation_id: string;
  last_read_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export default async function CommunicationListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("communication");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/communication`);

  const { data: conversationsRaw } = await asAny(supabase)
    .from("conversations")
    .select("id, subject, kind, created_by, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  const conversations: ConversationRow[] = (conversationsRaw ?? []) as ConversationRow[];

  // Compute unread state by comparing each conversation's latest message
  // created_at to the participant's last_read_at. v1 keeps this simple —
  // we just label a row "unread" if the participant has never opened it.
  const { data: participantsRaw } = await asAny(supabase)
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("profile_id", user.id);
  const participants: ParticipantRow[] = (participantsRaw ?? []) as ParticipantRow[];
  const lastReadByConv = new Map<string, string | null>(
    participants.map((p) => [p.conversation_id, p.last_read_at]),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* v1 honest framing — communication is poll-on-page, not real-time. */}
      <p className="card-border bg-state-warning/5 p-3 text-xs leading-relaxed text-text-secondary">
        {t("v1Notice")}
      </p>

      {conversations.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => {
            const lastRead = lastReadByConv.get(c.id);
            const unread = !lastRead;
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/communication/${c.id}`}
                  className="card-border flex flex-col gap-1 p-4 transition-colors hover:border-brand-blue"
                  data-testid={`conversation-row-${c.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-text-primary">
                      {c.subject ?? t("unnamedThread")}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {t(`kind.${c.kind}`)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                    <span>{new Date(c.updated_at).toLocaleString(locale)}</span>
                    {unread && (
                      <span
                        className="font-mono text-[10px] uppercase tracking-label text-brand-blue"
                        data-testid={`conversation-unread-${c.id}`}
                      >
                        {t("unread")}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
