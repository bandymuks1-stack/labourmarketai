import { getTranslations } from "next-intl/server";

import type { OverrideReceiptsRead } from "@/lib/planning/override-receipts";

/**
 * J-TIME-FREEDOM step 5 — the receipts, read back by either party.
 *
 * ONE component, two perspectives. The manager sees every receipt on their
 * project; the worker sees every receipt about them. The rows are the SAME
 * rows under the SAME policy (`commitment_override_receipts_select`), so the
 * two views cannot disagree about what was accepted — the only difference is
 * which id the surface asked by.
 *
 * Three states, never two: `ok` (with an honest empty list), `not-applied`
 * (the owner-gated migration is not applied — receipts are prepared, not
 * enabled), `unavailable` (a real read failure). Neither of the last two is
 * rendered as "no receipts".
 */
export async function OverrideReceiptsSection({
  read,
  perspective,
}: {
  read: OverrideReceiptsRead;
  perspective: "manager" | "worker";
}) {
  const t = await getTranslations("overrideReceipts");
  if (read.status === "not-applied") {
    return (
      <section className="flex flex-col gap-1" data-testid="override-receipts-not-applied">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
        <p className="text-xs text-text-muted">{t("notApplied")}</p>
      </section>
    );
  }
  if (read.status === "unavailable") {
    return (
      <section className="flex flex-col gap-1" data-testid="override-receipts-unavailable">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
        <p className="text-xs text-text-muted">{t("unavailable")}</p>
      </section>
    );
  }
  if (read.receipts.length === 0) {
    // An honest empty state for the manager only; a worker with no receipts
    // is not told about a mechanism that has never touched them.
    if (perspective === "worker") return null;
    return (
      <section className="flex flex-col gap-1" data-testid="override-receipts-empty">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
        <p className="text-xs text-text-muted">{t("empty")}</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2" data-testid="override-receipts">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
      <p className="text-xs text-text-muted">{t(perspective === "worker" ? "introWorker" : "introManager")}</p>
      <ul className="flex flex-col gap-2">
        {read.receipts.map((r) => (
          <li key={r.id} className="rounded-md border border-ink-600 p-3 text-xs" data-testid="override-receipt">
            <p className="text-text-secondary">
              {t("acceptedOn", { date: r.createdAt.slice(0, 10) })}
              {r.windowStart
                ? ` · ${t("window", { start: r.windowStart, end: r.windowEnd ?? r.windowStart })}`
                : ` · ${t("windowUndated")}`}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {r.collisions.map((c) => (
                <li key={`${c.source}:${c.sourceId}`} className="text-text-secondary">
                  <span className="font-mono uppercase tracking-label text-text-muted">{t(`source.${c.source}`)}</span>{" "}
                  {c.overlapStart === c.overlapEnd ? c.overlapStart : `${c.overlapStart} – ${c.overlapEnd}`}
                </li>
              ))}
            </ul>
            {r.reason ? <p className="mt-1 text-text-primary">“{r.reason}”</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
