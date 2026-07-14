import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { getIntelligenceObservations } from "@/lib/intelligence/intelligence-read";
import {
  INSPECTOR_MAX_ROWS,
  isInspectorEnabled,
  toInspectorRows,
  type ObservationInspectorRowV1,
} from "@/lib/intelligence/observation-inspector-model";
import { ObservationInspector } from "@/components/intelligence/observation-inspector";
import {
  ActivationChecklist,
  SourceHealthBadge,
} from "@/components/intelligence/activation-checklist";
import { SourceStatusBadge } from "@/components/intelligence/source-status-badge";
import { INTELLIGENCE_SOURCE_PROFILES } from "@/lib/intelligence/source-governance";
import { buildOwnerActivationChecklist } from "@/lib/intelligence/source-activation";
import { deriveSourceHealth } from "@/lib/intelligence/source-health";
import { deriveSourceLifecycleState } from "@/lib/intelligence/source-lifecycle";

/**
 * Observation INSPECTOR page (Trust Layer v1) — developer-only, read-only
 * window into raw market_intelligence_observations rows (id, hash, source,
 * timestamp, derived confidence, privacy class, freshness status).
 *
 * Three fail-closed gates, in order:
 *  1. requireSuperadmin — the admin layout gates /dashboard/admin/*;
 *     the per-page call is defense-in-depth.
 *  2. INTELLIGENCE_INSPECTOR_ENABLED env flag ("1"/"true") — OFF by
 *     default; when off the page renders an honest "disabled" note and
 *     performs NO data read at all.
 *  3. The observations table is a GATED unapplied migration — the read
 *     degrades to an honest "needs migration" state (never an error page,
 *     never fabricated rows).
 *
 * Strictly read-only: no form, no action, no mutation anywhere on this
 * surface. No source can be activated from here.
 */

export const dynamic = "force-dynamic";

export default async function IntelligenceObservationInspectorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("intelligence");
  const enabled = isInspectorEnabled(
    process.env.INTELLIGENCE_INSPECTOR_ENABLED,
  );

  let body: React.ReactNode;
  if (!enabled) {
    body = (
      <p
        className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
        data-testid="observation-inspector-disabled"
      >
        {t("inspector.disabled")}
      </p>
    );
  } else {
    const result = await getIntelligenceObservations({
      limit: INSPECTOR_MAX_ROWS,
    });
    if (result.kind === "unavailable") {
      body = (
        <p
          className="rounded-md border border-dashed border-brand-blue/40 bg-brand-blue/5 p-4 text-sm text-text-secondary"
          data-testid="observation-inspector-needs-migration"
        >
          {t("inspector.needsMigration")}
        </p>
      );
    } else if (result.kind === "error") {
      body = (
        <p
          className="rounded-md border border-dashed border-state-warning/40 p-4 text-sm text-text-secondary"
          data-testid="observation-inspector-error"
        >
          {t("inspector.readError")}
        </p>
      );
    } else {
      const rows: readonly ObservationInspectorRowV1[] = toInspectorRows(
        result.rows,
      );
      body = <ObservationInspector rows={rows} />;
    }
  }

  // ── Source-readiness section (Source Readiness v1): the ONE owner
  //    activation checklist per external source, projected from the pure
  //    activation framework over the honest zero-state facts — today every
  //    item is red and every source waits for approval. Strictly display:
  //    nothing on this page can approve or activate anything.
  const externalProfiles = INTELLIGENCE_SOURCE_PROFILES.filter(
    (p) => p.sourceKind !== "internal_aggregated",
  );

  return (
    <div className="flex flex-col gap-6" data-testid="observation-inspector-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("inspector.eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("inspector.title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("inspector.intro")}</p>
        <p className="text-xs text-text-muted">{t("inspector.readOnlyNote")}</p>
      </header>
      {body}

      <section
        className="flex flex-col gap-4 rounded-md border border-ink-500 bg-ink-800/30 p-4"
        data-testid="source-readiness"
        aria-labelledby="source-readiness-heading"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="source-readiness-heading"
            className="font-mono text-[11px] uppercase tracking-label text-text-secondary"
          >
            {t("activation.title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("activation.intro")}
          </p>
        </div>
        {externalProfiles.map((profile) => (
          <div
            key={profile.key}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
            data-source-key={profile.key}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {t(
                  profile.displayNameCode.replace(/^intelligence\./, "") as never,
                ) as string}
              </span>
              <SourceStatusBadge state={deriveSourceLifecycleState(profile)} />
              <SourceHealthBadge
                state={deriveSourceHealth({
                  lifecycle: deriveSourceLifecycleState(profile),
                  lastSessionOutcome: null,
                  consecutiveFailures: null,
                })}
              />
            </div>
            <ActivationChecklist
              checklist={buildOwnerActivationChecklist(profile)}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
