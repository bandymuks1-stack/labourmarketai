/**
 * Control-room view model (PR B) — pure functions that turn the module
 * registry + the notification-spine counts into exactly what the dashboard
 * renders: the role-specific module list (with real badge counts) and the
 * compact status-strip entries.
 *
 * No DB, no IO — the page loads `getSpineCounts()` (request-cached, shared
 * with the layout's bell/badge read) and passes the counts in. Every number
 * in the output traces to a SpineCounts field; a module without a wired
 * spine signal simply has badgeCount 0 (never a fake count).
 *
 * Guard: lib/guards/dashboard-module-registry.test.ts.
 */

import type { Role } from "@/lib/auth/actions";
import {
  SPINE_SIGNALS,
  type SpineCounts,
  type SpineSignalDef,
} from "@/lib/notifications/spine-signals";
import {
  DASHBOARD_MODULES,
  getModuleRoute,
  type DashboardModule,
  type DashboardModuleId,
  type ModuleIconKey,
} from "./dashboard-module-registry";

export interface ControlRoomModule {
  readonly id: DashboardModuleId;
  readonly route: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly iconKey: ModuleIconKey;
  /** Real attention count from the spine (0 = no badge rendered). */
  readonly badgeCount: number;
}

export interface StatusStripEntry {
  readonly id: string;
  /** i18n leaf under auth.notifications.types.* — the same copy the bell uses. */
  readonly typeKey: string;
  /** The real route that clears or resolves the signal. */
  readonly href: string;
  readonly count: number;
}

export interface ControlRoomViewModel {
  readonly modules: readonly ControlRoomModule[];
  readonly statusEntries: readonly StatusStripEntry[];
}

const SIGNAL_BY_ID: ReadonlyMap<string, SpineSignalDef> = new Map(
  SPINE_SIGNALS.map((s) => [s.id, s]),
);

function moduleBadgeCount(m: DashboardModule, counts: SpineCounts): number {
  let total = 0;
  for (const id of m.attentionSignalIds ?? []) {
    const signal = SIGNAL_BY_ID.get(id);
    if (!signal) continue;
    total += signal.count(counts);
  }
  return total;
}

function moduleVisibleForRole(
  m: DashboardModule,
  role: Role,
  hasCompany: boolean,
): boolean {
  if (m.roles.includes(role)) return true;
  // Preserved MyZone behaviour: a worker who really owns a company keeps the
  // company-workspace shortcut on their grid (real RLS-scoped ownership read).
  return m.id === "company" && role === "worker" && hasCompany;
}

/**
 * Build the whole control-room view model for one user state. Pure and
 * deterministic: role + counts + company ownership in, render model out.
 */
export function buildControlRoomViewModel({
  role,
  counts,
  hasCompany,
}: {
  readonly role: Role;
  readonly counts: SpineCounts;
  readonly hasCompany: boolean;
}): ControlRoomViewModel {
  const modules = DASHBOARD_MODULES.filter(
    (m) => m.surfaces.includes("grid") && moduleVisibleForRole(m, role, hasCompany),
  ).map((m) => ({
    id: m.id,
    route: getModuleRoute(m.id),
    labelKey: m.labelKey,
    descriptionKey: m.descriptionKey,
    iconKey: m.iconKey,
    badgeCount: moduleBadgeCount(m, counts),
  }));

  // Status strip = the spine, count-gated exactly like the bell: a row exists
  // ONLY while its count is > 0, and it links the surface that clears it.
  const statusEntries = SPINE_SIGNALS.flatMap((s) => {
    const count = s.count(counts);
    if (count <= 0) return [];
    return [{ id: s.id, typeKey: s.type, href: s.href, count }];
  });

  return { modules, statusEntries };
}
