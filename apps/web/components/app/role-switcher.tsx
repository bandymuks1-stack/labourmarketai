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
import { cn } from "@/lib/utils";
import { RoleIcon } from "@/components/app/role-icon";
import { Settings } from "lucide-react";

/** Authenticated-header role switcher. Always visible (even for users with
 *  one role) so adding a second role stays discoverable (PV §15).
 *  Non-worker roles route to the pilot cockpit today (not a full management
 *  surface) — we tag them honestly with "Ruošiama" so the user is not
 *  misled into expecting full feature parity. */
export function RoleSwitcher() {
  const tSwitcher = useTranslations("auth.roleSwitcher");
  const tAccount = useTranslations("auth.dashboard.account");
  const {
    roles,
    activeRole,
    adminUiHidden,
    activeOrgName,
    switchRole,
    addRole,
    isAdmin,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | null>(null);

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

  return (
    <div className="flex items-center gap-2">
      {/* Admin badge — rendered ONLY when the server resolved
          profiles.active_role === 'admin'. Lives OUTSIDE the workspace
          role switcher dropdown so the user never sees an admin chip
          mixed in with worker/company/agency/customer chips, and so
          the workspace switcher's user-facing UX is untouched.
          Clicking the badge navigates to the pilot panel. */}
      {isAdmin && !adminUiHidden && (
        <Link
          href="/dashboard/admin"
          aria-label={tSwitcher("adminPanelLink")}
          data-testid="role-switcher-admin-badge"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-2 py-1.5 text-sm font-semibold text-brand-orange hover:border-brand-orange sm:px-3"
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden font-mono text-[11px] uppercase tracking-label sm:inline">
            {tSwitcher("adminMode")}
          </span>
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
            className="hidden max-w-[12rem] truncate text-[13px] font-semibold text-text-primary sm:inline"
            data-testid="role-switcher-active-org"
          >
            {activeOrgName}
          </span>
        ) : (
          <span className="hidden font-mono text-[11px] uppercase tracking-label text-text-secondary sm:inline">
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
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {tSwitcher("label")}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label={tSwitcher("label")}
              data-testid="role-switcher-close"
              className="rounded-md border border-ink-500 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              ✕
            </button>
          </div>
          {/* Phase 6: honest non-locking framing right inside the menu so the
              user never wonders what RUOŠIAMA means. */}
          <p className="px-2 pb-2 text-[11px] leading-snug text-text-secondary">
            {tAccount("rolesIntro")}
          </p>
          {/* SR-2: pre-role-switch clarity — workspace view vs account
              identity; org-context expectation. */}
          <p className="px-2 pb-2 text-[11px] leading-snug text-text-muted">
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
                            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label",
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
                        <span className="font-mono text-[10px] uppercase tracking-label text-state-live">
                          {tSwitcher("active_label")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {missingIdentities.length > 0 && (
            <>
              <hr className="my-2 border-ink-600" />
              <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                                "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label",
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
                                "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label",
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
                            <span className="ml-auto font-mono text-[10px] uppercase tracking-label text-text-muted">
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
