import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";

/**
 * ŠIANDIEN — WHICH surface the dashboard root renders (worker mobile IA,
 * `docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md` §2).
 *
 * PURE. No IO, no React, no `server-only` — the SAME predicate runs on the
 * server (the page decides what to render) and on the client (the chrome
 * decides which shell to draw around it), so the two can never disagree
 * about what `/dashboard` is for a given person.
 *
 * The rule, in words:
 *   · a WORKER standing in their PERSONAL space opens ŠIANDIEN — the page
 *     with one next action, today's recorded work, open items, one growth
 *     line and one opportunity line;
 *   · the CONVERSATION (PAKLAUSK) is on demand (frozen contract §2.1): the
 *     same route with a conversation parameter — `?ask=1` from the tab bar,
 *     or any of the deep links the chat already answers to (`?result=`,
 *     `?say=`, `?intent=`, …). Every existing deep link keeps working (§1.5:
 *     additive, nothing removed);
 *   · every other identity (company / agency / admin) and a worker acting
 *     inside an organization keep the composition they had.
 */

/** The query parameter the PAKLAUSK tab sets. */
export const ASK_PARAM = "ask";

/**
 * Query parameters that mean "the person wants the conversation". `ask` is
 * this slice's; the rest are the chat's EXISTING deep links (`use-result-param`
 * reads result/geo/interaction/project/demand; the chat itself reads say and
 * intent). A parameter the chat does not read is not listed — it would send
 * a person to the conversation for no reason.
 */
export const CONVERSATION_PARAMS: readonly string[] = [
  ASK_PARAM,
  "result",
  "say",
  "intent",
  "geo",
  "interaction",
  "project",
  "demand",
];

export type DashboardRootSurface = "today" | "conversation";

/** A minimal read-only view of the query string — `URLSearchParams` on the
 *  client, the awaited `searchParams` record on the server. */
export type QueryLike =
  | { has(name: string): boolean }
  | Readonly<Record<string, string | readonly string[] | undefined>>;

function hasParam(query: QueryLike | null | undefined, name: string): boolean {
  if (!query) return false;
  if (typeof (query as { has?: unknown }).has === "function") {
    return (query as { has(n: string): boolean }).has(name);
  }
  const value = (query as Record<string, unknown>)[name];
  return value !== undefined && value !== null;
}

/** True when the query string carries any conversation parameter. */
export function hasConversationParams(query: QueryLike | null | undefined): boolean {
  return CONVERSATION_PARAMS.some((name) => hasParam(query, name));
}

/** True for a worker whose ACTIVE workspace is the personal space. A worker
 *  acting inside an organization is not in their personal "now". */
export function isWorkerPersonalSpace(input: {
  readonly activeRole: string | null | undefined;
  readonly activeWorkspaceId: string | null | undefined;
}): boolean {
  return (
    input.activeRole === "worker" &&
    (input.activeWorkspaceId ?? PERSONAL_WORKSPACE_ID) === PERSONAL_WORKSPACE_ID
  );
}

/** The one decision, shared by the page and the chrome. */
export function dashboardRootSurface(input: {
  readonly activeRole: string | null | undefined;
  readonly activeWorkspaceId: string | null | undefined;
  readonly query: QueryLike | null | undefined;
}): DashboardRootSurface {
  if (!isWorkerPersonalSpace(input)) return "conversation";
  return hasConversationParams(input.query) ? "conversation" : "today";
}

/** The three worker tabs (frozen contract §2.3). Hrefs are the EXISTING
 *  routes; PAKLAUSK is the conversation on demand. */
export const WORKER_TABS = [
  { id: "today", href: "/dashboard" },
  { id: "world", href: "/dashboard/opportunities" },
  { id: "ask", href: `/dashboard?${ASK_PARAM}=1` },
] as const;
export type WorkerTabId = (typeof WORKER_TABS)[number]["id"];

/** Which tab is active for a location. `today` and `ask` share a pathname
 *  and are told apart by the conversation parameters. */
export function activeWorkerTab(
  pathname: string,
  query: QueryLike | null | undefined,
): WorkerTabId | null {
  if (pathname === "/dashboard") {
    return hasConversationParams(query) ? "ask" : "today";
  }
  if (
    pathname === "/dashboard/opportunities" ||
    pathname.startsWith("/dashboard/opportunities/")
  ) {
    return "world";
  }
  return null;
}

/** The secondary stations reachable from ŠIANDIEN in one tap (IA §2). Every
 *  href is an existing route; `numbers` is lane F's own page for "Mano
 *  veikla skaičiais" and is linked as the IA names it. */
export const TODAY_STATIONS = [
  { id: "journal", href: "/dashboard/journal" },
  { id: "numbers", href: "/dashboard/journal/numbers" },
  { id: "profile", href: "/dashboard/profile" },
  { id: "cv", href: "/cv" },
  { id: "gallery", href: "/dashboard/gallery" },
] as const;
export type TodayStationId = (typeof TODAY_STATIONS)[number]["id"];
