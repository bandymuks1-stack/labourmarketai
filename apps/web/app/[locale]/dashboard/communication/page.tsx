import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { Lock } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupportConversationLauncher } from "@/components/app/support-conversation-launcher";
import { AttentionInstructions } from "@/components/app/attention-instructions";
import { FeatureNote } from "@/components/app/feature-note";
import { createClient } from "@/lib/supabase/server";
import { describeConversationCard } from "@/lib/communication/conversation-display";
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

  // Bookings / reservation requests are conversation/request objects → their
  // home is here under Žinutės. Surface them ONLY when there is a real pending
  // incoming count (> 0); 0 on any missing-data state, so no fake badge.
  const tBookings = await getTranslations("bookings");
  const pendingBookings = await getPendingIncomingBookingCount();

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

      <FeatureNote testId="feature-note-communication">
        {(await getTranslations("featureNotes"))("communicationInbox")}
      </FeatureNote>
      <FeatureNote testId="feature-note-feedback-loop">
        {(await getTranslations("featureNotes"))("feedbackLoop")}
      </FeatureNote>

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

      {/* Honest framing — messages are poll-on-page, not real-time. Calm muted
          note (not an alert), so it reads as reassurance, not a warning. */}
      <p className="text-xs leading-relaxed text-text-muted" data-testid="communication-honest-note">
        {t("v1Notice")}
      </p>

      {/* v2 launcher — open a new support thread. */}
      <SupportConversationLauncher locale={locale} />

      {conversations.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => {
            const lastRead = lastReadByConv.get(c.id);
            const unread = !lastRead;
            // Clarity v1: never render a card where the user cannot tell WHO /
            // WHAT / WHICH CONTEXT. Derived honestly from the real `kind`; when
            // identity/workspace are not in the data model we say so, not fake it.
            const card = describeConversationCard({
              kind: c.kind,
              createdBy: c.created_by,
              viewerId: user.id,
            });
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
                    <span
                      className="shrink-0 font-mono text-[10px] uppercase tracking-label text-text-muted"
                      data-testid={`conversation-type-${c.id}`}
                    >
                      {t(card.typeKey)}
                    </span>
                  </div>
                  {/* Who + which context. A restricted counterparty renders as a
                      locked, system-limited chip (NOT a normal name and NOT a
                      bland "unspecified recipient") so the user knows the
                      details are simply not shown yet. */}
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
                        {t(card.counterpartyKey)}
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
