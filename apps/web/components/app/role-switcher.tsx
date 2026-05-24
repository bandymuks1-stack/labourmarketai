"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import {
  LABOUR_MARKET_ROLES,
  ROLE_BY_ID,
  isLiveRoleId,
  type LabourMarketRoleId,
} from "@/lib/config/roles";
import { cn } from "@/lib/utils";

// Role catalogue + icons read from the central role config so adding a
// future role is a one-file change. Icons stay in this client component
// because they are pure presentation.
const ROLE_ICON: Record<Role, string> = {
  worker: "🔨",
  company: "🏗️",
  agency: "🤝",
  customer: "🛒",
};

/** Authenticated-header role switcher. Always visible (even for users with
 *  one role) so adding a second role stays discoverable (PV §15).
 *  Non-worker roles route to the pilot cockpit today (not a full management
 *  surface) — we tag them honestly with "Ruošiama" so the user is not
 *  misled into expecting full feature parity. */
export function RoleSwitcher() {
  const t = useTranslations("auth");
  const tSwitcher = useTranslations("auth.roleSwitcher");
  const tAccount = useTranslations("auth.dashboard.account");
  const { roles, activeRole, isAdmin, switchRole, addRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | null>(null);

  // Renderable roles come from the central config. We still constrain the
  // pick / addRole branches to the LIVE role ids (`worker`/`company`/
  // `agency`/`customer`) because those are the values the auth backend
  // accepts today; preparing FUTURE roles (freelancer, team_lead, …) are
  // intentionally `availability: "hidden"` and never reach this list.
  const liveRoleIds = LABOUR_MARKET_ROLES.filter(
    (r) => r.availability !== "hidden" && isLiveRoleId(r.id),
  ).map((r) => r.id as Role);
  const missing = liveRoleIds.filter((r) => !roles.includes(r));

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
      {isAdmin && (
        <Link
          href="/dashboard/admin"
          aria-label={tSwitcher("adminPanelLink")}
          data-testid="role-switcher-admin-badge"
          className="inline-flex items-center gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-sm font-semibold text-brand-orange hover:border-brand-orange"
        >
          <span aria-hidden>⚙</span>
          <span className="font-mono text-[11px] uppercase tracking-label">
            {tSwitcher("adminMode")}
          </span>
        </Link>
      )}

      <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={tSwitcher("label")}
        className="inline-flex items-center gap-2 rounded-md border border-ink-500 bg-ink-800 px-3 py-1.5 text-sm text-text-primary hover:border-brand-blue"
      >
        <span aria-hidden>{activeRole ? ROLE_ICON[activeRole] : "•"}</span>
        <span className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
          {activeRole ? t(`signup.role.${activeRole}`) : tSwitcher("label")}
        </span>
        <span aria-hidden className="text-text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-72 rounded-md border border-ink-500 bg-ink-900/95 p-2 shadow-card"
        >
          <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
            {tSwitcher("label")}
          </p>
          {/* Phase 6: honest non-locking framing right inside the menu so the
              user never wonders what RUOŠIAMA means. */}
          <p className="px-2 pb-2 text-[11px] leading-snug text-text-secondary">
            {tAccount("rolesIntro")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {roles.map((r) => {
              // Single source for "is this role preparing?" — the catalogue.
              const cfg = ROLE_BY_ID[r as LabourMarketRoleId];
              const isPreview = cfg?.availability !== "active";
              return (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    disabled={pending !== null}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-ink-700",
                      r === activeRole && "text-brand-blue",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{ROLE_ICON[r]}</span>
                      {t(`signup.role.${r}`)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {isPreview && (
                        <span className="rounded-sm border border-state-warning/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-state-warning">
                          {tAccount("preview_workspace")}
                        </span>
                      )}
                      {r === activeRole && (
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

          {missing.length > 0 && (
            <>
              <hr className="my-2 border-ink-600" />
              <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
                {tSwitcher("add_role")}
              </p>
              <ul className="flex flex-col gap-0.5">
                {missing.map((r) => {
                  const cfg = ROLE_BY_ID[r as LabourMarketRoleId];
                  const isPreview = cfg?.availability !== "active";
                  return (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => pick(r)}
                        disabled={pending !== null}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-secondary hover:bg-ink-700"
                      >
                        <span aria-hidden>{ROLE_ICON[r]}</span>
                        {t(`signup.role.${r}`)}
                        {isPreview && (
                          <span className="ml-auto rounded-sm border border-state-warning/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label text-state-warning">
                            {tAccount("preview_workspace")}
                          </span>
                        )}
                        {pending === r && (
                          <span className="ml-auto font-mono text-[10px] uppercase tracking-label text-text-muted">
                            {tSwitcher("switching")}
                          </span>
                        )}
                      </button>
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
