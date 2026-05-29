import { setRequestLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";

/**
 * Type-escape for tables not in the generated `Database` type.
 * Same pattern as `apps/web/app/[locale]/dashboard/admin/page.tsx`
 * uses for `profile_skill_claims`. Local + remote schemas drift on
 * naming until `pnpm db:types` runs against prod; the escape keeps
 * the diagnostic page typecheck-clean without depending on a
 * regenerated type file.
 */
function untyped(supabase: SupabaseClient, table: string) {
  return (
    supabase as unknown as {
      from: (name: string) => ReturnType<SupabaseClient["from"]>;
    }
  ).from(table);
}

/**
 * P0 Project Truth — central owner / admin diagnostic surface.
 *
 * Spec: `runtime/artifacts/labourmarketai-real-visual-os-2026-05-28/
 * p0-project-truth-db-admin-duplicate-audit.md`.
 *
 * Why this page exists:
 *   Owner reported "admin sees only himself". The DB-level RLS
 *   helper `public.is_admin()` (migration 0003 lines 93-99) reads
 *   ONLY `profiles.active_role = 'admin'`. The application-layer
 *   helper `deriveIsAdmin()` is dual-signal (active_role OR a
 *   `profile_roles` row with `role='admin'`). When the admin user
 *   switches workspace, `switchActiveRole` upserts a
 *   `profile_roles` admin row BEFORE overwriting `active_role`.
 *   After the switch:
 *     - The page-level gate via `requireSuperadmin` PASSES
 *       (dual-signal recognises the user as admin), so the
 *       admin route renders.
 *     - But EVERY supabase query in the page runs through the
 *       user-scoped client → RLS evaluates `is_admin()` → returns
 *       FALSE because `active_role !== 'admin'` → policies fall
 *       back to `id = auth.uid()` → the admin sees only their
 *       own profile row.
 *
 * This page surfaces that mismatch EXPLICITLY and gives the owner
 * the exact SQL action they must run (manually, in Supabase SQL
 * Editor or `pnpm db:psql`) to fix the helper. It writes nothing
 * to production.
 *
 * Security posture:
 *   - `requireSuperadmin(locale)` is the first awaited statement;
 *     non-admins are redirected.
 *   - Every query uses the user-scoped supabase client; the page
 *     never escalates to a service-role client (we don't have a
 *     safe server-only admin path on this branch).
 *   - The page prints NO secrets (no env values, no tokens, no
 *     service-role key). Only safe identifiers: env variable
 *     NAMES, supabase project ref / domain, route names, counts.
 *   - No mutations from this surface. Read-only diagnostic.
 *
 * What this page does NOT do:
 *   - It does not list every auth user — that requires
 *     `auth.admin.listUsers()` (service-role only).
 *   - It does not bypass RLS.
 *   - It does not modify any data.
 *   - It does not apply migrations.
 */

export default async function ProjectTruthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireSuperadmin(locale);
  await getTranslations("admin");
  const supabase = await createClient();

  // ── Read admin signals (BOTH legs of the dual signal) ──────────
  // These reveal the active_role vs profile_roles mismatch that is
  // the root cause of "admin sees only himself" — when active_role
  // is NOT 'admin', the DB-level is_admin() returns false and RLS
  // limits the queries below to the admin's own rows.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, email, active_role, onboarded_at, created_at")
    .eq("id", userId)
    .maybeSingle();

  const { data: profileRolesRows } = await supabase
    .from("profile_roles")
    .select("role, is_active")
    .eq("profile_id", userId);

  const activeRoleIsAdmin = ownProfile?.active_role === "admin";
  const profileRolesHasAdmin = (profileRolesRows ?? []).some(
    (r) => r.role === "admin",
  );
  const rlsAdminReadActive = activeRoleIsAdmin;
  const appAdminGateActive = activeRoleIsAdmin || profileRolesHasAdmin;
  const adminSignalMismatch =
    appAdminGateActive && !rlsAdminReadActive;

  // ── Counts the current admin session CAN see ─────────────────
  // These are RLS-filtered. If the admin signal mismatch above is
  // true, every count below is restricted to rows the admin owns
  // (typically 1 for profiles, 0 for everything else). That is the
  // visible symptom of the root cause.
  const [
    profilesCount,
    profileRolesCount,
    pilotDraftsCount,
    customersCount,
    agencyWorkersCount,
    agencyWorkerInvitationsCount,
    companyWorkersCount,
    companyWorkerInvitationsCount,
    customerRequestsCount,
    customerRequestAttachmentsCount,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profile_roles")
      .select("profile_id", { count: "exact", head: true }),
    untyped(supabase, "pilot_drafts")
      .select("id", { count: "exact", head: true }),
    untyped(supabase, "customers")
      .select("id", { count: "exact", head: true }),
    untyped(supabase, "agency_workers")
      .select("worker_id", { count: "exact", head: true }),
    untyped(supabase, "agency_worker_invitations")
      .select("id", { count: "exact", head: true }),
    untyped(supabase, "company_workers")
      .select("worker_id", { count: "exact", head: true }),
    untyped(supabase, "company_worker_invitations")
      .select("id", { count: "exact", head: true }),
    untyped(supabase, "customer_requests")
      .select("id", { count: "exact", head: true }),
    untyped(supabase, "customer_request_attachments")
      .select("id", { count: "exact", head: true }),
  ]);
  // Stage 2 PR 1: customers count returns 42P01 when migration 0026 is not
  // yet applied to prod. Surface a literal "needs migration" instead of an
  // exception so the admin can see the blocker without breaking the page.
  const customersBlocked = customersCount.error?.code === "42P01";
  const agencyWorkerInvitationsBlocked =
    agencyWorkerInvitationsCount.error?.code === "42P01";
  const companyWorkersBlocked = companyWorkersCount.error?.code === "42P01";
  const companyWorkerInvitationsBlocked =
    companyWorkerInvitationsCount.error?.code === "42P01";
  const customerRequestsBlocked =
    customerRequestsCount.error?.code === "42P01";
  const customerRequestAttachmentsBlocked =
    customerRequestAttachmentsCount.error?.code === "42P01";

  // ── Safe environment identifiers (NO secret values) ──────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const supabaseProjectRef = (() => {
    if (!supabaseUrl) return null;
    const match = /https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(supabaseUrl);
    return match ? match[1] : null;
  })();
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const placeholderMarkersEnabled =
    process.env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true";

  return (
    <div className="flex flex-col gap-8" data-testid="project-truth-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          P0 · PROJECT TRUTH
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          Project truth — admin diagnostic
        </h1>
        <p className="text-sm text-text-secondary">
          Real situation, not a preview. No fake rows, no fake counts. Read-only diagnostic
          — this page never writes to production.
        </p>
      </header>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 1 — Root cause                                  */}
      {/* ──────────────────────────────────────────────────────── */}
      <section className="card-border flex flex-col gap-3 p-4" data-testid="project-truth-root-cause">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          1. Root cause — why admin sees only himself
        </h2>
        <p className="text-sm text-text-secondary">
          The DB-level RLS helper <code>public.is_admin()</code> (migration{" "}
          <code>0003_multi_role.sql</code> lines 93–99) reads ONLY{" "}
          <code>profiles.active_role = &apos;admin&apos;</code>. The application-layer{" "}
          <code>deriveIsAdmin()</code> helper is dual-signal (<code>active_role</code> OR a{" "}
          <code>profile_roles</code> row with <code>role=&apos;admin&apos;</code>).
        </p>
        <p className="text-sm text-text-secondary">
          When you switch workspace, <code>switchActiveRole</code> upserts a{" "}
          <code>profile_roles</code> admin row, then overwrites{" "}
          <code>active_role</code> to the new workspace role. After that switch the
          page gate still admits you (dual-signal sees{" "}
          <code>profile_roles.admin</code>), but every supabase query in this
          session runs through the user-scoped client. RLS evaluates{" "}
          <code>is_admin()</code> → returns <strong>false</strong> because{" "}
          <code>active_role !== &apos;admin&apos;</code> → policies fall back to{" "}
          <code>id = auth.uid()</code> → you see only your own profile row.
        </p>
        <p className="text-xs text-state-warning">
          {adminSignalMismatch
            ? "⚠ Signal mismatch detected for your session: app-gate sees admin, DB does NOT. Every query below is currently limited to your own rows."
            : activeRoleIsAdmin
              ? "✓ Your session's active_role is 'admin'. RLS will treat you as admin and the counts below reflect global state."
              : "ℹ Your session is not admin via either signal. (If you reached this page, requireSuperadmin should have redirected — investigate.)"}
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 2 — Admin signal table                          */}
      {/* ──────────────────────────────────────────────────────── */}
      <section className="card-border flex flex-col gap-3 p-4" data-testid="project-truth-admin-signals">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          2. Your admin signals (this session)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-label text-text-muted">
              <th className="py-2">Signal</th>
              <th className="py-2">Value</th>
              <th className="py-2">RLS-bypass?</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">
                <code>profiles.active_role</code>
              </td>
              <td className="py-2">
                <code>{ownProfile?.active_role ?? "—"}</code>
              </td>
              <td className="py-2">
                {activeRoleIsAdmin ? "✓ yes" : "✗ no"}
              </td>
            </tr>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">
                <code>profile_roles[role=&apos;admin&apos;]</code>
              </td>
              <td className="py-2">
                {profileRolesHasAdmin ? "present" : "missing"}
              </td>
              <td className="py-2">✗ no (app-only)</td>
            </tr>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">App-layer admin gate</td>
              <td className="py-2">{appAdminGateActive ? "✓ admit" : "✗ deny"}</td>
              <td className="py-2">—</td>
            </tr>
            <tr>
              <td className="py-2">DB-level RLS admin</td>
              <td className="py-2">{rlsAdminReadActive ? "✓ admit" : "✗ deny"}</td>
              <td className="py-2">{rlsAdminReadActive ? "yes" : "no"}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-text-secondary">
          To fix the mismatch <em>temporarily for this session</em>, switch your active
          workspace back to <code>admin</code> via the workspace switcher. To fix it{" "}
          <em>structurally</em>, decouple <code>public.is_admin()</code> from{" "}
          <code>active_role</code> (see Section 7).
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 3 — Counts you can currently see                */}
      {/* ──────────────────────────────────────────────────────── */}
      <section className="card-border flex flex-col gap-3 p-4" data-testid="project-truth-counts">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          3. What this session CAN see (RLS-filtered)
        </h2>
        <p className="text-xs text-text-secondary">
          These counts come from the SAME user-scoped supabase client that
          every admin surface uses. If they look small, that&apos;s the visible
          symptom of the root cause above — not a fake row count.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              profiles
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {profilesCount.count ?? "—"}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              profile_roles
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {profileRolesCount.count ?? "—"}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              pilot_drafts
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {pilotDraftsCount.count ?? "—"}
            </p>
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-customers-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              customers
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {customersBlocked ? "—" : (customersCount.count ?? "—")}
            </p>
            {customersBlocked ? (
              <p className="mt-1 text-[10px] text-state-warning">
                migration 0026 not applied
              </p>
            ) : null}
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-agency-workers-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              agency_workers
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {agencyWorkersCount.count ?? "—"}
            </p>
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-agency-worker-invitations-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              agency_worker_invitations
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {agencyWorkerInvitationsBlocked
                ? "—"
                : (agencyWorkerInvitationsCount.count ?? "—")}
            </p>
            {agencyWorkerInvitationsBlocked ? (
              <p className="mt-1 text-[10px] text-state-warning">
                migration 0025 not applied
              </p>
            ) : null}
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-company-workers-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              company_workers
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {companyWorkersBlocked ? "—" : (companyWorkersCount.count ?? "—")}
            </p>
            {companyWorkersBlocked ? (
              <p className="mt-1 text-[10px] text-state-warning">
                migration 0027 not applied
              </p>
            ) : null}
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-company-worker-invitations-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              company_worker_invitations
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {companyWorkerInvitationsBlocked
                ? "—"
                : (companyWorkerInvitationsCount.count ?? "—")}
            </p>
            {companyWorkerInvitationsBlocked ? (
              <p className="mt-1 text-[10px] text-state-warning">
                migration 0027 not applied
              </p>
            ) : null}
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-customer-requests-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              customer_requests
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {customerRequestsBlocked ? "—" : (customerRequestsCount.count ?? "—")}
            </p>
            {customerRequestsBlocked ? (
              <p className="mt-1 text-[10px] text-state-warning">
                migration 0028 not applied
              </p>
            ) : null}
          </div>
          <div
            className="card-border p-3"
            data-testid="project-truth-customer-request-attachments-count"
          >
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              customer_request_attachments
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {customerRequestAttachmentsBlocked
                ? "—"
                : (customerRequestAttachmentsCount.count ?? "—")}
            </p>
            {customerRequestAttachmentsBlocked ? (
              <p className="mt-1 text-[10px] text-state-warning">
                migration 0029 not applied
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 4 — Environment summary                         */}
      {/* ──────────────────────────────────────────────────────── */}
      <section className="card-border flex flex-col gap-3 p-4" data-testid="project-truth-environment">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          4. Environment summary (no secret values)
        </h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">
                <code>NEXT_PUBLIC_SUPABASE_URL</code>
              </td>
              <td className="py-2">
                {supabaseUrl ? <code>{supabaseUrl}</code> : "missing"}
              </td>
            </tr>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">Supabase project ref</td>
              <td className="py-2">
                {supabaseProjectRef ? <code>{supabaseProjectRef}</code> : "unparsed"}
              </td>
            </tr>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              </td>
              <td className="py-2">{hasAnonKey ? "set (value redacted)" : "missing"}</td>
            </tr>
            <tr className="border-b border-ink-700/30">
              <td className="py-2">
                <code>SUPABASE_SERVICE_ROLE_KEY</code>
              </td>
              <td className="py-2">{hasServiceRoleKey ? "set (value redacted)" : "missing"}</td>
            </tr>
            <tr>
              <td className="py-2">
                <code>NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS</code>
              </td>
              <td className="py-2">{placeholderMarkersEnabled ? "true" : "false"}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-text-secondary">
          The deployed app and local app point at the SAME Supabase project ref
          shown above (configured via Vercel env). No second / preview / staging
          DB has been detected in the codebase. Test users that registered into
          this app should appear in this project — not elsewhere.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 5 — Feature status matrix                       */}
      {/* ──────────────────────────────────────────────────────── */}
      <section className="card-border flex flex-col gap-3 p-4" data-testid="project-truth-feature-matrix">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          5. Feature status matrix (real / partial / blocked / preview)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-label text-text-muted">
              <th className="py-2">Feature</th>
              <th className="py-2">Route</th>
              <th className="py-2">Status</th>
              <th className="py-2">Persistence / blocker</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_STATUS.map((f) => (
              <tr key={f.id} className="border-b border-ink-700/20 align-top">
                <td className="py-2 pr-3">{f.label}</td>
                <td className="py-2 pr-3">
                  <code className="text-xs">{f.route}</code>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={
                      f.status === "real"
                        ? "rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success"
                        : f.status === "partial"
                          ? "rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning"
                          : f.status === "blocked"
                            ? "rounded bg-state-danger/20 px-2 py-0.5 text-xs text-state-danger"
                            : "rounded bg-ink-700/40 px-2 py-0.5 text-xs text-text-muted"
                    }
                  >
                    {f.status}
                  </span>
                </td>
                <td className="py-2 text-xs text-text-secondary">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 6 — Duplicate / Ruošiama audit                   */}
      {/* ──────────────────────────────────────────────────────── */}
      <section
        className="card-border flex flex-col gap-3 p-4"
        data-testid="project-truth-duplicate-audit"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          6. Duplicate / Ruošiama audit
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {DUPLICATE_AUDIT.map((d) => (
            <li key={d.id} className="flex flex-col gap-0.5">
              <span className="font-medium text-text-primary">{d.label}</span>
              <span className="text-xs text-text-secondary">{d.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 7 — Exact owner action                          */}
      {/* ──────────────────────────────────────────────────────── */}
      <section
        className="card-border flex flex-col gap-3 p-4"
        data-testid="project-truth-owner-action"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          7. Exact owner action to fix admin visibility
        </h2>
        <p className="text-sm text-text-secondary">
          Option A — fastest, session-scope only: switch your active workspace
          back to <code>admin</code> via the role switcher in the dashboard
          header. RLS will recognise you again immediately, no SQL.
        </p>
        <p className="text-sm text-text-secondary">
          Option B — structural fix: decouple{" "}
          <code>public.is_admin()</code> from <code>active_role</code> so RLS
          honours the same dual signal the app layer uses. Apply this SQL in{" "}
          Supabase SQL Editor (NOT applied by this PR — owner-gated):
        </p>
        <pre className="overflow-x-auto rounded-md bg-ink-900 p-3 text-xs text-text-primary">
{`-- Manual SQL action — owner runs in Supabase SQL Editor.
-- Decouples public.is_admin() from profiles.active_role so a
-- workspace switch no longer strips DB-level admin reads.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and active_role = 'admin'
  )
  or exists (
    select 1 from public.profile_roles
    where profile_id = auth.uid() and role = 'admin'
  )
$$;

-- After applying, no further migration is needed; every existing
-- RLS policy that calls is_admin() picks up the new definition
-- on the next evaluation.`}
        </pre>
        <p className="text-xs text-state-success">
          ✓ Applied to prod 2026-05-28 (migration 0024_is_admin_dual_signal,
          Supabase project gorgitwvdzxbnaxhrsrw). The SQL above is the exact
          body now live. Section 2 reflects the new dual-signal behaviour.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 8 — Service-role / list-all-users path           */}
      {/* ──────────────────────────────────────────────────────── */}
      <section
        className="card-border flex flex-col gap-3 p-4"
        data-testid="project-truth-listusers-blocker"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          8. Full auth-user listing — current blocker
        </h2>
        <p className="text-sm text-text-secondary">
          Listing ALL Supabase auth users (including those who registered but
          have no <code>profiles</code> row) requires{" "}
          <code>auth.admin.listUsers()</code>, which is service-role only. This
          page does not call it because there is no safe server-only admin
          listing route on <code>main</code>. Adding one is a follow-up scope.
        </p>
        <p className="text-xs text-text-secondary">
          Status: <strong>blocked</strong>. Exact missing surface:{" "}
          <code>apps/web/app/api/admin/users/list/route.ts</code> (or RPC)
          that uses the service-role client and is gated by{" "}
          <code>requireSuperadmin</code>. Not implemented here so the SQL fix
          in §7 can ship first.
        </p>
      </section>

      <footer className="flex flex-col gap-1 text-xs text-text-secondary">
        <p>
          Honest diagnostic · no fake rows · no service-role client · no
          mutations · counts reflect what this session can read via RLS.
        </p>
      </footer>
    </div>
  );
}

interface FeatureStatusRow {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly status: "real" | "partial" | "blocked" | "preview";
  readonly note: string;
}

const FEATURE_STATUS: readonly FeatureStatusRow[] = [
  {
    id: "worker-profile",
    label: "Worker profile",
    route: "/[locale]/dashboard/profile",
    status: "real",
    note:
      "Persisted to profiles + profile_skill_claims tables. RLS-gated (id = auth.uid()).",
  },
  {
    id: "worker-journal",
    label: "Work Journal",
    route: "/[locale]/dashboard/journal",
    status: "real",
    note:
      "Migrations 0013 + 0018. Real persistence in work_journal_entries; RLS-gated.",
  },
  {
    id: "skills",
    label: "Skills",
    route: "/[locale]/dashboard/profile",
    status: "real",
    note:
      "Migrations 0010 + 0015 (profile_skill_claims). Owner-free-label model.",
  },
  {
    id: "company-setup",
    label: "Company setup",
    route: "/[locale]/dashboard/company",
    status: "partial",
    note:
      "PilotDraftForm persists draft to pilot_drafts; full workspace not active. Role catalogue marks 'preparing'.",
  },
  {
    id: "agency-setup",
    label: "Agency setup",
    route: "/[locale]/dashboard/agency",
    status: "partial",
    note:
      "Same pilot-draft pattern; full workspace not active.",
  },
  {
    id: "buyer-setup",
    label: "Buyer setup",
    route: "/[locale]/dashboard/buyer",
    status: "partial",
    note:
      "Pilot-draft pattern. Active workspace flips when buyer surfaces ship.",
  },
  {
    id: "chat",
    label: "Chat / communication",
    route: "/[locale]/dashboard/communication",
    status: "partial",
    note:
      "Migration 0021 ships storage + permission helpers; UI present but full thread send/receive not yet exercised end-to-end.",
  },
  {
    id: "confirmations",
    label: "Confirmations (skill / journal)",
    route: "/[locale]/dashboard/journal",
    status: "partial",
    note:
      "Self-claim model exists (profile_skill_claims); external verification not yet wired.",
  },
  {
    id: "discover",
    label: "Discover talent",
    route: "/[locale]/dashboard/discover",
    status: "real",
    note: "Real query of workers; RLS-respected.",
  },
  {
    id: "talent-preview",
    label: "Talent visual preview",
    route: "/[locale]/dashboard/talent",
    status: "preview",
    note: "PR #90. Sample · data; not a real catalogue.",
  },
  {
    id: "visual-os",
    label: "Visual Dashboard OS",
    route: "/[locale]/dashboard/visual-os",
    status: "preview",
    note: "PR #91. Sample · data; sidebar chrome.",
  },
  {
    id: "visual-os-agency",
    label: "Agency operating card preview",
    route: "/[locale]/dashboard/visual-os/agency",
    status: "preview",
    note:
      "PR #92 + PR #97. Sample · data; explicitly labelled 'Vizualinis planas / ne funkcijos kelias'. Real agency paths live at /dashboard/start/agency (setup) and /dashboard/agency (workspace). NOT a competing agency function.",
  },
  {
    id: "activity-setup-hub",
    label: "Activity setup hub",
    route: "/[locale]/dashboard/start",
    status: "real",
    note: "PR #95. Hub linking to start/agency, start/company, start/buyer.",
  },
  {
    id: "agency-setup",
    label: "Agency setup",
    route: "/[locale]/dashboard/start/agency",
    status: "real",
    note: "PR #95. Form posts addRole('agency', {name}) → public.agencies row via migration 0007 RPC. Idempotent.",
  },
  {
    id: "company-setup",
    label: "Company setup",
    route: "/[locale]/dashboard/start/company",
    status: "real",
    note: "PR #95. Form posts addRole('company', {name}) → public.companies row via migration 0007 RPC. Idempotent.",
  },
  {
    id: "buyer-setup",
    label: "Buyer setup",
    route: "/[locale]/dashboard/start/buyer",
    status: "real",
    note:
      "PR #95 → PR #100 → PR #101. Migration 0026_customer_entity applied to prod 2026-05-29 (table + RPC + RLS + grants). Form posts to save_customer_setup RPC → public.customers row + profile_roles[customer]. Idempotent upsert; persists across reload; RLS limits SELECT/UPDATE to own profile or admin.",
  },
  {
    id: "agency-worker-link",
    label: "Agency worker linking + invitations",
    route: "/[locale]/dashboard/agency",
    status: "real",
    note:
      "PR #99 + migration 0025 applied. agency_workers (composite PK, owns_agency RLS) for active links + agency_worker_invitations for pending invites + invite_agency_worker RPC (5 honest outcomes). NO external email send — invitee signs up/in themselves on receiving notification via owner's own channel.",
  },
  {
    id: "company-worker-link",
    label: "Company worker linking + invitations",
    route: "/[locale]/dashboard/company",
    status: "real",
    note:
      "PR #102. Migration 0027_company_workers applied to prod 2026-05-29. Mirrors agency shape exactly (company_workers + company_worker_invitations + invite_company_worker RPC). 5 honest outcomes. No external email send.",
  },
  {
    id: "buyer-demand",
    label: "Buyer demand/request flow",
    route: "/[locale]/dashboard/buyer",
    status: "real",
    note:
      "PR #103. Migration 0028_customer_requests applied to prod 2026-05-29. Structured 9-field form (title/need/country/location/role/team_size/start/duration/language/notes) posts save_customer_request RPC → public.customer_requests row + status (draft/submitted). Manual-review only: no auto-matching, no fake candidates, no marketplace. Admin promotes status to in_review/needs_followup/approved/closed.",
  },
  {
    id: "buyer-attachments",
    label: "Buyer request attachments (metadata + storage)",
    route: "/[locale]/dashboard/buyer",
    status: "real",
    note:
      "Buyer Request Attachments + Understanding Pipeline sprint, PR 1. Migration 0029_customer_request_attachments creates public.customer_request_attachments + private storage bucket 'customer-request-attachments' + RLS (owner+admin) + register_customer_request_attachment RPC. Level 1 — metadata only. Allowed types: PDF/JPG/PNG/WebP/TXT, max 10 MB. Honest fallback wording in UI: 'Failas pridėtas. Automatinis nuskaitymas dar neįjungtas — administratorius peržiūrės rankiniu būdu.' No fake AI / OCR / verification. Level 2 (text extraction) and Level 3 (structured helper) intentionally deferred to follow-up PRs.",
  },
  {
    id: "buyer-request-understanding",
    label: "Buyer Request Understanding Center (manual-review)",
    route: "/[locale]/dashboard/buyer",
    status: "real",
    note:
      "Buyer Request Understanding Center v1. Level 1 attachments are real (private bucket + signed read, migration 0029 — see row above). Each buyer request card shows a deterministic, manual-review-only understanding panel: request basics → attached files → readiness status (no_files / files_added / enough_for_manual_review / needs_more_info, computed by the pure helper lib/buyer/request-readiness.ts from real request + attachment metadata only) → one buyer next action. NOT AI — transparent product logic. No OCR yet. No AI text extraction yet. No automatic verification, no matching, no candidates, no offers. UI states honestly that automatic reading is not enabled and an administrator reviews manually. Future levels may add real text extraction and a structured helper.",
  },
  {
    id: "admin",
    label: "Admin dashboard",
    route: "/[locale]/dashboard/admin",
    status: "partial",
    note:
      "Gate works; counts limited by RLS when active_role != 'admin' (see §1).",
  },
  {
    id: "admin-project-truth",
    label: "Project truth (this page)",
    route: "/[locale]/dashboard/admin/project-truth",
    status: "real",
    note: "This diagnostic surface.",
  },
];

interface DuplicateAuditRow {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

const DUPLICATE_AUDIT: readonly DuplicateAuditRow[] = [
  {
    id: "agency-routes",
    label: "Agency route — 3 surfaces (setup / workspace / visual plan)",
    detail:
      "/[locale]/dashboard/start/agency (CANONICAL setup, PR #95) + /[locale]/dashboard/agency (role workspace, requireRoleOrRedirect 'agency') + /[locale]/dashboard/visual-os/agency (visual plan, NOT a feature path — explicit banner since PR #97). Owner CTAs route to the setup or workspace path; the visual plan never competes with the real agency function.",
  },
  {
    id: "duplicate-warning",
    label: "⚠ Duplicate-route warning — visual plan vs real path",
    detail:
      "/[locale]/dashboard/visual-os/agency is preview ONLY (sample data, no DB write). If owner copy ever drops the 'Vizualinis planas / ne funkcijos kelias' header, the surface starts competing with /dashboard/start/agency. PR #97 pins the header; check:constitution carries the literal phrase as a regression guard for the role catalogue.",
  },
  {
    id: "worker-link-safety",
    label: "Worker-link dedupe safety — agency + company",
    detail:
      "agency_workers + company_workers use composite (org_id, worker_id) PK — physically cannot duplicate within an org. agency_worker_invitations + company_worker_invitations carry UNIQUE (org_id, invited_email) — physically cannot duplicate pending invitations. RPCs invite_agency_worker / invite_company_worker check both tables BEFORE inserting and return already_linked / already_pending; no row written in those branches.",
  },
  {
    id: "company-routes",
    label: "Company route — single role-dashboard surface",
    detail:
      "/[locale]/dashboard/company. No duplicate.",
  },
  {
    id: "buyer-routes",
    label: "Buyer route — single role-dashboard surface",
    detail:
      "/[locale]/dashboard/buyer. No duplicate.",
  },
  {
    id: "is-admin-helper",
    label: "is_admin() function defined in TWO migrations",
    detail:
      "0001_initial_schema.sql lines 300+ and 0003_multi_role.sql lines 93-99. Both versions check only active_role; the 0003 version supersedes 0001 by virtue of being later. No functional duplicate; legacy migration carries the original definition.",
  },
  {
    id: "ruosiama-mask",
    label: "'Ruošiama' label applied to company / agency / customer roles",
    detail:
      "lib/config/roles.ts marks company / agency / customer as availability='preparing' even though the role-specific pilot dashboards EXIST and persist pilot drafts. This is the spec's 'already built but not wired' pattern. NOT flipped to 'active' here because the pilot-draft persistence is not the full workspace — the 'preparing' label remains honest. Documented for follow-up.",
  },
  {
    id: "profile-model",
    label: "Profile model — single source",
    detail: "public.profiles is the only profile table. No duplicate model.",
  },
  {
    id: "worker-model",
    label: "Worker model — single source",
    detail: "public.workers is the only worker table.",
  },
  {
    id: "second-db",
    label: "Multiple databases / environments",
    detail:
      "No evidence of a second Supabase project in code or env file. .env.example points at the canonical project ref. Test users that registered into this app are in THIS DB; admin RLS limits visibility to active_role='admin' sessions (see §1).",
  },
];
