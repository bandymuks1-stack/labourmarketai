import { getTranslations } from "next-intl/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { readVacancySourceHealth } from "@/lib/vacancy-runner/vacancy-ingestion";
import { VacancySourceRunPanel } from "@/components/admin/vacancy-source-run-panel";

/**
 * VACANCY SOURCES — the operator section for external job-ad ingestion
 * (SOURCE_REGISTRY × SOURCE_GOVERNANCE × runtime switch × cursor health ×
 * stored rows, one row per provider).
 *
 * A SECTION on the existing admin control room, deliberately NOT a new page:
 * the product constitution's world-state lock blocks new screens
 * (`needsNoNewPage` is a blocking answer, and not one of the waivable
 * readiness fields), and an operator console has no claim to an exemption the
 * worker journey does not get. The admin index already is "one coherent
 * control surface, not a flat grid of tiles" — this is one more coherent
 * area on it.
 *
 * Fail-closed gates, in order:
 *   1. rendered ONLY inside /dashboard/admin (admin layout + page
 *      requireSuperadmin);
 *   2. every RUN action re-checks isSuperadmin itself — an action is an HTTP
 *      endpoint regardless of which surface renders it;
 *   3. a PERSIST run is refused by the runner unless governance activation
 *      AND the env kill switch are both open. Nothing here can override
 *      either — the section can only make their state visible.
 *
 * The health read tolerates the not-yet-provisioned store, so this section is
 * honest BEFORE the persistence migration is applied, not only after.
 */
export async function VacancySourcesSection() {
  const t = await getTranslations("vacancySources.admin");
  const health = await readVacancySourceHealth(createAdminClient());

  return (
    <section className="flex flex-col gap-3" data-testid="admin-vacancy-sources">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="max-w-3xl text-xs text-text-secondary">{t("intro")}</p>
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
    </section>
  );
}
