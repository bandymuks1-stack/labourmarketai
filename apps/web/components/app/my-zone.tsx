import { getTranslations } from "next-intl/server";
import { CircleCheck, CircleAlert, ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { StatusChip } from "./status-chip";

/**
 * Mano erdvė readiness block (action-first-product-logic-v1, slimmed by the
 * control-room foundation, PR B).
 *
 * Owner principle unchanged: the user arrives, instantly understands what
 * they can do, and completes the next useful action in seconds. This block
 * now carries two things and nothing else:
 *   1. a one-line readiness status (information complete or not yet);
 *   2. "Kas ką gerina" — one short, honest explanation of how the actions
 *      feed each other (journal → skills/profile/CV → visibility; map =
 *      where you are visible; messages = trusted contact only).
 *
 * The former "Ką galite padaryti dabar" fast-action grid moved to the ONE
 * registry-driven control-room grid (lib/dashboard/dashboard-module-registry.ts
 * → components/app/dashboard/dashboard-module-grid.tsx), which renders the
 * same human labels (auth.dashboard.myZone.actions.*) from a single source
 * instead of a hard-coded list here.
 *
 * Real data only: `incomplete` is derived from the worker's real profession +
 * entry state. No fake data, no preview/sample actions, no internal language.
 */

const IMPROVES = ["journal", "profile", "map", "messages"] as const;

/** "Kas ką gerina" — the explanation half, mountable on its own so the
 *  dashboard can demote this help block below the active-work surfaces
 *  (audit PR6: help must never render before action). Same copy, same
 *  honesty rules. */
export async function MyZoneImproves() {
  const t = await getTranslations("auth.dashboard.myZone");
  return (
    <div
      data-testid="my-zone-improves"
      className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-ink-800/20 p-4"
    >
      <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("improvesHeading")}
      </h3>
      <ul className="flex flex-col gap-1 text-xs leading-relaxed text-text-secondary">
        {IMPROVES.map((k) => (
          <li key={k} className="flex items-start gap-2">
            <span aria-hidden className="mt-1 text-brand-blue">
              ·
            </span>
            {t(`improves.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One exact missing piece of the readiness checklist. The href arrives from
 *  the page (real deep link into the exact section that fixes it) — this
 *  component never hard-codes a route (control-room guard: the registry and
 *  the page own routes, MyZone owns presentation). */
export type MyZoneMissingItem = {
  key: "profession" | "firstEntry";
  href: string;
};

export async function MyZone({
  incomplete,
  improves = true,
  missingItems = [],
}: {
  incomplete: boolean;
  /** Render the "Kas ką gerina" block inline (default). The dashboard passes
   *  false and mounts <MyZoneImproves/> below the fold instead. */
  improves?: boolean;
  /** The exact missing items behind `incomplete`, each deep-linking to the
   *  precise section where the user completes it (user-journey repair v1:
   *  a warning is only allowed to look actionable if it IS actionable). */
  missingItems?: MyZoneMissingItem[];
}) {
  const t = await getTranslations("auth.dashboard.myZone");

  return (
    <section className="flex flex-col gap-5" data-testid="my-zone">
      {/* Readiness status — one honest line, never a scary state. When the
          information is incomplete the SAME surface carries the exact missing
          items as real links — the user is never told "incomplete" without a
          working way to fix it right there. */}
      {incomplete ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-ink-800/20 p-4"
          data-testid="my-zone-missing"
        >
          <StatusChip variant="attention" icon={CircleAlert} testid="my-zone-status">
            {t("incompleteStatus")}
          </StatusChip>
          {missingItems.length > 0 ? (
            <>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t("missing.progress", { n: missingItems.length })}
              </p>
              <ul className="flex flex-col gap-2">
                {missingItems.map((m) => (
                  <li key={m.key}>
                    <Link
                      href={m.href as "/dashboard"}
                      data-testid={`my-zone-missing-${m.key}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-text-primary">
                          {t(`missing.${m.key}.title`)}
                        </span>
                        <span className="text-[11px] leading-snug text-text-secondary">
                          {t(`missing.${m.key}.hint`)}
                        </span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-brand-blue"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : (
        <StatusChip variant="success" icon={CircleCheck} testid="my-zone-status">
          {t("readyStatus")}
        </StatusChip>
      )}

      {/* What improves what — one short, honest explanation. The dashboard
          demotes it below active work via improves={false} + <MyZoneImproves/>. */}
      {improves && <MyZoneImproves />}
    </section>
  );
}
