/**
 * THE WORK AREAS — the one source of truth for "which areas can I go to from
 * here", per workspace (owner order 2026-10-25, phase 2 of the one navigation
 * system). The home surfaces render these through the light 3D area switcher
 * (`components/app/area-switcher.tsx`); nothing else spells these routes.
 *
 *   personal      — the worker's contextual workspaces, derived from
 *                   `TODAY_STATIONS` (opportunities first: the former
 *                   PASAULIS tab). The core loop (chat · journal · calendar ·
 *                   messages) lives in the header and is not repeated here,
 *                   except the journal, which is also a station.
 *   organization  — the company model's doors, in priority order: the six
 *                   everyday ones first, then the rest (the former "More").
 *
 * Every href is an existing canonical route (guard:
 * `lib/guards/company-model.test.ts`, `lib/guards/area-switcher.test.ts`);
 * each destination re-checks its own rights under RLS — the list is a
 * presentation, never a permission.
 */

import { TODAY_STATIONS, type TodayStationId } from "@/lib/today/today-route";

export type WorkAreaIconKey =
  | "compass"
  | "journal"
  | "chart"
  | "user"
  | "idCard"
  | "images"
  | "userSearch"
  | "package"
  | "store"
  | "users"
  | "folder"
  | "messages"
  | "handshake"
  | "briefcase"
  | "calendar"
  | "gauge"
  | "activity"
  | "barChart"
  | "history";

export type WorkArea = {
  readonly id: string;
  readonly href: string;
  readonly iconKey: WorkAreaIconKey;
  /** Full i18n key path (read with the root translator). */
  readonly labelKey: string;
};

const PERSONAL_ICONS: Record<TodayStationId, WorkAreaIconKey> = {
  world: "compass",
  journal: "journal",
  numbers: "chart",
  profile: "user",
  cv: "idCard",
  gallery: "images",
};

/** The person's own workspace: the stations, one tap each. */
export const PERSONAL_WORK_AREAS: readonly WorkArea[] = TODAY_STATIONS.map((s) => ({
  id: s.id,
  href: s.href,
  iconKey: PERSONAL_ICONS[s.id],
  labelKey: `todayScreen.home.stations.${s.id}`,
}));

/** The organization workspace: the company model's doors, by priority. The
 *  calendar entry is the ONE calendar; "capacity" is the workforce zone. */
export const ORGANIZATION_WORK_AREAS: readonly WorkArea[] = [
  { id: "need", href: "/dashboard/company/needs", iconKey: "userSearch", labelKey: "companyModel.need" },
  { id: "offer", href: "/dashboard/services", iconKey: "package", labelKey: "companyModel.offer" },
  { id: "market", href: "/dashboard/listings", iconKey: "store", labelKey: "companyModel.market" },
  { id: "people", href: "/dashboard/company/people", iconKey: "users", labelKey: "companyModel.people" },
  { id: "projects", href: "/dashboard/projects", iconKey: "folder", labelKey: "companyModel.projects" },
  { id: "messages", href: "/dashboard/communication", iconKey: "messages", labelKey: "companyModel.messages" },
  { id: "clients", href: "/dashboard/company/partners", iconKey: "handshake", labelKey: "companyModel.clients" },
  { id: "candidates", href: "/dashboard/company/scouting", iconKey: "briefcase", labelKey: "companyModel.candidates" },
  { id: "calendar", href: "/dashboard/planning", iconKey: "calendar", labelKey: "companyModel.calendar" },
  { id: "capacity", href: "/dashboard/company/planning", iconKey: "gauge", labelKey: "companyModel.capacity" },
  { id: "work", href: "/dashboard/hours", iconKey: "activity", labelKey: "companyModel.work" },
  { id: "results", href: "/dashboard/reports", iconKey: "barChart", labelKey: "companyModel.results" },
  { id: "history", href: "/dashboard/company/history", iconKey: "history", labelKey: "companyModel.history" },
];

export type WorkAreaContext = "personal" | "organization";

/** The areas of a workspace — the one lookup every home surface uses. */
export function workAreasFor(context: WorkAreaContext): readonly WorkArea[] {
  return context === "organization" ? ORGANIZATION_WORK_AREAS : PERSONAL_WORK_AREAS;
}
