import { setRequestLocale, getTranslations } from "next-intl/server";
import { MessageSquare } from "lucide-react";

import { listMyBookings, type BookingRow } from "@/lib/booking/booking-actions";
import { openBookingConversationAction } from "@/lib/booking/booking-conversation";
import { BookingRespondButtons } from "@/components/app/booking-respond-buttons";
import { BookingWithdrawButton } from "@/components/app/booking-withdraw-button";
import { ProposeBookingButton } from "@/components/app/propose-booking-button";
import { MarkBookingsSeen } from "@/components/app/mark-bookings-seen";
import { Link } from "@/lib/i18n/navigation";
import {
  canProposeAgain,
  deriveBookingDisplayState,
  type BookingDisplayState,
  type BookingStatus,
} from "@/lib/booking/booking-state";
import { ActionCard } from "@/components/app/action-card";

/**
 * Bookings (Stage 6) — the worker's incoming proposals (accept/decline) and the
 * company's outgoing proposals. Honest by construction: a proposal is never a
 * confirmed engagement until the WORKER accepts; an overlapping accepted booking
 * is blocked server-side. Degrades to a calm "not available yet" note until the
 * owner applies the booking migration (no error surface, no fake data).
 */

const STATUS_TONE: Record<BookingStatus, string> = {
  proposed: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  accepted: "border-state-success/50 bg-state-success/10 text-state-success",
  declined: "border-ink-500 bg-ink-800/40 text-text-muted",
  withdrawn: "border-ink-500 bg-ink-800/40 text-text-muted",
  expired: "border-ink-500 bg-ink-800/40 text-text-muted",
};

// Derived DISPLAY states (PR 5): a `proposed` row is shown as awaiting or —
// after 14+ unanswered days — honestly stale ("no response yet"). The DB
// truth stays `proposed`; nothing here writes or fakes `expired`.
const DERIVED_TONE: Record<"awaiting_response" | "no_response_stale", string> = {
  awaiting_response: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  no_response_stale: "border-state-amber/40 bg-state-amber/10 text-state-amber",
};

function isDerivedProposedState(
  state: BookingDisplayState,
): state is "awaiting_response" | "no_response_stale" {
  return state === "awaiting_response" || state === "no_response_stale";
}

