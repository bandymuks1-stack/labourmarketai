import { type Role } from "@/lib/auth/actions";

/**
 * WHICH authenticated route needs WHICH held role — the one table.
 *
 * It exists because of a measured defect, not for tidiness. Every role gate
 * used to live only in the page (`requireRoleOrRedirect`) or in the admin
 * subtree layout (`requireSuperadmin`), and BOTH sit underneath
 * `app/[locale]/dashboard/loading.tsx`. A `loading.tsx` wraps everything
 * below it in a Suspense boundary, and a `redirect()` thrown inside a Suspense
 * boundary can no longer become an HTTP redirect — Next has already committed
 * the response. Measured on the local production build, worker →
 * `/lt/dashboard/company`:
 *
 *     HTTP 200, 600 627 bytes, the whole authenticated shell,
 *     NEXT_REDIRECT;replace;/lt/dashboard?notice=needs_company_role;307;
 *     serialized into the same first chunk — then ~600ms of
 *     "Application error: a client-side exception has occurred"
 *     before the browser performed the redirect itself.
 *
 * The identical `redirect()` one level UP — in the dashboard layout, which is
 * ABOVE that boundary — answers `307 location: /lt/onboarding` with no shell
 * at all. So the refusal has to be DECIDED where the layout already resolves
 * the person's roles, and the layout is handed the requested path by the
 * middleware (`x-lm-pathname`); it cannot derive it for itself.
 *
 * This table is the ONLY new thing. It is not a second permission model:
 * nothing here reads the database, and the answers still come from the same
 * `profile_roles` read the shell already performs. The page-level and
 * admin-layout gates stay exactly as they are — defence in depth, and the
 * authority on any request where the header never arrived.
 * `lib/guards/role-gated-routes.test.ts` re-derives the table from the pages
 * themselves, so a new gated route that is not listed here fails CI instead
 * of quietly reintroducing the flash.
 */

/**
 * The requested path, as the middleware hands it to the authenticated shell.
 *
 * A Next.js layout is not told which route it is wrapping, and the shell needs
 * exactly that one fact to refuse BEFORE the response is committed. The
 * middleware carries NO authorization: it copies a value it already holds onto
 * the request and makes no decision with it. The value is locale-stripped so
 * the shell never re-implements locale parsing.
 */
export const DASHBOARD_PATHNAME_HEADER = "x-lm-dashboard-path";

/**
 * ADMIN IS NOT A WORKSPACE ROLE. `requireSuperadmin` recognises it from a DUAL
 * signal (`profiles.active_role === 'admin'` OR a `profile_roles` admin row —
 * see `lib/auth/admin-signal.ts`), which is why it cannot be expressed as one
 * of the four participation roles.
 */
export type RouteRequirement =
  | { readonly kind: "role"; readonly role: Role }
  | { readonly kind: "admin" };

type GatedPrefix = {
  /** Locale-stripped path prefix. Matches the segment and everything under it. */
  readonly prefix: string;
  readonly requirement: RouteRequirement;
};

export const ROLE_GATED_PREFIXES: readonly GatedPrefix[] = [
  { prefix: "/dashboard/company", requirement: { kind: "role", role: "company" } },
  { prefix: "/dashboard/opportunities", requirement: { kind: "role", role: "worker" } },
  { prefix: "/dashboard/buyer", requirement: { kind: "role", role: "customer" } },
  { prefix: "/dashboard/admin", requirement: { kind: "admin" } },
  // Operator-only, and it does NOT live under /dashboard/admin — found by the
  // guard rather than by reading the tree, which is the whole argument for
  // deriving this table from the pages instead of maintaining it by hand.
  { prefix: "/dashboard/talent", requirement: { kind: "admin" } },
] as const;

/** `/lt/dashboard/company/people` → `/dashboard/company/people`. */
export function stripLocaleSegment(
  pathname: string,
  locales: readonly string[],
): string {
  const parts = pathname.split("/");
  if (parts.length > 1 && locales.includes(parts[1])) {
    return "/" + parts.slice(2).join("/");
  }
  return pathname;
}

/** True for any path the authenticated dashboard shell renders. */
export function isDashboardPath(pathWithoutLocale: string): boolean {
  return (
    pathWithoutLocale === "/dashboard" ||
    pathWithoutLocale.startsWith("/dashboard/")
  );
}

/**
 * What the given locale-stripped path requires, or `null` when it is open to
 * every authenticated person. LONGEST prefix wins, so a future
 * `/dashboard/company/<something-stricter>` can be added without the broader
 * `/dashboard/company` row silently answering first.
 */
export function routeRequirement(
  pathWithoutLocale: string,
): RouteRequirement | null {
  let best: GatedPrefix | null = null;
  for (const row of ROLE_GATED_PREFIXES) {
    const matches =
      pathWithoutLocale === row.prefix ||
      pathWithoutLocale.startsWith(row.prefix + "/");
    if (matches && (best === null || row.prefix.length > best.prefix.length)) {
      best = row;
    }
  }
  return best?.requirement ?? null;
}

/**
 * The operator refusal's reason token. Distinct from the role tokens because
 * admin is not a participation role and nobody can "add" it — the sentence it
 * produces therefore offers no setup route, only the fact.
 *
 * It DOES say an internal view exists, which is a disclosure the silent bounce
 * did not make. Judged acceptable: the person reached this only by opening an
 * operator URL they already knew, and being teleported home with no words is
 * the very defect this work exists to remove. No capability, count, name or
 * console contents are revealed.
 */
export const OPERATOR_ACCESS_NOTICE = "needs_operator_access";

/**
 * THE refusal destination — the one canonical home, carrying the reason.
 *
 * The role reason travels as `?notice=needs_<role>_role` because that is the
 * value `requireRoleOrRedirect` has always emitted and existing guards pin it.
 * Every token here is INTERNAL: `lib/auth/access-notice.ts` turns it into a
 * sentence, and the token itself must never reach the screen (doctrine §23).
 */
export function refusalDestination(
  locale: string,
  requirement: RouteRequirement,
): string {
  if (requirement.kind === "admin") {
    return `/${locale}/dashboard?notice=${OPERATOR_ACCESS_NOTICE}`;
  }
  return `/${locale}/dashboard?notice=needs_${requirement.role}_role`;
}
