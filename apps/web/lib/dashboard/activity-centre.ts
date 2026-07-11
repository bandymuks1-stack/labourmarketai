/**
 * Unified activity centre view model (control room PR C) — pure functions
 * that turn the ONE notification spine into the rows /dashboard/activity
 * renders. No DB, no IO — the page loads `getSpineCounts()` (request-cached,
 * shared with the layout's bell/badge read) and passes the counts in.
 *
 * Design contract (guard: lib/guards/activity-centre.test.ts):
 *
 *  - The spine is the SINGLE source. A row exists only for a SPINE_SIGNALS
 *    catalogue entry — never a parallel count, never an invented event.
 *    Signals without an honest seen-model (demand interest, verification,
 *    journal confirmation — see the capability gap map §2) are deliberately
 *    NOT listed; they join the spine first, migration-gated.
 *  - Source-module grouping comes from the dashboard module registry's
 *    attentionSignalIds linkage (PR B) — the module that declares a signal
 *    id IS its source module, so labels and routes are never duplicated.
 *  - Every row links the signal's real clearing surface (`href` from the
 *    catalogue). Visiting that surface IS the read event — there is no
 *    "mark read" control anywhere in this model.
 */

import {
  DASHBOARD_MODULES,
  type DashboardModule,
  type DashboardModuleId,
} from "./dashboard-module-registry";
import {
  SPINE_SIGNALS,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";

export interface ActivityRow {
  /** Spine signal id (stable; also the row testid suffix). */
  readonly id: string;
  /** i18n leaf under auth.notifications.types.* — the SAME copy the bell uses. */
  readonly typeKey: string;
  /** The real route that clears or resolves the signal. */
  readonly href: string;
  /** Real spine count (0 is honest and rendered as "nothing pending"). */
  readonly count: number;
  /** Source module (registry linkage — one truth for label + grouping). */
  readonly moduleId: DashboardModuleId;
  /** The source module's existing i18n label key (never a duplicate copy). */
  readonly moduleLabelKey: string;
}

/** "attention" = only signals with count > 0 (the default view);
 *  "all" = the whole catalogue with honest zero states. */
export type ActivityStateFilter = "attention" | "all";

/** Registry linkage inverted: signal id → the module that declares it. */
const MODULE_BY_SIGNAL: ReadonlyMap<string, DashboardModule> = (() => {
  const map = new Map<string, DashboardModule>();
  for (const m of DASHBOARD_MODULES) {
    for (const id of m.attentionSignalIds ?? []) map.set(id, m);
  }
  return map;
})();

/** The source module a spine signal belongs to (guard-pinned: every
 *  catalogue signal must resolve — an unmapped signal would silently
 *  disappear from the activity centre). */
export function moduleForSignal(
  signalId: string,
): DashboardModule | undefined {
  return MODULE_BY_SIGNAL.get(signalId);
}

/** Distinct source modules in spine display order — drives the filter chips. */
export const ACTIVITY_SOURCE_MODULE_IDS: readonly DashboardModuleId[] = (() => {
  const seen: DashboardModuleId[] = [];
  for (const s of SPINE_SIGNALS) {
    const m = MODULE_BY_SIGNAL.get(s.id);
    if (m && !seen.includes(m.id)) seen.push(m.id);
  }
  return seen;
})();

export function isActivitySourceModuleId(
  value: string | undefined,
): value is DashboardModuleId {
  return ACTIVITY_SOURCE_MODULE_IDS.includes(
    (value ?? "") as DashboardModuleId,
  );
}

/** One row per spine signal, in catalogue order, with its real count. */
export function buildActivityRows(counts: SpineCounts): readonly ActivityRow[] {
  return SPINE_SIGNALS.flatMap((s) => {
    const m = MODULE_BY_SIGNAL.get(s.id);
    // Unreachable while the guard holds (every signal maps to a module);
    // dropping instead of throwing keeps the page render defensive.
    if (!m) return [];
    return [
      {
        id: s.id,
        typeKey: s.type,
        href: s.href,
        count: s.count(counts),
        moduleId: m.id,
        moduleLabelKey: m.labelKey,
      },
    ];
  });
}

/** Pure searchParams-driven filtering (module + attention state). */
export function filterActivityRows(
  rows: readonly ActivityRow[],
  filters: {
    readonly moduleId: DashboardModuleId | null;
    readonly state: ActivityStateFilter;
  },
): readonly ActivityRow[] {
  return rows.filter(
    (r) =>
      (filters.moduleId === null || r.moduleId === filters.moduleId) &&
      (filters.state === "all" || r.count > 0),
  );
}