export default async function BookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("bookings");
  // The rebook form is the SAME propose form the scouting surface renders —
  // its field/submit labels are reused verbatim from `scouting.booking` (one
  // flow, one wording) instead of duplicating seven keys per locale.
  const tProposeForm = await getTranslations("scouting.booking");
  const result = await listMyBookings();
  // One consistent "now" for the whole render — the derived display states
  // (awaiting / stale) are computed against it, read-only.
  const nowIso = new Date().toISOString();

  return (
    <div className="flex flex-col gap-6" data-testid="bookings-page">
      {/* Opening this page IS the read event for booking responses — clears
          the "new responses" dashboard/bell markers (audit PR5). */}
      <MarkBookingsSeen />
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Planning hub connections (§8.3): a booking is one part of the plan —
          surface the real, existing surfaces it links to (Marketplace orders,
          Map, Diary) so this is the canonical planning surface, not an isolated
          list. Navigation only; each destination renders its own honest state. */}
      <PlanningConnections t={t} />

      {result.kind === "not-authed" ? (
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("notAuthed")}
        </p>
      ) : result.kind === "needs-migration" ? (
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="bookings-unavailable"
        >
          {t("unavailable")}
        </p>
      ) : (
        <>
          <Section
            title={t("incoming.title")}
            help={t("incoming.help")}
            empty={t("incoming.empty")}
            rows={result.incoming}
            t={t}
            direction="incoming"
            nowIso={nowIso}
            renderActions={(row) =>
              row.status === "proposed" ? (
                <BookingRespondButtons
                  locale={locale}
                  bookingId={row.id}
                  labels={{
                    accept: t("actions.accept"),
                    decline: t("actions.decline"),
                    accepted: t("actions.accepted"),
                    declined: t("actions.declined"),
                    conflict: t("actions.conflict"),
                    error: t("actions.error"),
                    unavailable: t("unavailable"),
                  }}
                />
              ) : row.status === "accepted" ? (
                // Accepted is a beginning, not a terminal status (lifecycle
                // v1): the worker's next step is the conversation with the
                // proposing company (grant re-verified server-side) plus the
                // planning agenda where the booked dates live.
                <div className="flex flex-wrap items-center gap-2">
                  <BookingMessageCta
                    bookingId={row.id}
                    locale={locale}
                    label={t("actions.message")}
                    testid="booking-incoming-message-cta"
                  />
                  <PlanningLink label={t("actions.planning")} />
                </div>
              ) : null
            }
          />
          <Section
            title={t("outgoing.title")}
            help={t("outgoing.help")}
            empty={t("outgoing.empty")}
            rows={result.outgoing}
            t={t}
            direction="outgoing"
            nowIso={nowIso}
            renderActions={(row) =>
              row.status === "proposed" ? (
                // The withdraw RPC existed with no UI — a proposer had no way
                // out of a wrong proposal (lifecycle v1).
                <BookingWithdrawButton
                  locale={locale}
                  bookingId={row.id}
                  labels={{
                    withdraw: t("actions.withdraw"),
                    withdrawn: t("status.withdrawn"),
                    error: t("actions.error"),
                    unavailable: t("unavailable"),
                  }}
                />
              ) : row.status === "accepted" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <BookingMessageCta
                    bookingId={row.id}
                    locale={locale}
                    label={t("actions.message")}
                    testid="booking-outgoing-message-cta"
                  />
                  <PlanningLink label={t("actions.planning")} />
                </div>
              ) : canProposeAgain(row.status) ? (
                // Terminal declined/withdrawn (repeat actions, PR 6b): the
                // company may RE-OPEN the same proposal with new dates — the
                // existing propose flow pre-scoped to the same request +
                // worker (the applied RPC upserts on that key). The worker
                // decides again; nothing is booked until they accept.
                <div className="flex flex-wrap items-center gap-2">
                  {row.requestId && row.workerId ? (
                    <ProposeBookingButton
                      locale={locale}
                      requestId={row.requestId}
                      workerId={row.workerId}
                      countryCode={row.locationCountry}
                      variant="rebook"
                      labels={{
                        open: t("actions.proposeAgain"),
                        startDate: tProposeForm("startDate"),
                        note: tProposeForm("note"),
                        send: tProposeForm("send"),
                        sending: tProposeForm("sending"),
                        sent: tProposeForm("sent"),
                        unavailable: tProposeForm("unavailable"),
                        notEntitled: tProposeForm("notEntitled"),
                        error: tProposeForm("error"),
                        cancel: tProposeForm("cancel"),
                      }}
                    />
                  ) : null}
                  {row.status === "declined" ? (
                    // A declined proposal ends THIS booking, not the company's
                    // search — the honest next action is finding another worker.
                    <Link
                      href="/dashboard/company/scouting"
                      data-testid="booking-declined-next-action"
                      className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700"
                    >
                      {t("actions.findAnother")}
                    </Link>
                  ) : null}
                </div>
              ) : null
            }
          />
        </>
      )}
    </div>
  );
}

/** Next step for an ACCEPTED booking — opens (or reopens) the company↔worker
 *  conversation. The granting fact (accepted + participant) is re-verified
 *  server-side by the action; the row exposes no counterpart profile id. */
