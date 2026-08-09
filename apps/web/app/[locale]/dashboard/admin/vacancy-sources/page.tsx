import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readVacancySourceHealth } from "@/lib/vacancy-runner/vacancy-ingestion";
import { VacancySourceRunPanel } from "@/components/admin/vacancy-source-run-panel";

/**
 * VACANCY SOURCES — the operator console for external job-ad ingestion
 * (SOURCE_REGISTRY × SOURCE_GOVERNANCE × runtime switch × cursor health ×
 * stored rows, one row per provider).
 *
 * Fail-closed gates, in order:
 *   1. the admin layout + per-page requireSuperadmin (defense-in-depth);
 *   2. every RUN action re-checks isSuperadmin itself — an action is an HTTP
 *      endpoint regardless of which page renders it;
 *   3. a PERSIST run is refused by the runner unless governance activation
 *      AND the env kill switch are both open. Nothing on this page can
 *      override either — it can only make their state visible.
 *
 * The health read tolerates the not-yet-provisioned store, so this page is
 * honest BEFORE the persistence migration is applied, not only after.
 */

export const dynamic = "force-dynamic";

export default async function VacancySourcesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("vacancySources.admin");
  const health = await readVacancySourceHealth(createAdminClient());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">{t("intro")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-500 text-xs uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-4">{t("colSource")}</th>
              <th className="py-2 pr-4">{t("colCountry")}</th>
              <th className="py-2 pr-4">{t("colLegal")}</th>
              <th className="py-2 pr-4">{t("colActivation")}</th>
              <th className="py-2 pr-4">{t("colSwitch")}</th>
              <th className="py-2 pr-4">{t("colStored")}</th>
              <th className="py-2 pr-4">{t("colLastSuccess")}</th>
              <th className="py-2 pr-4">{t("colFailures")}</th>
            </tr>
          </thead>
          <tbody>
            {health.map((source) => {
              const lastSuccess = source.cursors
                .map((c) => c.lastSuccessAt)
                .filter(Boolean)
                .sort()
                .at(-1);
              const failures = source.cursors.reduce(
                (max, c) => Math.max(max, c.consecutiveFailures),
                0,
              );
              return (
                <tr
                  key={source.providerKey}
                  className="border-b border-ink-500/40 align-top"
                  data-testid={`vacancy-source-${source.providerKey}`}
                >
                  <td className="py-2 pr-4 font-medium">
                    {source.providerKey}
                  </td>
                  <td className="py-2 pr-4">{source.countryIso}</td>
                  <td className="py-2 pr-4">{source.legalStatus}</td>
                  <td className="py-2 pr-4">{source.activation}</td>
                  <td className="py-2 pr-4">
                    {source.operational ? (
                      <span className="text-status-success">
                        {t("switchOpen")}
                      </span>
                    ) : (
                      <span
                        className="text-text-muted"
                        title={source.switchBlockedReason ?? undefined}
                      >
                        {t("switchClosed")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {source.storedActive}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {lastSuccess ?? "—"}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{failures}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <VacancySourceRunPanel
        sources={health.map((h) => ({
          providerKey: h.providerKey,
          channels: [...h.channels],
          operational: h.operational,
        }))}
        labels={{
          runTitle: t("runTitle"),
          runDry: t("runDry"),
          runImport: t("runImport"),
          importDisabledReason: t("importDisabledReason"),
          running: t("running"),
          resultTitle: t("resultTitle"),
          refused: t("refused"),
          statusLabel: t("statusLabel"),
          mSeen: t("mSeen"),
          mAccepted: t("mAccepted"),
          mRejected: t("mRejected"),
          mDuplicate: t("mDuplicate"),
          mWaiting: t("mWaiting"),
          mInserted: t("mInserted"),
          mUpdated: t("mUpdated"),
          mUnchanged: t("mUnchanged"),
          errorsLabel: t("errorsLabel"),
        }}
      />
    </div>
  );
}
