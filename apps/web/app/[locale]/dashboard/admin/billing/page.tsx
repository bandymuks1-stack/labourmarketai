import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { getAdminBillingOverview } from "@/lib/admin/billing-overview";
import { PRE_PAYMENT_PLANS } from "@/lib/billing/plans";
import {
  BILLING_READINESS_ITEMS,
  PRICING_READINESS_STATE,
  summarizeEntitlementCoverage,
  type BillingReadinessStatus,
} from "@/lib/billing/readiness";
import { AdminPilotGrantForm } from "@/components/app/admin-pilot-grant-form";
import { BillingTestCheckout } from "@/components/marketing/billing-test-checkout";
import { AdminLmcPanel } from "@/components/app/admin-lmc-panel";

/**
 * Admin billing center (Stripe sprint PR6). Shows the billing config state
 * (test/disabled/live-blocked), subscriptions, webhook events, the entitlement
 * source, manual pilot override, and the live-readiness blockers. Payments are
 * ALWAYS labelled test/disabled — never a live or fake-revenue claim. The admin
 * cannot enable live from here (config is env-only; live is hard-blocked).
 */
export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("adminBilling");
  const o = await getAdminBillingOverview();
  const coverage = summarizeEntitlementCoverage();
  const paidPlanKeys = PRE_PAYMENT_PLANS.filter(
    (p) => p.accessState === "payment_not_enabled",
  ).map((p) => p.slug);

  const stateTone =
    o.configState === "stripe_test"
      ? "border-state-success/50 bg-state-success/10 text-state-success"
      : o.configState === "stripe_live_blocked"
        ? "border-state-danger/50 bg-state-danger/10 text-state-danger"
        : "border-ink-500 bg-ink-800/40 text-text-muted";

  return (
    <div className="flex flex-col gap-6" data-testid="admin-billing">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Always-on test/disabled banner — never a live claim. */}
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${stateTone}`}>
        <span className="font-mono text-[11px] uppercase tracking-label">
          {t(`state.${o.configState}` as never)}
        </span>
        <span className="text-[11px] text-text-secondary">
          {o.testMode ? t("testModeOn") : t("testModeOff")} · {t("liveNever")}
        </span>
      </div>

      {/* Config detail */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t("tiles.payments")} value={o.paymentsEnabled ? t("on") : t("off")} />
        <Tile label={t("tiles.testSecret")} value={o.hasTestSecret ? "✓" : "—"} />
        <Tile label={t("tiles.webhookSecret")} value={o.hasWebhookSecret ? "✓" : "—"} />
        <Tile label={t("tiles.lastPayment")} value={o.lastPaymentStatus ?? "—"} />
      </section>

      {/* Blockers to live */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("blockers.title")}</h2>
        {o.blockers.length === 0 ? (
          <p className="text-sm text-state-success">{t("blockers.none")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {o.blockers.map((b) => (
              <li key={b} className="rounded-md border border-state-warning/40 px-2 py-0.5 text-[11px] text-state-warning">
                {b}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Billing readiness (Branch 29 closure — no provider). Claim-ledger
          style: every claim cites a proof artifact whose existence is
          CI-guarded by lib/guards/billing-readiness.test.ts. */}
      <section className="flex flex-col gap-3" data-testid="billing-readiness">
        <header className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("readiness.title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("readiness.intro")}
          </p>
        </header>

        {/* Owner-editable pricing readiness state */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("readiness.pricingState")}
          </span>
          <span className="rounded-sm border border-state-amber/40 bg-state-amber/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-amber">
            {t(`readiness.state.${PRICING_READINESS_STATE}` as never)}
          </span>
        </div>

        {/* Entitlement coverage — deterministic from the guarded registry */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={t("readiness.coverage.server_gate")} value={String(coverage.serverGated)} />
          <Tile label={t("readiness.coverage.admin_rbac")} value={String(coverage.adminRbac)} />
          <Tile label={t("readiness.coverage.free_surface")} value={String(coverage.freeSurface)} />
          <Tile label={t("readiness.coverage.declared_only")} value={String(coverage.declaredOnly)} />
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("readiness.coverage.note")}
        </p>

        {/* Claim ledger */}
        <ul className="flex flex-col gap-1.5">
          {BILLING_READINESS_ITEMS.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
              data-readiness-item={item.key}
              data-readiness-status={item.status}
            >
              <span
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${READINESS_TONE[item.status]}`}
              >
                {t(`readiness.status.${item.status}` as never)}
              </span>
              <span className="text-sm text-text-primary">
                {t(`readiness.items.${item.key}` as never)}
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                · {t("readiness.proofLabel")}: {item.proof}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Subscriptions */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("subs.title")}</h2>
        {!o.tablesAvailable ? (
          <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary">
            {t("subs.unavailable")}
          </p>
        ) : o.subscriptions.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">{t("subs.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {o.subscriptions.map((s, i) => (
              <li key={`${s.ownerId}-${s.planKey}-${i}`} className="card-border flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="text-sm text-text-primary">
                  <span className="font-mono text-xs text-text-muted">{s.ownerId.slice(0, 8)}</span> · {s.planKey}
                  {s.isManualOverride ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-brand-blue">{t("subs.manual")}</span>
                  ) : null}
                  {s.testMode ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-state-amber">test</span>
                  ) : null}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
                  {s.status}{s.cancelAtPeriodEnd ? " · cancel@end" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stripe TEST checkout — moved here from the public /pricing page
          (launch repair Scope C): test checkout is internal-only, behind
          requireSuperadmin. Renders nothing unless billing config is a valid
          Stripe TEST setup. */}
      <BillingTestCheckout />

      {/* Manual pilot override */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("override.title")}</h2>
        <p className="text-xs text-text-secondary">{t("override.help")}</p>
        <AdminPilotGrantForm
          locale={locale}
          paidPlanKeys={paidPlanKeys}
          labels={{
            ownerId: t("override.ownerId"),
            plan: t("override.plan"),
            grant: t("override.grant"),
            revoke: t("override.revoke"),
            granting: t("override.granting"),
            done: t("override.done"),
            error: t("override.error"),
          }}
        />
      </section>

      {/* LMC ledger — live kill-switch state, outstanding credit liability and
          the credit-a-tester path (the ledger had no application surface at
          all until the commercial readiness audit). */}
      <AdminLmcPanel locale={locale} />

      {/* Webhook events */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("events.title")}</h2>
        {o.webhookEvents.length === 0 ? (
          <p className="text-sm text-text-muted">{t("events.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {o.webhookEvents.map((e, i) => (
              <li key={i} className="font-mono text-[11px] text-text-secondary">
                {e.eventType} · {e.processed ? "processed" : "pending"} · {e.testMode ? "test" : "live?"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const READINESS_TONE: Record<BillingReadinessStatus, string> = {
  ready: "border-state-success/40 bg-state-success/10 text-state-success",
  prepared: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  blocked_by_design: "border-state-amber/40 bg-state-amber/10 text-state-amber",
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-border flex flex-col gap-1 p-3">
      <span className="font-display text-xl font-bold text-text-primary">{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{label}</span>
    </div>
  );
}