function BookingMessageCta({
  bookingId,
  locale,
  label,
  testid,
}: {
  bookingId: string;
  locale: string;
  label: string;
  testid: string;
}) {
  return (
    <form action={openBookingConversationAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        data-testid={testid}
        className="inline-flex min-h-11 items-center gap-1 rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs text-brand-blue transition-colors hover:border-brand-blue"
      >
        <MessageSquare className="h-3 w-3" /> {label}
      </button>
    </form>
  );
}

/** Accepted booking → the planning agenda where its dates actually render
 *  (control room PR E). Navigation only — no fake calendar entry is created. */
function PlanningLink({ label }: { label: string }) {
  return (
    <Link
      href="/dashboard/planning"
      data-testid="booking-accepted-planning-link"
      className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700"
    >
      {label}
    </Link>
  );
}

/** Compact, mobile-first bridge to the surfaces a plan connects to. Reuses
 *  existing canonical routes — no duplicate planning page, no fake entries. */
function PlanningConnections({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const links = [
    {
      // Control room PR E: the unified planning agenda shows this booking
      // in date context together with project bands and task deadlines.
      key: "planning",
      href: "/dashboard/planning",
      label: t("connections.planning"),
      note: t("connections.planningNote"),
    },
    {
      key: "marketplace",
      href: "/dashboard/service-requests",
      label: t("connections.marketplace"),
      note: t("connections.marketplaceNote"),
    },
    {
      key: "map",
      href: "/dashboard/market-map",
      label: t("connections.map"),
      note: t("connections.mapNote"),
    },
    {
      key: "diary",
      href: "/dashboard/journal",
      label: t("connections.diary"),
      note: t("connections.diaryNote"),
    },
  ];
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="bookings-connections"
    >
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("connections.title")}
      </span>
      <p className="text-xs text-text-secondary">{t("connections.intro")}</p>
      {/* Shared ActionCard pattern (audit PR8). */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((l) => (
          <ActionCard
            key={l.key}
            href={l.href}
            testid={`bookings-connection-${l.key}`}
            title={l.label}
            description={l.note}
          />
        ))}
      </div>
    </section>
  );
}

function Section({
  title,
  help,
  empty,
  rows,
  t,
  direction,
  nowIso,
  renderActions,
}: {
  title: string;
  help: string;
  empty: string;
  rows: BookingRow[];
  t: Awaited<ReturnType<typeof getTranslations>>;
  /** incoming = the worker decides; outgoing = the company proposed. */
  direction: "incoming" | "outgoing";
  nowIso: string;
  renderActions: (row: BookingRow) => React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-secondary">{help}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            // Display-only derivation: `proposed` renders as awaiting or —
            // after 14+ unanswered days — honestly stale. Actions stay keyed
            // off the DB status (a stale proposal is still open to act on).
            const display = deriveBookingDisplayState(
              { status: row.status, createdAt: row.createdAt },
              nowIso,
            );
            return (
              <li
                key={row.id}
                className="card-border flex flex-wrap items-center justify-between gap-3 p-3"
                data-testid={`booking-${row.id}`}
                data-status={row.status}
                data-display-state={display}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  {/* WHAT: the proposed role; WHEN: start (+ expected end) and
                      country. WHO is the section itself (a company proposed to
                      you / a worker you proposed to — no identity leaks). */}
                  <span className="text-sm font-medium text-text-primary">
                    {row.roleText?.trim() ? row.roleText : t("noRole")}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {row.startDate ? t("startsOn", { date: row.startDate }) : t("noDate")}
                    {row.expectedEndDate
                      ? ` · ${t("endsOn", { date: row.expectedEndDate })}`
                      : ""}
                    {row.locationCountry ? ` · ${row.locationCountry}` : ""}
                  </span>
                  {row.note ? (
                    <span className="truncate text-xs text-text-muted">{row.note}</span>
                  ) : null}
                  {/* WHAT HAPPENS NEXT: one honest line per direction × state. */}
                  <span
                    className="text-xs text-text-muted"
                    data-testid="booking-next-step"
                  >
                    {t(`next.${direction}.${display}` as never)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${
                      isDerivedProposedState(display)
                        ? DERIVED_TONE[display]
                        : STATUS_TONE[row.status]
                    }`}
                    data-testid="booking-display-chip"
                  >
                    {isDerivedProposedState(display)
                      ? t(`displayState.${display}` as never)
                      : t(`status.${row.status}` as never)}
                  </span>
                  {renderActions(row)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
