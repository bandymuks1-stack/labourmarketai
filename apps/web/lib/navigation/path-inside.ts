/**
 * Does `pathname` stand inside the area that starts at `href`? PURE, no
 * imports — the one question the area switcher asks, kept apart from
 * `header-place.ts` (which knows the dashboard module registry) so public
 * pages can render the switcher without that graph.
 */
export function pathIsInside(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
