import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import type { EmployerSupplyState } from "@/lib/supply/employer-supply-discovery";

/**
 * AVAILABLE WORKFORCE — the supply half of the employer's discovery surface.
 *
 * It sits beside candidate scouting on purpose. An employer looking for people
 * has two real questions, not one: *which individuals fit* (scouting, over the
 * worker supply) and *who already has a crew available* (this, over declared
 * organizational capacity). Splitting them into two products would be exactly
 * the fragmentation this platform is meant to remove; they are one question
 * asked at two scales.
 *
 * ── WHAT IT SHOWS, AND WHAT IT REFUSES TO ──────────────────────────────────
 * The shape of the capacity and where it is: work type, country, how many
 * people, from when, for how long. No organization name, no contact, no free
 * text. An employer learns that capacity of a shape exists — the same
 * anonymised preview posture scouting takes toward individual workers. Making
 * contact is a separate, consented act, and nothing here creates a path to one.
 *
 * ── EVERY STATE IS ITSELF ──────────────────────────────────────────────────
 * `needs-migration` says the gated read is not switched on in this
 * environment. It never renders as "no workforce is available", which would be
 * a claim about the market made from a fact about the deployment (§54, #1314).
 * A failed read says so too. Only a real empty result renders as empty.
 */
export async function AvailableSupplySection({ state }: { state: EmployerSupplyState }) {
  const t = await getTranslations("scouting.availableSupply");

  const body = () => {
    if (state.kind === "needs-migration") {
      return (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="available-supply-not-enabled">
          {t("notEnabled")}
        </p>
      );
    }
    if (state.kind === "error") {
      return (
        <p className="text-xs leading-relaxed text-state-warning" data-testid="available-supply-error">
          {t("readFailed")}
        </p>
      );
    }
    if (state.kind === "unauthenticated") return null;
    if (state.rows.length === 0) {
      return (
        <p className="text-sm text-text-muted" data-testid="available-supply-empty">
          {t("empty")}
        </p>
      );
    }
    return (
      <ul className="flex flex-col gap-2" data-testid="available-supply-rows">
        {state.rows.map((row) => (
          <li
            key={row.id}
            data-testid="available-supply-row"
            className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-900 px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-text-primary">
                {row.roleText ?? t("unstatedRole")}
              </span>
              {row.teamSize !== null && (
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("people", { count: row.teamSize })}
                </span>
              )}
              {row.country && (
                <span className="text-xs text-text-secondary">{row.country}</span>
              )}
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-text-muted">
              {row.startPeriod && (
                <span>
                  {t("from")}: {row.startPeriod}
                </span>
              )}
              {row.duration && (
                <span>
                  {t("duration")}: {row.duration}
                </span>
              )}
              {row.declaredAt && (
                <span>
                  {t("declared")}: {row.declaredAt.slice(0, 10)}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Card compact>
      <section className="flex flex-col gap-3" data-testid="available-supply-section">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-bold tracking-tightest text-text-primary">
            {t("title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
        </header>
        {body()}
        {/* Said on every render, not only when rows exist: the boundary is the
            point, and an employer must know it before they start looking. */}
        <p className="text-xs leading-relaxed text-text-muted" data-testid="available-supply-privacy">
          {t("privacyNote")}
        </p>
      </section>
    </Card>
  );
}
