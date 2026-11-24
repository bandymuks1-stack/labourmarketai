/**
 * The ONLY two pages an owner-granted, time-boxed history READ grant opens
 * (20261124053000_history_read_grant_v1): the company history and one
 * person's history page. Pure (no server import), so the dashboard layout
 * gate, the pages and the guards share one definition.
 *
 * Paths are locale-stripped (`/dashboard/company/history`).
 */
export function isHistoryGrantPath(pathWithoutLocale: string | null | undefined): boolean {
  if (!pathWithoutLocale) return false;
  const path = pathWithoutLocale.split(/[?#]/)[0]!.replace(/\/+$/, "");
  if (path === "/dashboard/company/history") return true;
  return /^\/dashboard\/company\/people\/[^/]+$/.test(path);
}
