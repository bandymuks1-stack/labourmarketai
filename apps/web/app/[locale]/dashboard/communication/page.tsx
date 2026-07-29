import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { Lock } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupportConversationLauncher } from "@/components/app/support-conversation-launcher";
import { AttentionInstructions } from "@/components/app/attention-instructions";
import { RefreshOnFocus } from "@/components/app/refresh-on-focus";
import { createClient } from "@/lib/supabase/server";
import { describeConversationCard } from "@/lib/communication/conversation-display";
import { readCounterpartIdentities } from "@/lib/communication/contact-permission";
import { readConversationSourceContexts } from "@/lib/communication/conversation-source";
import { getUnreadConversationIds } from "@/lib/communication/unread";
import { getConversationPreviews } from "@/lib/communication/inbox-preview";
import {
  deriveInboxPriority,
  sortByInboxPriority,
} from "@/lib/communication/inbox-priority";
import { ConversationQuickReply } from "@/components/app/conversation-quick-reply";
import { getPendingIncomingBookingCount } from "@/lib/booking/booking-actions";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export default async function CommunicationListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  // Honest failure surface for the "message worker / company" entry points:
  // when openDirectConversationAction cannot open a conversation it lands here
  // with ?notice=cannot_open so we can show a restricted state — never a silent
  // bounce, never a fake "sent".
  const { notice } = await searchParams;
  const showCannotOpen = notice === "cannot_open";
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
  const fetched: ConversationRow[] = (conversationsRaw ?? []) as ConversationRow[];

  // REAL unread state (audit PR5): a counterpart message newer than the
  // caller's last_read_at — shared with the nav badge and the bell, so the
  // list, badge and panel can never drift apart.
  const unreadIds = await getUnreadConversationIds();

  // Inbox contract: unread first, then latest activity. Both groups keep
  // the query's updated_at desc order (stable partition), so on mobile the
  // first unread thread is above the fold instead of buried by older-but-
  // recently-bumped read threads. Owner UX recovery v1: the two groups now
  // render as LABELLED sections (unread / earlier) so prioritisation is
  // visible structure, not just an invisible sort.
  const unreadConversations = fetched.filter((c) => unreadIds.has(c.id));
  const readConversations = fetched.filter((c) => !unreadIds.has(c.id));

  // Newest-message preview per thread (sender + first line) — WHAT is new,
  // visible without opening every thread.
  const previews = await getConversationPreviews(
    fetched.map((c) => c.id),
    user.id,
  );

  // §8.1 PRIORITY — derived from real thread state (who wrote last, is it
  // unread, how long has it waited). No priority column is invented: the
  // levels are statements the UI defends in words, and the sort puts the
  // longest-waiting question the counterpart asked first.
  const nowMs = Date.now();
  const priorityOf = (c: ConversationRow) => {
    const p = previews.get(c.id);
    return deriveInboxPriority(
      {
        unread: unreadIds.has(c.id),
        newestByViewer: p?.byViewer ?? false,
        newestAt: p?.createdAt ?? c.updated_at ?? null,
      },
      nowMs,
    );
  };
  const newestAtOf = (c: ConversationRow) =>
    previews.get(c.id)?.createdAt ?? c.updated_at ?? null;
  const conversations = [
    ...sortByInboxPriority(unreadConversations, priorityOf, newestAtOf),
    ...sortByInboxPriority(readConversations, priorityOf, newestAtOf),
  ];

  // §8.1 safe counterpart identity reader — display names for 2-person direct
  // threads the viewer participates in, via the permission-gated RPC only.
  // Empty map (→ honest restricted chips) until the owner applies the
  // migration or when no identity is permitted. Never a contact channel.
  const counterpartNames = await readCounterpartIdentities(
    conversations.map((c) => c.id),
  );

  // Conversation source relation v1 — typed source context (which booking /
  // service request / demand a thread came from), via the participant-scoped
  // reader RPC only. Empty map (→ exactly today's neutral labels) until the
  // owner applies the migration or when a thread carries no relation. The
  // raw source id never reaches this page.
  const sourceContexts = await readConversationSourceContexts(
    conversations.map((c) => c.id),
  );

  // Bookings / reservation requests are conversation/request objects → their
  // home is here under Žinutės. Surface them ONLY when there is a real pending
  // incoming count (> 0); 0 on any missing-data state, so no fake badge.
  const tBookings = await getTranslations("bookings");
  const pendingBookings = await getPendingIncomingBookingCount();

  // ONE card renderer for both sections (unread / earlier) — the card model,
  // honesty rules and testids are identical wherever a thread renders.
  const renderConversation = (c: ConversationRow) => {
    const unread = unreadIds.has(c.id);
    const priority = priorityOf(c);
    // Clarity v1: never render a card where the user cannot tell WHO /
    // WHAT / WHICH CONTEXT. Derived honestly from the real `kind`; when
    // identity/workspace are not in the data model we say so, not fake it.
    const card = describeConversationCard({
      kind: c.kind,
      createdBy: c.created_by,
      viewerId: user.id,
      counterpartName: counterpartNames.get(c.id) ?? null,
      // §8.2 demand context — the real subject column (for a direct
      // thread it is the demand title written by the gated scouting
      // action), so the scope line can honestly say which work
      // request the thread is about.
      subject: c.subject,
      // Source relation v1 — RPC-resolved typed source (or null →
      // the card renders exactly as before).
      sourceContext: sourceContexts.get(c.id) ?? null,
    });
    // Real title fallback — never a technical "(be temos)": the
    // permitted counterpart name, then the live source title (project /
    // order / request), then the support-team label, then a neutral
    // "Pokalbis". Only data that actually exists; nothing invented.
    const title =
      c.subject ??
      (card.counterpartyRestricted ? null : (card.counterpartyName ?? null)) ??
      card.sourceTitle ??
      (c.kind === "support" ? t("counterparty.support") : t("conversationFallback"));
    const preview = previews.get(c.id);
    return (
      <li
        key={c.id}
        className="card-border flex flex-col gap-0.5 px-3 py-2.5 transition-colors hover:border-brand-blue"
      >
        <Link
          href={`/dashboard/communication/${c.id}`}
          className="flex flex-col gap-0.5"
          data-testid={`conversation-row-${c.id}`}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {unread && (
                <span
                  className="shrink-0 rounded-full bg-brand-blue/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-label text-brand-blue"
                  data-testid={`conversation-unread-${c.id}`}
                >
                  {t("unread")}
                </span>
              )}
              {/* §8.1 PRIORITY — only the ACT-NOW state gets a badge; the
                  other levels are the absence of one (a chip on every row
                  would be noise, not prioritisation). The overdue variant
                  states the real elapsed wait in words. */}
              {priority.level === "awaiting_you" && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-label ${
                    priority.overdue
                      ? "bg-state-danger/15 text-state-danger"
                      : "bg-state-amber/15 text-state-amber"
                  }`}
                  data-testid={`conversation-priority-${c.id}`}
                  data-level={priority.overdue ? "overdue" : "awaiting"}
                  title={
                    priority.waitingHours !== null
                      ? t("priority.waiting", { hours: priority.waitingHours })
                      : undefined
                  }
                >
                  {priority.overdue
                    ? t("priority.overdue")
                    : t("priority.awaitingYou")}
                </span>
              )}
              <span className="truncate text-sm font-semibold text-text-primary">
                {title}
              </span>
            </span>
            <span
              className="shrink-0 font-mono text-[10px] uppercase tracking-label text-text-muted"
              data-testid={`conversation-type-${c.id}`}
            >
              {t(card.typeKey)}
            </span>
          </div>
          {/* Newest-message preview: who wrote it + the first line —
              WHAT is new without opening the thread. Attachment-only
              messages say so honestly. */}
          {preview && (
            <p
              className="truncate text-xs text-text-secondary"
              data-testid={`conversation-preview-${c.id}`}
            >
              <span className="text-text-muted">
                {preview.byViewer
                  ? t("byYou")
                  : (card.counterpartyRestricted
                      ? t("byOther")
                      : (card.counterpartyName ?? t("byOther")))}
                {": "}
              </span>
              {preview.text.length > 0
                ? preview.text
                : t("preview.attachmentOnly")}
            </p>
          )}
          {/* Who + which context + when — ONE compact meta row (owner UX
              recovery v1: the separate timestamp row folded in here). A
              restricted counterparty renders as a locked, system-limited
              chip (NOT a normal name and NOT a bland "unspecified
              recipient") so the user knows the details are simply not
              shown yet. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {card.counterpartyRestricted ? (
              <span
                className="inline-flex items-center gap-1 rounded border border-ink-600/60 bg-ink-800/40 px-1.5 py-0.5 text-text-muted"
                data-testid={`conversation-counterparty-${c.id}`}
                data-restricted="true"
              >
                <Lock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                {t(card.counterpartyKey)}
              </span>
            ) : (
              <span
                className="text-text-secondary"
                data-testid={`conversation-counterparty-${c.id}`}
              >
                {/* Permitted real name (safe reader) or the honest
                    i18n label (e.g. support team) — never invented. */}
                {card.counterpartyName ?? t(card.counterpartyKey)}
              </span>
            )}
            <span aria-hidden className="text-text-muted">
              ·
            </span>
            <span
              className={
                card.scopeKnown
                  ? "text-text-secondary"
                  : "italic text-text-muted"
              }
              data-testid={`conversation-scope-${c.id}`}
              data-demand-context={card.demandContext ? "true" : undefined}
            >
              {t(card.scopeKey)}
            </span>
            {/* Honest origin: derived only from created_by vs the
                viewer — "did I start this, or did someone reach out to
                me?". Rendered only when created_by is known. */}
            {card.originKey && (
              <>
                <span aria-hidden className="text-text-muted">
                  ·
                </span>
                <span
                  className="text-text-secondary"
                  data-testid={`conversation-origin-${c.id}`}
                >
                  {t(card.originKey)}
                </span>
              </>
            )}
            <span aria-hidden className="text-text-muted">
              ·
            </span>
            <span className="text-text-muted">
              {new Date(c.updated_at).toLocaleString(locale)}
            </span>
          </div>
        </Link>
        {/* §8.1 QUICK REPLY — answer without opening the thread. A SIBLING
            of the card link (nested interactive elements are invalid), and
            offered only where a reply is what the situation calls for: the
            counterpart wrote last and it is unread. It calls the ONE
            canonical sendMessage action — no second messaging path. */}
        {priority.level === "awaiting_you" ? (
          <div className="pt-1">
            <ConversationQuickReply conversationId={c.id} locale={locale} />
          </div>
        ) : null}
        {/* Source relation v1 — typed source line, rendered ONLY when
            the participant-scoped RPC resolved a live source row
            (never guessed from the subject). A SIBLING of the card
            link (nested anchors are invalid HTML). With a route for
            this viewer it is a real link-back; without one it is a
            plain label — no dead ends, no fake state. */}
        {card.sourceKey && (
          <div className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
            {card.sourceHref ? (
              <Link
                href={card.sourceHref as "/dashboard"}
                className="text-brand-blue hover:underline"
                data-testid={`conversation-source-${c.id}`}
                data-source-linked="true"
              >
                {t(card.sourceKey)}: {card.sourceTitle}
              </Link>
            ) : (
              <span
                className="text-text-secondary"
                data-testid={`conversation-source-${c.id}`}
              >
                {t(card.sourceKey)}: {card.sourceTitle}
              </span>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* Honest restricted state when a "message" entry point could not open a
          conversation (no permission / target gone / RLS-blocked). A locked,
          system-limited treatment — and it explicitly says nothing was sent, so
          the user never mistakes a failed open for a delivered message. */}
      {showCannotOpen && (
        <div
          role="status"
          data-testid="communication-cannot-open"
          className="flex items-start gap-2 rounded-md border border-ink-600/60 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        >
          <Lock
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted"
            strokeWidth={2}
            aria-hidden
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-text-primary">
              {t("cannotOpen.title")}
            </span>
            <span className="text-text-muted">{t("cannotOpen.body")}</span>
          </span>
        </div>
      )}

      {/* Real server-state refresh on focus + gentle interval — returning to
          this tab reflects new messages and cleared unread without a manual
          reload. No simulated realtime. */}
      <RefreshOnFocus />

      {/* "Reikia jūsų dėmesio" — real new work instructions surfaced here so an
          urgent instruction is not hidden on a separate page. Renders nothing
          when there is nothing to attend to (honest, no fake urgency). */}
      <AttentionInstructions />

      {/* Booking proposals live here (request/communication objects). Shown only
          when there is a REAL pending incoming count — never a fake badge. */}
      {pendingBookings > 0 && (
        <Link
          href={"/dashboard/bookings" as "/dashboard"}
          data-testid="communication-bookings-link"
          className="flex items-center justify-between gap-3 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-2 text-sm text-text-primary hover:border-brand-blue"
        >
          <span className="flex flex-col">
            <span className="font-medium">{tBookings("pendingLink")}</span>
            <span className="text-[11px] text-text-muted">{tBookings("pendingNote")}</span>
          </span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1.5 text-[11px] font-bold text-white">
            {pendingBookings}
          </span>
        </Link>
      )}

      {conversations.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Unread first, as a labelled section — what needs attention is
              visible structure, not just sort order. */}
          {unreadConversations.length > 0 && (
            <section
              className="flex flex-col gap-2"
              data-testid="communication-unread-section"
            >
              <h2 className="flex items-baseline gap-2 font-display text-sm font-semibold text-text-primary">
                {t("sections.unread")}
                <span className="font-mono text-xs font-normal text-text-muted tabular-nums">
                  {unreadConversations.length}
                </span>
              </h2>
              <ul className="flex flex-col gap-2">
                {unreadConversations.map(renderConversation)}
              </ul>
            </section>
          )}
          {readConversations.length > 0 && (
            <section
              className="flex flex-col gap-2"
              data-testid="communication-read-section"
            >
              {unreadConversations.length > 0 && (
                <h2 className="font-display text-sm font-semibold text-text-secondary">
                  {t("sections.earlier")}
                </h2>
              )}
              <ul className="flex flex-col gap-2">
                {readConversations.map(renderConversation)}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Support entry — secondary by design: real conversations own the top
          of this page; help lives below the list, still one tap away. */}
      <SupportConversationLauncher locale={locale} />

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
