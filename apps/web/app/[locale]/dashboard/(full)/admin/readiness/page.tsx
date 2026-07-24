import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { getAdminReadinessOverview } from "@/lib/admin/readiness-overview";
import { AdminDocVerifyButtons } from "@/components/app/admin-doc-verify-buttons";

/**
 * Admin readiness control center (Stage 9) — the payment-readiness blockers in
 * one place: country rules needing legal review, the document verification
 * queue, companies needing legal/billing attention, booking activity, and the
 * payment-not-enabled status. Read-mostly + audited verify/reject actions.
 * Every live section degrades honestly until the PR2 migrations are applied.
 */
export default async function AdminReadinessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("adminReadiness");
  const o = await getAdminReadinessOverview();

  return (
    <div className="flex flex-col gap-6" data-testid="admin-readiness">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Blocker summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label={t("tiles.countryReview")} value={o.countryReview.length} />
        <Tile
          label={t("tiles.pendingDocs")}
          value={o.pendingDocsAvailable ? o.pendingDocs.length : "—"}
        />
        <Tile label={t("tiles.docsAttention")} value={o.docsAttentionCount} />
        <Tile label={t("tiles.companies")} value={o.companiesNeedingAttention} />
        <Tile
          label={t("tiles.payments")}
          value={o.paymentsEnabled ? t("on") : t("off")}
        />
      </div>

      {/* Document verification queue */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("docQueue.title")}
        </h2>
        {!o.pendingDocsAvailable ? (
          <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary">
            {t("docQueue.unavailable")}
          </p>
        ) : o.pendingDocs.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
            {t("docQueue.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {o.pendingDocs.map((d) => (
              <li
                key={d.id}
                className="card-border flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <span className="text-sm text-text-primary">
                  {d.documentTypeSlug}
                  {d.country ? ` · ${d.country}` : ""}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {d.workerId.slice(0, 8)}
                  </span>
                </span>
                <AdminDocVerifyButtons
                  locale={locale}
                  documentId={d.id}
                  labels={{
                    verify: t("docQueue.verify"),
                    reject: t("docQueue.reject"),
                    done: t("docQueue.done"),
                    unavailable: t("docQueue.unavailable"),
                    error: t("docQueue.error"),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Country rules needing review */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("countryReview.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("countryReview.help")}</p>
        <ul className="flex flex-col gap-2">
          {o.countryReview.map((r) => (
            <li
              key={`${r.country}-${r.scope}-${r.requirementKey}`}
              className="card-border flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <span className="text-sm text-text-primary">
                <span className="font-mono text-xs text-brand-blue">{r.country}</span> ·{" "}
                {r.scope} · {r.requirementKey}
              </span>
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] uppercase tracking-label text-brand-blue underline"
              >
                {t("countryReview.source")}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Booking activity */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("bookings.title")}
        </h2>
        {!o.bookingsAvailable ? (
          <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary">
            {t("bookings.unavailable")}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            {Object.entries(o.bookingsByStatus)
              .map(([s, n]) => `${s}: ${n}`)
              .join(" · ") || t("bookings.empty")}
          </p>
        )}
      </section>

      {/* Payment readiness */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("payment.title")}
        </h2>
        <p className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-sm text-text-secondary">
          {t("payment.body", { count: o.paidPlanCount })}
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card-border flex flex-col gap-1 p-3">
      <span className="font-display text-2xl font-bold text-text-primary">{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
    </div>
  );
}
