import { getTranslations } from "next-intl/server";
import { CircleCheck, CircleAlert } from "lucide-react";
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

export async function MyZone({
  incomplete,
  improves = true,
}: {
  incomplete: boolean;
  /** Render the "Kas ką gerina" block inline (default). The dashboard passes
   *  false and mounts <MyZoneImproves/> below the fold instead. */
  improves?: boolean;
}) {
  const t = await getTranslations("auth.dashboard.myZone");

  return (
    <section className="flex flex-col gap-5" data-testid="my-zone">
      {/* Readiness status — one honest line, never a scary state. Uses the
          shared StatusChip (audit PR8): semantic tokens only, no raw emerald. */}
      <StatusChip
        variant={incomplete ? "attention" : "success"}
        icon={incomplete ? CircleAlert : CircleCheck}
        testid="my-zone-status"
      >
        {incomplete ? t("incompleteStatus") : t("readyStatus")}
      </StatusChip>

      {/* What improves what — one short, honest explanation. The dashboard
          demotes it below active work via improves={false} + <MyZoneImproves/>. */}
      {improves && <MyZoneImproves />}
    </section>
  );
}
