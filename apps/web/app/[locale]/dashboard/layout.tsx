import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { pickClientMessages } from "@/lib/i18n/client-messages";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { LanguageFeedbackWidget } from "@/components/app/language-feedback-widget";
import { SessionTelemetry } from "@/components/app/session-telemetry";
import { SpineStream } from "@/components/app/spine-stream";
import { AuthProvider } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { readAdminUiHidden } from "@/lib/auth/admin-ui-pref";
import { baseIdentityForRole } from "@/lib/config/roles";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import type { SwitchableOrganization } from "@/lib/company/organization-switch";
import { getOwnCompany } from "@/lib/company/company-setup";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { createClient } from "@/lib/supabase/server";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/**
 * Thin authenticated shell for the whole `/dashboard` tree (route-group root).
 *
 * This layer resolves user + profile + roles ONCE, server-side, and hands them
 * to the client `AuthProvider` so every downstream widget (RoleSwitcher,
 * NotificationPanel, DashboardTabs, the simple-mode header) stays in sync — but
 * it renders NO chrome of its own. The two chromes live in the child route
 * groups:
 *   - `(full)/layout.tsx`   → the wide module dashboard (Advanced mode + every
 *                             specialized module route) — the previous full
 *                             chrome, verbatim, so nothing is lost.
 *   - `(panels)/layout.tsx` → the simple-mode shell (5-item nav) for the human
 *                             message threads, calendar and profile.
 *   - `page.tsx` (root)     → the conversation home, a self-contained full-height
 *                             chat that supplies its own simple-mode header/nav.
 *
 * This replaces the previous `fixed inset-0` overlay trick: the conversation no
 * longer paints over a still-mounted wide navbar — the wide navbar simply is not
 * in the tree for simple mode. Doctrine §18 (real, not overlay illusions).
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const layoutStart = Date.now();
  const supabase = await createClient();

  // P0 auth-performance: NOTHING awaits serially before the batch. The
  // memoized getUser fires inside the same Promise.all as the session
  // profile and the roles read (chained off getUser — profiles.id === auth
  // user id), so the layout costs ONE parallel stage. (The profile row comes
  // from the ONE request-cached session-profile reader shared with the pages.)
  const userPromise = supabase.auth.getUser();
  const rolesPromise: Promise<{ data: { role: string }[] | null }> =
    userPromise.then(async ({ data: { user } }) =>
      user
        ? await supabase
            .from("profile_roles")
            .select("role")
            .eq("profile_id", user.id)
            .eq("is_active", true)
        : { data: null },
    );
  const [userRes, session, rolesRes] = await Promise.all([
    userPromise,
    getSessionProfile(),
    rolesPromise,
  ]);
  const user = userRes.data.user;
  if (!user) redirect(`/${locale}/auth/login`);
  const profile = session.profile;
  const rolesRows = rolesRes.data;
  console.info("[perf] dashboard-layout", {
    ms: Date.now() - layoutStart,
  });

  if (!profile?.onboarded_at) redirect(`/${locale}/onboarding`);

  const roles = (rolesRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));
  // Admin is NOT a workspace role — it lives on a separate signal so switching
  // workspaces never strips admin in the UI. See `deriveIsAdmin`.
  const isAdmin = deriveIsAdmin({
    activeRole: profile.active_role,
    profileRoles: rolesRows ?? [],
  });
  const adminUiHidden = isAdmin ? await readAdminUiHidden() : false;
  const activeRole = ROLES.has(profile.active_role as Role)
    ? (profile.active_role as Role)
    : (roles[0] ?? null);

  // Company identity → surface WHICH organization is active. Read-only,
  // RLS-scoped; resolved ONLY for the company identity. Null (never fabricated)
  // when no company row exists yet.
  let activeOrgName: string | null = null;
  let organizations: SwitchableOrganization[] = [];
  let activeOrganizationId: string | null = null;
  if (activeRole && baseIdentityForRole(activeRole) === "company") {
    const orgContext = await getActiveOrganizationContext();
    if (orgContext.activeOrganization) {
      activeOrgName = orgContext.activeOrganization.name;
      activeOrganizationId = orgContext.activeOrganizationId;
      if (orgContext.canSwitch) {
        organizations = orgContext.organizations.map((o) => ({
          id: o.id,
          name: o.name,
        }));
      }
    } else {
      const company = await getOwnCompany();
      if (company.kind === "ok" && company.row) {
        activeOrgName =
          company.row.displayName ?? company.row.legalName ?? null;
      }
    }
  }

  return (
    <NextIntlClientProvider messages={pickClientMessages(await getMessages())}>
      <AuthProvider
        initial={{
          user: { id: user.id, email: user.email ?? null },
          profile: {
            full_name: profile.full_name,
            email: profile.email,
          },
          activeRole,
          roles,
          isAdmin,
          adminUiHidden,
          activeOrgName,
          organizations,
          activeOrganizationId,
        }}
      >
        {/* Streamed notification spine: same single source, off the TTFB
          critical path. Hydrates the bell + nav badges via the auth context as
          soon as the derived signals resolve. Lives at the thin root so BOTH
          chromes (full + simple) share the one spine. */}
        <Suspense fallback={null}>
          <SpineStream activeRole={activeRole} />
        </Suspense>
        <SessionTelemetry />
        <AmbientGlow />
        {children}
        {/* v1 tester language-feedback widget — authenticated sessions only. */}
        <LanguageFeedbackWidget />
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
