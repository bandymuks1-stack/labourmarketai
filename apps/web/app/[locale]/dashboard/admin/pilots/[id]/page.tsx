import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import { getPilotDetail } from "@/lib/admin/pilots";
import {
  formatDurationMs,
  getTimeToValueSummary,
} from "@/lib/admin/pilot-metrics";
import {
  AddParticipantForm,
  PilotStatusForm,
  RecordOutcomeForm,
  RemoveParticipantButton,
} from "@/components/app/admin-pilots-forms";

/**
 * Pilot cohort detail — participants, status and the owner-recorded outcome
 * ledger (Pilot Onboarding and Measurement v1).
 *
 * Server-gated via requireSuperadmin (defense-in-depth under the admin
 * layout gate); reads are additionally admin-only via the pilots RLS
 * policies of the DRAFT-GATED migration 20260716140000_pilots_cohort_v1.
 * Honest degradation while the migration is unapplied.
 *
 * HONESTY: every outcome row is recorded BY AN ADMIN and labelled as such —
 * never presented as platform-verified. Time-to-value is GLOBAL, computed
 * from anonymous pilot_events sessions; cohort-scoped timing is impossible
 * without a session ↔ participant linkage that the privacy contract forbids,
 * and the page says so instead of pretending.
 *
 * Compact per PR #773 doctrine: identity + status first, actions next,
 * ledgers and metrics folded.
 */
