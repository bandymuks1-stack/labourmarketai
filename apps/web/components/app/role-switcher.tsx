"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import {
  ROLE_BY_ID,
  roleStatusChipKey,
  roleSwitcherTargetForRole,
  baseIdentityForRole,
  baseIdentityLabelKey,
  BASE_IDENTITY_ORDER,
  BASE_IDENTITY_PRIMARY_ROLE,
  type BaseIdentity,
  type LabourMarketRoleId,
} from "@/lib/config/roles";
import { usePopoverDismiss } from "@/lib/hooks/use-popover-dismiss";
import { shouldOfferOrganizationSwitch } from "@/lib/company/organization-switch";
import { cn } from "@/lib/utils";
import { RoleIcon } from "@/components/app/role-icon";
import { Building2, Settings } from "lucide-react";

/** Authenticated-header role switcher. Always visible (even for users with
 *  one role) so adding a second role stays discoverable (PV §15).
 *  Non-worker roles route to the pilot cockpit today (not a full management
 *  surface) — we tag them honestly with "Ruošiama" so the user is not
 *  misled into expecting full feature parity. */
export function RoleSwitcher() {
  const tSwitcher = useTranslations("auth.roleSwitcher");
  const tAccount = useTranslations("auth.dashboard.account");
  const tCompanySwitcher = useTranslations("companySwitcher");
  const {
    roles,
    activeRole,
    adminUiHidden,
    activeOrgName,
    organizations,
    activeOrganizationId,
    switchRole,
    addRole,
    switchOrganization,
    isAdmin,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | null>(null);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);

  // Same dismiss contract as the notification panel (owner smoke fix):
  // close on route change / outside click / Escape.
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, close, rootRef);

  // systemic-ux-roles-v1: the switcher renders BASE IDENTITIES (Asmuo /
  // Įmonė), not raw `profile_roles` values. "Agentūra" / "Pirkėjas" are
  // company ACTIONS, not top-level identities, so they fold into the Įmonė
  // identity instead of appearing as peer switchable spaces. The legacy
  // 4-role DB enum is untouched — `roleForIdentity` resolves each identity
  // back to the concrete role the backend accepts.
  const heldIdentitySet = new Set<BaseIdentity>();
  for (const r of roles) {
    const id = baseIdentityForRole(r);
    if (id) heldIdentitySet.add(id);
  }
  const heldIdentities = BASE_IDENTITY_ORDER.filter((i) => heldIdentitySet.has(i));
  const missingIdentities = BASE_IDENTITY_ORDER.filter((i) => !heldIdentitySet.has(i));
  const activeIdentity = activeRole ? baseIdentityForRole(activeRole) : null;

  /** Concrete role to switch to for a base identity — the canonical primary
   *  (worker / company) when held, else any held role that maps to it
   *  (e.g. a legacy agency/customer holder switching to Įmonė). */
  function roleForIdentity(identity: BaseIdentity): Role | null {
    const primary = BASE_IDENTITY_PRIMARY_ROLE[identity];
    if (roles.includes(primary)) return primary;
    const fallback = roles.find((r) => baseIdentityForRole(r) === identity);
    return (fallback as Role) ?? null;
  }

  async function pick(r: Role) {
    if (r === activeRole) {
      setOpen(false);
      return;
    }
    setPending(r);
    try {
      if (roles.includes(r)) await switchRole(r);
      else await addRole(r);
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  // Company architecture v1: the org list arrives ONLY when the server
  // resolved a real multi-company membership set AND the active-org pointer
  // can persist (owner-gated migration applied). Single-company / unapplied
  // states pass an empty list → no switcher chrome at all (honest absence).
  const switchableOrganizations = organizations ?? [];
  const offerOrganizationSwitch =
    shouldOfferOrganizationSwitch(switchableOrganizations);

  async function pickOrganization(orgId: string) {
    if (orgId === activeOrganizationId) {
      setOpen(false);
      return;
    }
    setPendingOrgId(orgId);
    try {
      await switchOrganization(orgId);
    } finally {
      setPendingOrgId(null);
      setOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Admin badge — rendered ONLY when the server resolved
          profiles.active_role === 'admin'. Lives OUTSIDE the workspace
          role switcher dropdown so the user never sees an admin chip
          mixed in with worker/company/agency/customer chips, and so
          the workspace switcher's user-facing UX is untouched.
          Clicking the badge navigates to the pilot panel. */}
      {/* F5 icon-first header: the admin entry is an icon badge with a
          tooltip + accessible label — never a shouting text pill. */}
      {isAdmin && !adminUiHidden && (
        <Link
          href="/dashboard/admin"
          aria-label={tSwitcher("adminPanelLink")}
          title={tSwitcher("adminMode")}
          data-testid="role-switcher-admin-badge"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:border-brand-orange"
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Link>
      )}

      <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={tSwitcher("label")}
        data-testid="role-switcher-toggle"
        className="inline-flex shrink-0 items-center gap-2 rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary hover:border-brand-blue sm:px-3"
      >
        {activeRole ? (
          <RoleIcon role={activeRole} className="h-4 w-4" />
        ) : (
          <span aria-hidden>•</span>
        )}
        {activeIdentity === "company" && activeOrgName ? (
          // Truthful active-company name (a proper noun → not the mono/uppercase
          // identity-chip styling) so the user sees WHICH organization is live,
          // visually distinct from the person identity. Falls back to the
          // generic identity label when no real company name exists.
          <span
            className="hidden max-w-[12rem] truncate text-basis font-semibold text-text-primary sm:inline"
            data-testid="role-switcher-active-org"
          >
            {activeOrgName}
          </span>
        ) : (
          // F5 icon-first header: a short human word next to the identity
          // icon — not an uppercase mono sentence-pill.
          <span className="hidden text-basis font-medium text-text-secondary sm:inline">
            {activeIdentity ? tSwitcher(baseIdentityLabelKey(activeIdentity)) : tSwitcher("label")}
          </span>
        )}
        <span aria-hidden className="text-text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-md border border-ink-500 bg-ink-900/95 p-2 shadow-card"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {tSwitcher("label")}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label={tSwitcher("label")}
              data-testid="role-switcher-close"
              className="rounded-md border border-ink-500 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              ✕
            </button>
          </div>
          {/* Phase 6: honest non-locking framing right inside the menu so the
              user never wonders what RUOŠIAMA means. */}
          <p className="px-2 pb-2 text-meta leading-snug text-text-secondary">
            {tAccount("rolesIntro")}
          </p>
          {/* SR-2: pre-role-switch clarity — workspace view vs account
              identity; org-context expectation. */}
          <p className="px-2 pb-2 text-meta leading-snug text-text-muted">
            {tSwitcher("clarityNote")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {heldIdentities.map((identity) => {
              // Each switchable entry is a BASE IDENTITY (Asmuo / Įmonė).
              // The status chip reflects the identity's canonical role
              // availability, read through the shared roleStatusChipKey
              // helper so the header + dashboard catalogue stay in lock-step.
              const primary = BASE_IDENTITY_PRIMARY_ROLE[identity];
              const target = roleForIdentity(identity);
              const cfg = ROLE_BY_ID[primary as LabourMarketRoleId];
              const chipKey = cfg ? roleStatusChipKey(cfg.availability) : null;
              const isHonestlyActive = chipKey === "roles.status.active";
              const isActive = identity === activeIdentity;
              const chipTone = isHonestlyActive
                ? "border-state-success/40 text-state-success"
                : chipKey === "roles.status.start"
                  ? "border-brand-blue/40 text-brand-blue"
                  : "border-state-warning/40 text-state-warning";
              return (
                <li key={identity}>
                  <button
                    type="button"
                    onClick={() => target && pick(target)}
                    disabled={pending !== null || !target}
                    data-testid={`role-switcher-identity-${identity}`}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-ink-700",
                      isActive && "text-brand-blue",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <RoleIcon role={primary} className="h-4 w-4" />
                      {tSwitcher(baseIdentityLabelKey(identity))}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {chipKey && !isHonestlyActive && (
                        <span
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-mono text-meta uppercase tracking-label",
                            chipTone,
                          )}
                          data-testid={`role-switcher-chip-${identity}`}
                        >
                          {chipKey === "roles.status.start"
                            ? tSwitcher("chip_start")
                            : chipKey === "roles.status.partial"
                              ? tSwitcher("chip_partial")
                              : tAccount("preview_workspace")}
                        </span>
                      )}
                      {isActive && (
                        <span className="font-mono text-meta uppercase tracking-label text-state-live">
                          {tSwitcher("active_label")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Multi-company switching (company architecture v1): rendered
              ONLY for a real multi-company profile with a persistable
              server-side pointer — a single-company user never sees this
              block. Names are real organization rows (RLS-scoped), the
              active one is marked, switching updates
              profiles.active_organization_id then refreshes. */}
          {offerOrganizationSwitch && (
            <>
              <hr className="my-2 border-ink-600" />
              <p
                className="px-2 py-1 font-mono text-meta uppercase tracking-label text-text-muted"
                data-testid="org-switcher-heading"
              >
                {tCompanySwitcher("heading")}
              </p>
              <ul className="flex flex-col gap-0.5" data-testid="org-switcher-list">
                {switchableOrganizations.map((org) => {
                  const isActiveOrg = org.id === activeOrganizationId;
                  return (
                    <li key={org.id}>
                      <button
                        type="button"
                        onClick={() => pickOrganization(org.id)}
                        disabled={pendingOrgId !== null}
                        data-testid={`org-switcher-option-${org.id}`}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-ink-700",
                          isActiveOrg && "text-brand-blue",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Building2
                            className="h-4 w-4 shrink-0"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                          <span className="truncate">{org.name}</span>
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          {pendingOrgId === org.id ? (
                            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                              {tSwitcher("switching")}
                            </span>
                          ) : isActiveOrg ? (
                            <span className="font-mono text-meta uppercase tracking-label text-state-live">
                              {tSwitcher("active_label")}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="px-2 pb-1 pt-1 text-meta leading-snug text-text-muted">
                {tCompanySwitcher("note")}
              </p>
            </>
          )}

          {missingIdentities.length > 0 && (
            <>
              <hr className="my-2 border-ink-600" />
              <p className="px-2 py-1 font-mono text-meta uppercase tracking-label text-text-muted">
                {tSwitcher("add_role")}
              </p>
              <ul className="flex flex-col gap-0.5">
                {missingIdentities.map((identity) => {
                  const primary = BASE_IDENTITY_PRIMARY_ROLE[identity];
                  const cfg = ROLE_BY_ID[primary as LabourMarketRoleId];
                  const chipKey = cfg
                    ? roleStatusChipKey(cfg.availability)
                    : null;
                  const isHonestlyActive = chipKey === "roles.status.active";
                  const chipTone = isHonestlyActive
                    ? "border-state-success/40 text-state-success"
                    : chipKey === "roles.status.start"
                      ? "border-brand-blue/40 text-brand-blue"
                      : "border-state-warning/40 text-state-warning";
                  // Adding the Įmonė identity routes to the company setup
                  // form (roleSwitcherTargetForRole → setupRoute), never a
                  // blank-name addRole insert. The Asmuo identity has no
                  // setup form, so it falls back to addRole(worker).
                  const target = cfg
                    ? roleSwitcherTargetForRole(cfg, false)
                    : { kind: "switch" as const };
                  return (
                    <li key={identity}>
                      {target.kind === "navigate" ? (
                        <Link
                          href={target.route as "/dashboard"}
                          onClick={() => setOpen(false)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-secondary hover:bg-ink-700"
                          data-testid={`role-switcher-add-${identity}-link`}
                        >
                          <RoleIcon role={primary} className="h-4 w-4" />
                          {tSwitcher(baseIdentityLabelKey(identity))}
                          {chipKey && !isHonestlyActive && (
                            <span
                              className={cn(
                                "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-meta uppercase tracking-label",
                                chipTone,
                              )}
                              data-testid={`role-switcher-chip-add-${identity}`}
                            >
                              {chipKey === "roles.status.start"
                                ? tSwitcher("chip_start")
                                : chipKey === "roles.status.partial"
                                  ? tSwitcher("chip_partial")
                                  : tAccount("preview_workspace")}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => pick(primary as Role)}
                          disabled={pending !== null}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-secondary hover:bg-ink-700"
                        >
                          <RoleIcon role={primary} className="h-4 w-4" />
                          {tSwitcher(baseIdentityLabelKey(identity))}
                          {chipKey && !isHonestlyActive && (
                            <span
                              className={cn(
                                "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-meta uppercase tracking-label",
                                chipTone,
                              )}
                            >
                              {chipKey === "roles.status.start"
                                ? tSwitcher("chip_start")
                                : chipKey === "roles.status.partial"
                                  ? tSwitcher("chip_partial")
                                  : tAccount("preview_workspace")}
                            </span>
                          )}
                          {pending === primary && (
                            <span className="ml-auto font-mono text-meta uppercase tracking-label text-text-muted">
                              {tSwitcher("switching")}
                            </span>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
