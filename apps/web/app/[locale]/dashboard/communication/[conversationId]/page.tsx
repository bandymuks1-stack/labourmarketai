import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { Lock } from "lucide-react";
import { AdminJoinConversation } from "@/components/app/admin-join-conversation";
import { CommunicationComposer } from "@/components/app/communication-composer";
import { MarkReadOnMount } from "@/components/app/mark-read-on-mount";
import { RefreshOnFocus } from "@/components/app/refresh-on-focus";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { createClient } from "@/lib/supabase/server";
import { resolveViewerText } from "@/lib/communication/translation";
import { describeConversationCard } from "@/lib/communication/conversation-display";
import { readCounterpartIdentities } from "@/lib/communication/contact-permission";
import { readConversationSourceContexts } from "@/lib/communication/conversation-source";
import {
  listConversationAttachments,
  type ConversationMessageAttachment,
} from "@/lib/communication/attachments";
import { isImageAttachmentMime } from "@/lib/communication/attachment-model";

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

  // Same honest context model as the list — so the thread header tells the
  // user WHO (permitted real name via the §8.1 safe identity reader, or the
  // honest restricted state), WHAT type, and whether THEY started it. The
  // identity comes ONLY from the permission-gated RPC — no direct
  // co-participant profile read, no invented identity, no contact channel.
  const counterpartNames = await readCounterpartIdentities([conversationId]);
  // Conversation source relation v1 — typed source context via the
  // participant-scoped reader RPC only. Empty map (→ exactly today's neutral
  // header) until the owner applies the migration or when the thread carries
  // no relation. The raw source id never reaches this page.
  const sourceContexts = await readConversationSourceContexts([conversationId]);
  const card = describeConversationCard({
    kind: conversation.kind,
    createdBy: conversation.created_by,
    viewerId: user.id,
    counterpartName: counterpartNames.get(conversationId) ?? null,
    // §8.2 demand context — the real subject column (for a direct thread it
    // is the demand title written by the gated scouting action).
    subject: conversation.subject,
    // Source relation v1 — RPC-resolved typed source (or null → the header
    // renders exactly as before).
    sourceContext: sourceContexts.get(conversationId) ?? null,
  });

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

  // Message attachments (user-journey repair v1) — participant-scoped
  // metadata + short-lived signed URLs from the PRIVATE bucket. Degrades to
  // an empty map while the owner-gated migration 20260712130000 is not
  // applied, so the thread renders exactly as before.
  const attachmentsRead = await listConversationAttachments(conversationId);
  const attachmentsByMessage =
    attachmentsRead.status === "ok"
      ? attachmentsRead.byMessage
      : new Map<string, ConversationMessageAttachment[]>();

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
            {/* Real title fallback — never "(be temos)": subject, then the
                permitted counterpart name, then the live source title, then
                the support label / a neutral "Pokalbis". */}
            {conversation.subject ??
              (card.counterpartyRestricted ? null : (card.counterpartyName ?? null)) ??
              card.sourceTitle ??
              (conversation.kind === "support"
                ? t("counterparty.support")
                : t("conversationFallback"))}
          </h1>
          <span
            className="font-mono text-[10px] uppercase tracking-label text-text-muted"
            data-testid="thread-type"
          >
            {t(card.typeKey)}
          </span>
          {/* Who + which context — a restricted counterparty renders as a
              locked, system-limited chip (NOT a normal name, NOT a bland
              "unspecified recipient"): the details are simply not shown yet. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {card.counterpartyRestricted ? (
              <span
                className="inline-flex items-center gap-1 rounded border border-ink-600/60 bg-ink-800/40 px-1.5 py-0.5 text-text-muted"
                data-testid="thread-counterparty"
                data-restricted="true"
              >
                <Lock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                {t(card.counterpartyKey)}
              </span>
            ) : (
              <span
                className="text-text-secondary"
                data-testid="thread-counterparty"
              >
                {/* Permitted real name (safe reader) or the honest i18n
                    label (e.g. support team) — never invented. */}
                {card.counterpartyName ?? t(card.counterpartyKey)}
              </span>
            )}
            <span aria-hidden className="text-text-muted">
              ·
            </span>
            <span
              className={
                card.scopeKnown ? "text-text-secondary" : "italic text-text-muted"
              }
              data-testid="thread-scope"
              data-demand-context={card.demandContext ? "true" : undefined}
            >
              {t(card.scopeKey)}
            </span>
            {card.originKey && (
              <>
                <span aria-hidden className="text-text-muted">
                  ·
                </span>
                <span className="text-text-secondary" data-testid="thread-origin">
                  {t(card.originKey)}
                </span>
              </>
            )}
          </div>
          {/* Source relation v1 — typed source line, rendered ONLY when the
              participant-scoped RPC resolved a live source row (never guessed
              from the subject). With a route for this viewer it is a real
              link-back; without one it is a plain label — no dead ends. */}
          {card.sourceKey && (
            <div className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
              {card.sourceHref ? (
                <Link
                  href={card.sourceHref as "/dashboard"}
                  className="text-brand-blue hover:underline"
                  data-testid="thread-source"
                  data-source-linked="true"
                >
                  {t(card.sourceKey)}: {card.sourceTitle}
                </Link>
              ) : (
                <span className="text-text-secondary" data-testid="thread-source">
                  {t(card.sourceKey)}: {card.sourceTitle}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* MarkReadOnMount stamps the participant's last_read_at when the
          page first mounts — honest "I opened this thread" signal, not a
          fake "delivered" indicator. */}
      <MarkReadOnMount conversationId={conversationId} locale={locale} />

      {/* New replies appear when the tab regains focus / on a gentle
          interval — no manual reload needed, no simulated realtime. */}
      <RefreshOnFocus />

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
                      {vt.text.length > 0 ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                          {vt.text}
                        </p>
                      ) : null}
                    </>
                  );
                })()}
                {(() => {
                  const atts = attachmentsByMessage.get(m.id) ?? [];
                  if (atts.length === 0) return null;
                  return (
                    <ul
                      className="mt-1 flex flex-wrap gap-2"
                      data-testid={`message-attachments-${m.id}`}
                    >
                      {atts.map((a) =>
                        a.signedUrl && isImageAttachmentMime(a.mimeType) ? (
                          <li key={a.id}>
                            {/* Image opens full-size in a new tab via the same
                                short-lived signed URL — no public URL exists. */}
                            <a
                              href={a.signedUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={a.signedUrl}
                                alt={a.fileName}
                                loading="lazy"
                                className="max-h-48 max-w-full rounded-md border border-ink-600 object-contain"
                              />
                            </a>
                          </li>
                        ) : (
                          <li key={a.id}>
                            {a.signedUrl ? (
                              <a
                                href={a.signedUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-xs font-medium text-brand-blue transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                              >
                                {a.fileName}
                                <span className="text-[10px] text-text-muted">
                                  ({Math.max(1, Math.round(a.fileSizeBytes / 1024))} KB)
                                </span>
                              </a>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-ink-600 px-3 py-2 text-xs text-text-muted">
                                {t("attachmentUnavailable")}
                              </span>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
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