export default async function AdminPilotDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  const t = await getTranslations("adminPilots");

  const data = await getPilotDetail(id);
  if (data.kind === "not_found") notFound();

  if (data.kind === "needs_migration") {
    return (
      <div className="flex flex-col gap-4" data-testid="admin-pilot-detail">
        <p
          className="rounded-md border border-dashed border-brand-blue/40 bg-brand-blue/5 p-4 text-sm text-text-secondary"
          data-testid="pilots-needs-migration"
        >
          {t("needsMigration")}
        </p>
        <Link
          href="/dashboard/admin/pilots"
          className="self-start text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("detail.back")}
        </Link>
      </div>
    );
  }

  if (data.kind === "error") {
    return (
      <div className="flex flex-col gap-4" data-testid="admin-pilot-detail">
        <p
          role="alert"
          className="card-border bg-state-danger/5 p-4 text-sm text-state-danger"
        >
          {t("loadError", { msg: data.message })}
        </p>
        <Link
          href="/dashboard/admin/pilots"
          className="self-start text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("detail.back")}
        </Link>
      </div>
    );
  }

  const pilot = data.pilot;
  const activeParticipants = pilot.participants.filter((p) => p.leftAt === null);
  const supabase = await createClient();
  const ttv = await getTimeToValueSummary(supabase);

  return (
    <div className="flex flex-col gap-6" data-testid="admin-pilot-detail">
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard/admin/pilots"
          className="self-start text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("detail.back")}
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {pilot.name}
        </h1>
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t(`kind.${pilot.organisationKind}`)} · {t(`status.${pilot.status}`)} ·{" "}
          {pilot.startsOn || pilot.endsOn
            ? `${pilot.startsOn ?? "…"} → ${pilot.endsOn ?? "…"}`
            : t("list.noDates")}
        </p>
      </header>

      <section className="card-border flex flex-col gap-2 p-4">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          {t("detail.statusTitle")}
        </h2>
        <PilotStatusForm pilotId={pilot.id} current={pilot.status} />
      </section>

      <section
        className="card-border flex flex-col gap-3 p-4"
        data-testid="pilot-participants"
      >
        <h2 className="font-display text-sm font-semibold text-text-primary">
          {t("participants.title")}
        </h2>
        {pilot.participants.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("participants.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-700/40">
            {pilot.participants.map((p) => (
              <li
                key={p.profileId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm text-text-primary">
                    {p.name}
                  </span>
                  <span className="font-mono text-meta text-text-muted">
                    {p.email ?? p.profileId} ·{" "}
                    {t(`participants.joinedVia.${p.joinedVia}`)} ·{" "}
                    {new Date(p.joinedAt).toLocaleDateString(locale)}
                  </span>
                </span>
                {p.leftAt === null ? (
                  <RemoveParticipantButton
                    pilotId={pilot.id}
                    profileId={p.profileId}
                  />
                ) : (
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("participants.left", {
                      date: new Date(p.leftAt).toLocaleDateString(locale),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <details open={pilot.participants.length === 0}>
          <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-text-primary">
            {t("participants.addTitle")}
          </summary>
          <div className="pt-2">
            <AddParticipantForm pilotId={pilot.id} />
          </div>
        </details>
      </section>

      <section
        className="card-border flex flex-col gap-3 p-4"
        data-testid="pilot-outcomes"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-sm font-semibold text-text-primary">
            {t("outcomes.title")}
          </h2>
          <p className="text-meta text-text-muted">{t("outcomes.honesty")}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {pilot.outcomeDistribution.map((d) => (
            <div
              key={d.outcome}
              className="rounded-md border border-ink-600/60 px-3 py-2"
            >
              <div className="font-mono text-lg text-text-primary">{d.count}</div>
              <div className="text-meta text-text-muted">
                {t(`outcomes.values.${d.outcome}`)}
              </div>
            </div>
          ))}
        </div>

        <RecordOutcomeForm
          pilotId={pilot.id}
          participants={activeParticipants.map((p) => ({
            profileId: p.profileId,
            name: p.name,
          }))}
        />

        <details data-testid="pilot-outcome-ledger">
          <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-text-primary">
            {t("outcomes.ledger")}
          </summary>
          {pilot.outcomes.length === 0 ? (
            <p className="pt-2 text-sm text-text-secondary">
              {t("outcomes.empty")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-700/40 pt-2">
              {pilot.outcomes.map((o) => (
                <li key={o.id} className="flex flex-col gap-0.5 py-2">
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-text-primary">
                      {t(`outcomes.values.${o.outcome}`)}
                    </span>
                    <span className="text-text-muted">
                      {o.participantName ?? t("outcomes.wholePilot")}
                    </span>
                    <span className="font-mono text-meta text-text-muted">
                      {new Date(o.createdAt).toLocaleString(locale)}
                    </span>
                  </span>
                  {o.note ? (
                    <span className="text-xs text-text-secondary">{o.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>

      <details
        className="card-border p-4"
        data-testid="pilot-time-to-value"
      >
        <summary className="cursor-pointer font-display text-sm font-semibold text-text-primary">
          {t("ttv.title")}
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          <p className="text-meta text-text-muted">{t("ttv.help")}</p>
          {/* Honest limitation: no session ↔ participant linkage exists, so
              timing below is GLOBAL — never presented as cohort-scoped. */}
          <p
            className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-meta text-text-secondary"
            data-testid="pilot-ttv-cohort-limitation"
          >
            {t("ttv.cohortLimitation")}
          </p>
          {!ttv.available ? (
            <p className="text-sm text-text-secondary">{t("ttv.unavailable")}</p>
          ) : ttv.sessionsReachedValue === 0 ? (
            <p className="text-sm text-text-secondary">{t("ttv.empty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-ink-600/60 px-3 py-2">
                <div className="font-mono text-lg text-text-primary">
                  {formatDurationMs(ttv.medianMs)}
                </div>
                <div className="text-meta text-text-muted">{t("ttv.median")}</div>
              </div>
              <div className="rounded-md border border-ink-600/60 px-3 py-2">
                <div className="font-mono text-lg text-text-primary">
                  {formatDurationMs(ttv.p75Ms)}
                </div>
                <div className="text-meta text-text-muted">{t("ttv.p75")}</div>
              </div>
              <div className="rounded-md border border-ink-600/60 px-3 py-2">
                <div className="font-mono text-lg text-text-primary">
                  {ttv.sessionsWithStart}
                </div>
                <div className="text-meta text-text-muted">
                  {t("ttv.sessionsWithStart")}
                </div>
              </div>
              <div className="rounded-md border border-ink-600/60 px-3 py-2">
                <div className="font-mono text-lg text-text-primary">
                  {ttv.sessionsReachedValue}
                </div>
                <div className="text-meta text-text-muted">
                  {t("ttv.sessionsReachedValue")}
                </div>
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
