import { setRequestLocale } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth/superadmin";

/**
 * Admin subtree gate (systemic-ux-admin-v1).
 *
 * Structural, fail-closed admin gate for EVERY page under
 * `/[locale]/dashboard/admin/*`. Before this layout, each of the 15 admin
 * pages repeated `requireSuperadmin` per-page; a new admin page that forgot
 * the call would silently leak operator/telemetry/QA screens to a normal user.
 *
 * `requireSuperadmin` redirects:
 *   - unauthenticated → /<locale>/auth/login
 *   - authenticated non-admin → /<locale>/dashboard
 *   - admin → renders children.
 *
 * The per-page `requireSuperadmin` calls stay as defense-in-depth (and because
 * some pages need the returned user id); this layout is the guarantee that the
 * whole subtree is admin-only even if an individual page drifts.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  return <>{children}</>;
}
