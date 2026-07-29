import { getTranslations } from "next-intl/server";

import { LAUNCH_BOARD, type LaunchStatus } from "@/lib/admin/launch-board";
import type { LaunchSignals } from "@/lib/admin/launch-signals";

/**
 * Owner control room — launch band (PR12): REAL launch signals + the 15-item
 * launch board. Server component; unknown counts render as "—" (never a
 * fabricated number); every non-RED board status cites a proof artifact
 * whose existence is CI-guarded (owner-control-room.test.ts).
 */

const STATUS_TONE: Record<LaunchStatus, string> = {
  green_scoped: "border-state-success/40 bg-state-success/10 text-state-success",
  yellow: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  red: "border-state-warning/50 bg-state-warning/10 text-state-warning",
};

export async function AdminLaunchBoard({ signals }: { signals: LaunchSignals }) {
  const t = await getTranslations("admin.launch");
  const num = (n: number | null) => (typeof n === "number" ? n.toLocaleString() : "—");

  const signalTiles: { key: string; value: string }[] = [
    { key: "workers", value: num(signals.workers) },
    { key: "companies", value: num(signals.companies) },
    { key: "verifiedCompanies", value: num(signals.verifiedCompanies) },
    { key: "openDemands", value: num(signals.openDemands) },
    { key: "interestActive", value: num(signals.interestActive) },
    { key: "interestReviewed", value: num(signals.interestReviewed) },
    { key: "interestContacted", value: num(signals.interestContacted) },
  ];

  return (
    <section className="flex flex-col gap-4" data-testid="admin-launch-band">
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      {/* Real launch signals — unknown renders as "—", never invented. */}
      <ul
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
        data-testid="admin-launch-signals"
      >
        {signalTiles.map((s) => (
          <li
            key={s.key}
            className="flex min-h-[3.25rem] flex-col rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
          >
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t(`signals.${s.key}` as never)}
            </span>
            <span className="font-mono text-lg font-semibold text-text-primary">
              {s.value}
            </span>
          </li>
        ))}
      </ul>
      {/* Rule D (dead-UI repair): these tiles are monitoring-only counts —
          said explicitly so nobody hunts for a click. */}
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid="admin-launch-signals-monitoring-note"
      >
        {t("monitoringNote")}
      </p>

      {/* The 15-item launch board — statuses are CLAIMS; each non-RED claim
          cites a proof artifact whose existence is CI-guarded. */}
      <ul className="flex flex-col gap-1.5" data-testid="admin-launch-board">
        {LAUNCH_BOARD.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
            data-launch-item={item.key}
            data-launch-status={item.status}
          >
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[item.status]}`}
            >
              {t(`status.${item.status}` as never)}
            </span>
            <span className="text-sm text-text-primary">
              {t(`items.${item.key}` as never)}
            </span>
            {item.pending ? (
              <span className="text-meta text-text-muted">· {item.pending}</span>
            ) : null}
            {item.ownerDecision ? (
              <span className="text-meta text-state-amber">
                · {t("ownerDecision")}: {item.ownerDecision}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-meta leading-relaxed text-text-muted">{t("footnote")}</p>
    </section>
  );
}
